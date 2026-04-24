use serde::Serialize;
use std::ffi::OsString;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Window};

const CLUSTER_NAME: &str = "cto-app";
const KIND_CONTEXT: &str = "kind-cto-app";
const INGRESS_NGINX_KIND_URL: &str =
    "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.14.3/deploy/static/provider/kind/deploy.yaml";
const ARGOCD_INSTALL_URL: &str =
    "https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapProgress {
    stage: String,
    message: String,
    progress: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    name: String,
    found: bool,
    path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapReport {
    os: String,
    arch: String,
    runtime: String,
    cluster: String,
    tools: Vec<ToolStatus>,
}

type BootstrapResult<T> = Result<T, String>;

#[tauri::command]
pub async fn bootstrap_local_stack(window: Window) -> BootstrapResult<BootstrapReport> {
    tracing::info!("bootstrap_local_stack invoked");
    emit(&window, "runtime", "Detecting container runtime...", 5);
    ensure_runtime_tool_paths_on_process();

    let runtime = ensure_container_runtime(&window).await?;

    emit(&window, "dependencies", "Installing dependencies...", 16);
    ensure_host_tools(&window).await?;

    emit(&window, "cluster", "Starting local Kubernetes...", 32);
    ensure_kind_cluster()?;

    emit(&window, "ingress", "Configuring ingress...", 52);
    apply_remote_manifest(INGRESS_NGINX_KIND_URL).await?;
    wait_for_rollout(
        "ingress-nginx",
        "deployment/ingress-nginx-controller",
        "240s",
    )?;

    emit(&window, "gitops", "Starting GitOps controller...", 68);
    ensure_namespace("argocd")?;
    apply_remote_manifest_in_namespace(ARGOCD_INSTALL_URL, "argocd").await?;
    wait_for_crd("applications.argoproj.io", "120s")?;
    wait_for_crd("appprojects.argoproj.io", "120s")?;
    wait_for_rollout("argocd", "deployment/argocd-server", "300s")?;
    wait_for_rollout("argocd", "deployment/argocd-repo-server", "300s")?;
    wait_for_rollout(
        "argocd",
        "deployment/argocd-applicationset-controller",
        "300s",
    )?;
    wait_for_rollout(
        "argocd",
        "statefulset/argocd-application-controller",
        "300s",
    )?;

    emit(&window, "tools", "Registering platform tools...", 86);
    apply_manifest(PLATFORM_TOOLS_MANIFEST)?;

    emit(&window, "ready", "Launching Codex App...", 100);

    Ok(BootstrapReport {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        runtime,
        cluster: CLUSTER_NAME.to_string(),
        tools: current_tool_statuses(),
    })
}

#[tauri::command]
pub fn bootstrap_probe() -> BootstrapReport {
    BootstrapReport {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        runtime: if docker_available() {
            "Docker-compatible runtime".to_string()
        } else {
            "Unavailable".to_string()
        },
        cluster: CLUSTER_NAME.to_string(),
        tools: current_tool_statuses(),
    }
}

fn emit(window: &Window, stage: &str, message: &str, progress: u8) {
    let _ = window.emit(
        "local-stack-progress",
        BootstrapProgress {
            stage: stage.to_string(),
            message: message.to_string(),
            progress,
        },
    );
}

fn current_tool_statuses() -> Vec<ToolStatus> {
    ["docker", "kind", "kubectl", "helm", "argocd"]
        .iter()
        .map(|name| {
            let path = find_tool_binary(name);
            ToolStatus {
                name: (*name).to_string(),
                found: path.is_some(),
                path: path.map(|p| p.to_string_lossy().to_string()),
            }
        })
        .collect()
}

async fn ensure_container_runtime(window: &Window) -> BootstrapResult<String> {
    if docker_available() {
        return Ok("Docker-compatible runtime".to_string());
    }

    match std::env::consts::OS {
        "macos" => {
            let preferred = if supports_apple_virtualization() {
                vec![
                    RuntimeCandidate::OrbStack,
                    RuntimeCandidate::DockerDesktop,
                    RuntimeCandidate::Colima,
                ]
            } else {
                vec![RuntimeCandidate::DockerDesktop, RuntimeCandidate::Colima]
            };
            let installed: Vec<_> = preferred
                .iter()
                .copied()
                .filter(|candidate| macos_runtime_installed(*candidate))
                .collect();
            let install_candidates = vec![RuntimeCandidate::Colima];

            let mut errors = Vec::new();
            for candidate in installed {
                emit(
                    window,
                    "runtime",
                    &format!("Starting {}...", candidate.label()),
                    8,
                );

                match ensure_macos_runtime(candidate, false) {
                    Ok(()) => {
                        if wait_for_docker_ready(Duration::from_secs(180)) {
                            return Ok(candidate.label().to_string());
                        }
                        errors.push(format!("{} did not expose Docker in time", candidate.label()));
                    }
                    Err(error) => errors.push(format!("{}: {}", candidate.label(), error)),
                }
            }

            for candidate in install_candidates {
                emit(
                    window,
                    "runtime",
                    &format!("Installing {}...", candidate.label()),
                    8,
                );

                match ensure_macos_runtime(candidate, true) {
                    Ok(()) => {
                        if wait_for_docker_ready(Duration::from_secs(180)) {
                            return Ok(candidate.label().to_string());
                        }
                        errors.push(format!("{} did not expose Docker in time", candidate.label()));
                    }
                    Err(error) => errors.push(format!("{}: {}", candidate.label(), error)),
                }
            }

            Err(format!(
                "No Docker-compatible runtime became available. {}",
                errors.join("; ")
            ))
        }
        "linux" => Err(
            "Docker is not running. Install and start Docker Engine or another Docker-compatible runtime, then retry."
                .to_string(),
        ),
        "windows" => Err(
            "Docker is not running. Install and start Docker Desktop with WSL 2 support, then retry."
                .to_string(),
        ),
        other => Err(format!(
            "Unsupported OS for automatic runtime setup: {}",
            other
        )),
    }
}

#[derive(Copy, Clone)]
enum RuntimeCandidate {
    OrbStack,
    DockerDesktop,
    Colima,
}

impl RuntimeCandidate {
    fn label(self) -> &'static str {
        match self {
            Self::OrbStack => "OrbStack",
            Self::DockerDesktop => "Docker Desktop",
            Self::Colima => "Colima",
        }
    }
}

fn supports_apple_virtualization() -> bool {
    if std::env::consts::OS != "macos" {
        return false;
    }

    let output = Command::new("sw_vers").args(["-productVersion"]).output();

    let Ok(output) = output else {
        return true;
    };

    let version = String::from_utf8_lossy(&output.stdout);
    let mut parts = version.trim().split('.');
    parts
        .next()
        .and_then(|major| major.parse::<u32>().ok())
        .map(|major| major >= 13)
        .unwrap_or(true)
}

fn macos_runtime_installed(candidate: RuntimeCandidate) -> bool {
    match candidate {
        RuntimeCandidate::OrbStack => {
            find_tool_binary("orb").is_some()
                || PathBuf::from("/Applications/OrbStack.app").exists()
        }
        RuntimeCandidate::DockerDesktop => PathBuf::from("/Applications/Docker.app").exists(),
        RuntimeCandidate::Colima => find_tool_binary("colima").is_some(),
    }
}

fn ensure_macos_runtime(candidate: RuntimeCandidate, install_missing: bool) -> BootstrapResult<()> {
    match candidate {
        RuntimeCandidate::OrbStack => {
            if find_tool_binary("orb").is_none() {
                if !install_missing {
                    return Err("OrbStack CLI is not installed".to_string());
                }
                brew_install(&["install", "--cask", "orbstack"])?;
            }
            open_app("OrbStack")
        }
        RuntimeCandidate::DockerDesktop => {
            if !PathBuf::from("/Applications/Docker.app").exists() {
                if !install_missing {
                    return Err("Docker Desktop is not installed".to_string());
                }
                brew_install(&["install", "--cask", "docker"])?;
            }
            open_app("Docker")
        }
        RuntimeCandidate::Colima => {
            if find_tool_binary("colima").is_none() {
                if !install_missing {
                    return Err("Colima is not installed".to_string());
                }
                brew_install(&["install", "colima", "docker"])?;
            }
            let mut command = tool_command("colima");
            command.args(["start", "--cpu", "4", "--memory", "8"]);
            run_command(command, "colima start").map(|_| ())
        }
    }
}

fn open_app(name: &str) -> BootstrapResult<()> {
    let output = Command::new("open")
        .args(["-a", name])
        .output()
        .map_err(|error| format!("Failed to open {}: {}", name, error))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "open -a {} failed: {}",
            name,
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn docker_available() -> bool {
    let mut command = docker_command();
    command.arg("info");
    command
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn wait_for_docker_ready(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if docker_available() {
            return true;
        }
        thread::sleep(Duration::from_secs(2));
    }
    false
}

async fn ensure_host_tools(window: &Window) -> BootstrapResult<()> {
    for tool in ["kind", "kubectl", "helm", "argocd"] {
        if find_tool_binary(tool).is_some() {
            continue;
        }

        emit(
            window,
            "dependencies",
            &format!("Installing {}...", tool),
            18,
        );
        install_tool(tool).await?;

        if find_tool_binary(tool).is_none() {
            return Err(format!("{} was installed but is not visible on PATH", tool));
        }
    }

    Ok(())
}

async fn install_tool(tool: &str) -> BootstrapResult<()> {
    if is_homebrew_available() {
        let formula = match tool {
            "kind" => "kind",
            "kubectl" => "kubernetes-cli",
            "helm" => "helm",
            "argocd" => "argocd",
            _ => tool,
        };

        match brew_install(&["install", formula]) {
            Ok(()) => return Ok(()),
            Err(error) if supports_direct_install(tool) => {
                tracing::warn!(
                    "Homebrew install failed for {}; falling back to direct install: {}",
                    tool,
                    error
                );
            }
            Err(error) => return Err(error),
        }
    }

    if supports_direct_install(tool) {
        return install_direct_binary(tool).await;
    }

    Err(format!(
        "Missing required tool '{}'. Install Homebrew or install '{}' manually.",
        tool, tool
    ))
}

fn supports_direct_install(tool: &str) -> bool {
    matches!(tool, "kind" | "kubectl" | "argocd")
}

async fn install_direct_binary(tool: &str) -> BootstrapResult<()> {
    let url = direct_binary_url(tool).await?;
    let response = reqwest::get(&url)
        .await
        .map_err(|error| format!("Failed to download {}: {}", tool, error))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download {} from {}: HTTP {}",
            tool,
            url,
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Failed reading {} download: {}", tool, error))?;

    let local_bin = local_bin_dir().ok_or("Cannot resolve ~/.local/bin".to_string())?;
    std::fs::create_dir_all(&local_bin)
        .map_err(|error| format!("Failed to create {:?}: {}", local_bin, error))?;

    let binary_name = if cfg!(windows) {
        format!("{}.exe", tool)
    } else {
        tool.to_string()
    };
    let temp_path = std::env::temp_dir().join(format!("cto-app-{}", binary_name));
    let final_path = local_bin.join(binary_name);

    std::fs::write(&temp_path, bytes)
        .map_err(|error| format!("Failed to write {:?}: {}", temp_path, error))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&temp_path)
            .map_err(|error| format!("Failed to stat {:?}: {}", temp_path, error))?
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&temp_path, permissions)
            .map_err(|error| format!("Failed to chmod {:?}: {}", temp_path, error))?;
    }

    if final_path.exists() {
        std::fs::remove_file(&final_path)
            .map_err(|error| format!("Failed to replace {:?}: {}", final_path, error))?;
    }
    std::fs::rename(&temp_path, &final_path)
        .map_err(|error| format!("Failed to install {:?}: {}", final_path, error))?;

    ensure_runtime_tool_paths_on_process();
    Ok(())
}

async fn direct_binary_url(tool: &str) -> BootstrapResult<String> {
    let os = target_os_for_download()?;
    let arch = target_arch_for_download()?;
    let exe = if cfg!(windows) { ".exe" } else { "" };

    match tool {
        "kind" => Ok(format!(
            "https://kind.sigs.k8s.io/dl/v0.31.0/kind-{}-{}",
            os, arch
        )),
        "kubectl" => {
            let version = reqwest::get("https://dl.k8s.io/release/stable.txt")
                .await
                .map_err(|error| format!("Failed to resolve kubectl version: {}", error))?
                .text()
                .await
                .map_err(|error| format!("Failed reading kubectl version: {}", error))?;
            Ok(format!(
                "https://dl.k8s.io/release/{}/bin/{}/{}/kubectl{}",
                version.trim(),
                os,
                arch,
                exe
            ))
        }
        "argocd" => Ok(format!(
            "https://github.com/argoproj/argo-cd/releases/latest/download/argocd-{}-{}{}",
            os, arch, exe
        )),
        _ => Err(format!("No direct installer for {}", tool)),
    }
}

fn target_os_for_download() -> BootstrapResult<&'static str> {
    match std::env::consts::OS {
        "macos" => Ok("darwin"),
        "linux" => Ok("linux"),
        "windows" => Ok("windows"),
        other => Err(format!("Unsupported OS for direct install: {}", other)),
    }
}

fn target_arch_for_download() -> BootstrapResult<&'static str> {
    match std::env::consts::ARCH {
        "aarch64" | "arm64" => Ok("arm64"),
        "x86_64" | "amd64" => Ok("amd64"),
        arch => Err(format!(
            "Unsupported architecture for direct install: {}",
            arch
        )),
    }
}

fn ensure_kind_cluster() -> BootstrapResult<()> {
    if kind_cluster_exists()? {
        return Ok(());
    }

    let config = r#"kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 80
        hostPort: 8080
        protocol: TCP
      - containerPort: 443
        hostPort: 8443
        protocol: TCP
"#
    .to_string();

    let mut child = tool_command("kind")
        .args(["create", "cluster", "--name", CLUSTER_NAME, "--config", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to run kind create cluster: {}", error))?;

    child
        .stdin
        .as_mut()
        .ok_or("Failed to open kind stdin".to_string())?
        .write_all(config.as_bytes())
        .map_err(|error| format!("Failed to write kind config: {}", error))?;

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to wait for kind: {}", error))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "kind create cluster failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn kind_cluster_exists() -> BootstrapResult<bool> {
    let output = run_tool("kind", &["get", "clusters"])?;
    if !output.status.success() {
        return Ok(false);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().any(|line| line.trim() == CLUSTER_NAME))
}

async fn apply_remote_manifest(url: &str) -> BootstrapResult<()> {
    let response = reqwest::get(url)
        .await
        .map_err(|error| format!("Failed to download manifest {}: {}", url, error))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download manifest {}: HTTP {}",
            url,
            response.status()
        ));
    }

    let manifest = response
        .text()
        .await
        .map_err(|error| format!("Failed reading manifest {}: {}", url, error))?;
    apply_manifest(&manifest)
}

async fn apply_remote_manifest_in_namespace(url: &str, namespace: &str) -> BootstrapResult<()> {
    let response = reqwest::get(url)
        .await
        .map_err(|error| format!("Failed to download manifest {}: {}", url, error))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download manifest {}: HTTP {}",
            url,
            response.status()
        ));
    }

    let manifest = response
        .text()
        .await
        .map_err(|error| format!("Failed reading manifest {}: {}", url, error))?;
    apply_manifest_in_namespace(&manifest, namespace)
}

fn apply_manifest(manifest: &str) -> BootstrapResult<()> {
    apply_manifest_with_args(manifest, &["apply", "-f", "-"])
}

fn apply_manifest_in_namespace(manifest: &str, namespace: &str) -> BootstrapResult<()> {
    apply_manifest_with_args(manifest, &["apply", "-n", namespace, "-f", "-"])
}

fn apply_manifest_with_args(manifest: &str, args: &[&str]) -> BootstrapResult<()> {
    let mut command = kubectl_command();
    command.args(args);

    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to run kubectl apply: {}", error))?;

    child
        .stdin
        .as_mut()
        .ok_or("Failed to open kubectl stdin".to_string())?
        .write_all(manifest.as_bytes())
        .map_err(|error| format!("Failed to write manifest: {}", error))?;

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to wait for kubectl apply: {}", error))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "kubectl apply failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn ensure_namespace(name: &str) -> BootstrapResult<()> {
    let manifest = format!(
        "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: {}\n",
        name
    );
    apply_manifest(&manifest)
}

fn wait_for_rollout(namespace: &str, resource: &str, timeout: &str) -> BootstrapResult<()> {
    let output = run_kubectl(&[
        "rollout",
        "status",
        resource,
        "-n",
        namespace,
        "--timeout",
        timeout,
    ])?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Timed out waiting for {} in {}: {}",
            resource,
            namespace,
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn wait_for_crd(name: &str, timeout: &str) -> BootstrapResult<()> {
    let output = run_kubectl(&[
        "wait",
        "--for=condition=Established",
        &format!("crd/{}", name),
        "--timeout",
        timeout,
    ])?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Timed out waiting for CRD {}: {}",
            name,
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn run_tool(name: &str, args: &[&str]) -> BootstrapResult<Output> {
    let mut command = tool_command(name);
    command.args(args);
    run_command(command, &format!("{} {}", name, args.join(" ")))
}

fn run_kubectl(args: &[&str]) -> BootstrapResult<Output> {
    let mut command = kubectl_command();
    command.args(args);
    run_command(command, &format!("kubectl {}", args.join(" ")))
}

fn run_command(mut command: Command, label: &str) -> BootstrapResult<Output> {
    command
        .output()
        .map_err(|error| format!("Failed to run {}: {}", label, error))
}

fn kubectl_command() -> Command {
    let mut command = tool_command("kubectl");
    command.args(["--context", KIND_CONTEXT]);
    command
}

fn docker_command() -> Command {
    if let Some(path) = find_tool_binary("docker") {
        let mut command = Command::new(path);
        prepend_runtime_tool_paths(&mut command);
        command
    } else {
        tool_command("docker")
    }
}

fn tool_command(name: &str) -> Command {
    let mut command = if let Some(path) = find_tool_binary(name) {
        Command::new(path)
    } else {
        Command::new(name)
    };
    prepend_runtime_tool_paths(&mut command);
    command
}

fn brew_install(args: &[&str]) -> BootstrapResult<()> {
    let output = run_tool("brew", args)?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("already installed") {
        return Ok(());
    }

    Err(format!("brew {} failed: {}", args.join(" "), stderr.trim()))
}

fn is_homebrew_available() -> bool {
    find_tool_binary("brew").is_some()
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn local_bin_dir() -> Option<PathBuf> {
    home_dir().map(|home| home.join(".local").join("bin"))
}

fn common_tool_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
        PathBuf::from("/Applications/Docker.app/Contents/Resources/bin"),
        PathBuf::from("/Applications/OrbStack.app/Contents/MacOS"),
    ];

    if let Some(local_bin) = local_bin_dir() {
        dirs.push(local_bin);
    }

    dirs
}

fn binary_names(name: &str) -> Vec<String> {
    if cfg!(windows) && !name.ends_with(".exe") {
        vec![format!("{}.exe", name), name.to_string()]
    } else {
        vec![name.to_string()]
    }
}

fn find_tool_binary(name: &str) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    dirs.extend(common_tool_dirs());

    for dir in dirs {
        for binary_name in binary_names(name) {
            let path = dir.join(binary_name);
            if path.exists() && path.is_file() {
                return Some(path);
            }
        }
    }

    None
}

fn prepend_runtime_tool_paths(command: &mut Command) {
    let current_path = std::env::var_os("PATH").unwrap_or_default();
    let current_entries: Vec<PathBuf> = std::env::split_paths(&current_path).collect();
    let mut entries = common_tool_dirs();

    entries.retain(|entry| !current_entries.iter().any(|path| path == entry));
    if entries.is_empty() {
        return;
    }

    entries.extend(current_entries);
    if let Ok(path) = std::env::join_paths(entries) {
        command.env("PATH", path);
    }
}

fn ensure_runtime_tool_paths_on_process() {
    let current_path: OsString = std::env::var_os("PATH").unwrap_or_default();
    let current_entries: Vec<PathBuf> = std::env::split_paths(&current_path).collect();
    let mut entries = common_tool_dirs();

    entries.retain(|entry| !current_entries.iter().any(|path| path == entry));
    if entries.is_empty() {
        return;
    }

    entries.extend(current_entries);
    if let Ok(path) = std::env::join_paths(entries) {
        std::env::set_var("PATH", path);
    }
}

const PLATFORM_TOOLS_MANIFEST: &str = r#"
apiVersion: v1
kind: Namespace
metadata:
  name: cto-system
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mcp-tools
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io/background
spec:
  project: default
  source:
    repoURL: registry.5dlabs.ai/5dlabs/helm-charts
    targetRevision: "0.1.0"
    chart: mcp-tools
    helm:
      values: |
        tools:
          github:
            enabled: true
          linear:
            enabled: true
          filesystem:
            enabled: true
          kubernetes:
            enabled: true
  destination:
    server: https://kubernetes.default.svc
    namespace: cto-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
"#;
