use serde::Serialize;
use std::ffi::OsString;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Window};

static ACTIVE_RUNTIME: OnceLock<RuntimeKind> = OnceLock::new();

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum RuntimeKind {
    Colima,
    Podman,
}

impl RuntimeKind {
    fn label(self) -> &'static str {
        match self {
            Self::Colima => "Colima",
            Self::Podman => "Podman",
        }
    }
}

const CLUSTER_NAME: &str = "cto-app";
const KIND_CONTEXT: &str = "kind-cto-app";
const INGRESS_NGINX_KIND_URL: &str =
    "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.14.3/deploy/static/provider/kind/deploy.yaml";

// Upstream Argo CD Helm chart + our values overlay.  We prefer the chart
// over raw `install.yaml` so we can pin the server to HTTP-only, disable
// dex/notifications/redis-ha, and wire the NGINX ingress in one shot.
const ARGOCD_HELM_REPO_NAME: &str = "argo";
const ARGOCD_HELM_REPO_URL: &str = "https://argoproj.github.io/argo-helm";
const ARGOCD_HELM_CHART: &str = "argo/argo-cd";
const ARGOCD_HELM_RELEASE: &str = "argocd";
const ARGOCD_NAMESPACE: &str = "argocd";
const ARGOCD_VALUES: &str = include_str!("../../.gitops/charts/argocd/values.yaml");

// CTO platform + Qdrant + Morgan Argo Applications, published by
// .github/workflows/publish-chart.yml to ghcr.io.
const CTO_APP_MANIFEST: &str = include_str!("../../.gitops/apps/cto.yaml");
const QDRANT_APP_MANIFEST: &str = include_str!("../../.gitops/apps/qdrant.yaml");
const MORGAN_APP_MANIFEST: &str = include_str!("../../.gitops/apps/morgan.yaml");
const BOOTSTRAP_TEST_MODE_ENV: &str = "CTO_BOOTSTRAP_TEST_MODE";

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum BootstrapAppMode {
    Full,
    ControllerOnly,
}

impl BootstrapAppMode {
    fn from_env() -> BootstrapResult<Self> {
        match std::env::var(BOOTSTRAP_TEST_MODE_ENV) {
            Ok(value) => Self::parse(&value),
            Err(std::env::VarError::NotPresent) => Ok(Self::Full),
            Err(std::env::VarError::NotUnicode(_)) => {
                Err(format!("{BOOTSTRAP_TEST_MODE_ENV} must be valid Unicode"))
            }
        }
    }

    fn parse(value: &str) -> BootstrapResult<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "" | "0" | "false" | "full" | "off" => Ok(Self::Full),
            "1" | "true" | "controller-only" | "cto-only" | "on" => Ok(Self::ControllerOnly),
            _ => Err(format!(
                "Unsupported {BOOTSTRAP_TEST_MODE_ENV} value '{value}'. Use 'full' (default) or \
                 'controller-only' to apply only the CTO Application."
            )),
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::ControllerOnly => "controller-only",
        }
    }

    fn manifests(self) -> &'static [BootstrapAppManifest] {
        match self {
            Self::Full => &FULL_BOOTSTRAP_APPS,
            Self::ControllerOnly => &CONTROLLER_ONLY_BOOTSTRAP_APPS,
        }
    }

    fn skips_layered_apps(self) -> bool {
        matches!(self, Self::ControllerOnly)
    }
}

#[derive(Copy, Clone)]
struct BootstrapAppManifest {
    name: &'static str,
    manifest: &'static str,
}

const CTO_BOOTSTRAP_APP: BootstrapAppManifest = BootstrapAppManifest {
    name: "cto",
    manifest: CTO_APP_MANIFEST,
};
const QDRANT_BOOTSTRAP_APP: BootstrapAppManifest = BootstrapAppManifest {
    name: "qdrant",
    manifest: QDRANT_APP_MANIFEST,
};
const MORGAN_BOOTSTRAP_APP: BootstrapAppManifest = BootstrapAppManifest {
    name: "morgan",
    manifest: MORGAN_APP_MANIFEST,
};
const FULL_BOOTSTRAP_APPS: [BootstrapAppManifest; 3] = [
    CTO_BOOTSTRAP_APP,
    QDRANT_BOOTSTRAP_APP,
    MORGAN_BOOTSTRAP_APP,
];
const CONTROLLER_ONLY_BOOTSTRAP_APPS: [BootstrapAppManifest; 1] = [CTO_BOOTSTRAP_APP];

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
    let app_mode = BootstrapAppMode::from_env()?;
    if app_mode.skips_layered_apps() {
        tracing::warn!(
            "{BOOTSTRAP_TEST_MODE_ENV}={} enabled; qdrant and morgan Argo Applications will not be applied",
            app_mode.label()
        );
    }

    emit(&window, "runtime", "Detecting container runtime...", 5);
    ensure_runtime_tool_paths_on_process();

    let runtime_kind = ensure_container_runtime(&window).await?;
    let _ = ACTIVE_RUNTIME.set(runtime_kind);
    let runtime = runtime_kind.label().to_string();

    emit(&window, "dependencies", "Installing dependencies...", 16);
    ensure_host_tools(&window).await?;

    emit(&window, "cluster", "Starting local Kubernetes...", 32);
    ensure_kind_cluster()?;

    emit(&window, "ingress", "Configuring ingress...", 52);
    apply_remote_manifest_server_side(INGRESS_NGINX_KIND_URL).await?;
    wait_for_rollout(
        "ingress-nginx",
        "deployment/ingress-nginx-controller",
        "240s",
    )?;

    emit(&window, "gitops", "Starting GitOps controller...", 68);
    ensure_namespace(ARGOCD_NAMESPACE)?;
    install_argocd().await?;
    wait_for_crd("applications.argoproj.io", "120s")?;
    wait_for_crd("appprojects.argoproj.io", "120s")?;
    wait_for_rollout(ARGOCD_NAMESPACE, "deployment/argocd-server", "300s")?;
    wait_for_rollout(ARGOCD_NAMESPACE, "deployment/argocd-repo-server", "300s")?;
    wait_for_rollout(
        ARGOCD_NAMESPACE,
        "deployment/argocd-applicationset-controller",
        "300s",
    )?;
    wait_for_rollout(
        ARGOCD_NAMESPACE,
        "statefulset/argocd-application-controller",
        "300s",
    )?;

    let app_message = if app_mode.skips_layered_apps() {
        "Registering CTO app (test mode)..."
    } else {
        "Registering platform apps..."
    };
    emit(&window, "tools", app_message, 86);
    apply_bootstrap_apps(app_mode)?;

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
        runtime: detect_runtime_kind()
            .map_or_else(|| "Unavailable".to_string(), |k| k.label().to_string()),
        cluster: CLUSTER_NAME.to_string(),
        tools: current_tool_statuses(),
    }
}

fn detect_runtime_kind() -> Option<RuntimeKind> {
    if podman_ready() {
        Some(RuntimeKind::Podman)
    } else if docker_ready() {
        Some(RuntimeKind::Colima)
    } else {
        None
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
    let runtime_tool = match active_runtime() {
        Some(RuntimeKind::Podman) => "podman",
        _ => "docker",
    };
    [runtime_tool, "kind", "kubectl", "helm", "argocd"]
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

fn active_runtime() -> Option<RuntimeKind> {
    ACTIVE_RUNTIME.get().copied().or_else(detect_runtime_kind)
}

#[allow(clippy::unused_async)]
async fn ensure_container_runtime(window: &Window) -> BootstrapResult<RuntimeKind> {
    match std::env::consts::OS {
        "macos" => ensure_macos_colima(window),
        "linux" => ensure_linux_podman(window),
        "windows" => ensure_windows_podman(window),
        other => Err(format!(
            "Unsupported OS for automatic runtime setup: {other}"
        )),
    }
}

fn ensure_macos_colima(window: &Window) -> BootstrapResult<RuntimeKind> {
    if docker_ready() {
        return Ok(RuntimeKind::Colima);
    }

    if find_tool_binary("colima").is_none() || find_tool_binary("docker").is_none() {
        if !is_homebrew_available() {
            return Err(
                "Homebrew is required to install Colima. Install from https://brew.sh, then retry."
                    .to_string(),
            );
        }
        emit(window, "runtime", "Installing Colima...", 8);
        brew_install(&["install", "colima", "docker"])?;
        ensure_runtime_tool_paths_on_process();
    }

    emit(window, "runtime", "Starting Colima...", 10);
    let mut command = tool_command("colima");
    command.args(["start", "--cpu", "4", "--memory", "8"]);
    run_command(command, "colima start").map(|_| ())?;

    if wait_for_runtime_ready(RuntimeKind::Colima, Duration::from_secs(180)) {
        Ok(RuntimeKind::Colima)
    } else {
        Err("Colima started but Docker did not become available in time.".to_string())
    }
}

fn ensure_linux_podman(window: &Window) -> BootstrapResult<RuntimeKind> {
    if find_tool_binary("podman").is_none() {
        return Err(
            "Podman is required on Linux. Install via your package manager (e.g. \
             `sudo dnf install podman`, `sudo apt install podman`, or `sudo pacman -S podman`), \
             then retry."
                .to_string(),
        );
    }

    emit(window, "runtime", "Checking Podman...", 10);
    if !podman_ready() {
        return Err(
            "Podman is installed but `podman info` failed. Ensure your user session is configured \
             (e.g. `podman system migrate`) and that cgroup v2 is enabled, then retry."
                .to_string(),
        );
    }

    Ok(RuntimeKind::Podman)
}

fn ensure_windows_podman(window: &Window) -> BootstrapResult<RuntimeKind> {
    if find_tool_binary("podman").is_none() {
        return Err(
            "Podman is required on Windows. Install Podman Desktop from \
             https://podman-desktop.io/downloads, then retry."
                .to_string(),
        );
    }

    emit(window, "runtime", "Preparing Podman machine...", 8);
    if podman_machine_exists()? {
        ensure_podman_machine_rootful();
        let mut start = tool_command("podman");
        start.args(["machine", "start"]);
        // Ignore "already running" errors.
        let _ = start.output();
    } else {
        let mut init = tool_command("podman");
        init.args(["machine", "init", "--rootful", "--now"]);
        run_command(init, "podman machine init").map(|_| ())?;
    }

    if wait_for_runtime_ready(RuntimeKind::Podman, Duration::from_secs(180)) {
        Ok(RuntimeKind::Podman)
    } else {
        Err(
            "Podman machine started but `podman info` did not become available in time."
                .to_string(),
        )
    }
}

fn podman_machine_exists() -> BootstrapResult<bool> {
    let output = run_tool("podman", &["machine", "list", "--format", "{{.Name}}"])?;
    Ok(!String::from_utf8_lossy(&output.stdout).trim().is_empty())
}

fn ensure_podman_machine_rootful() {
    let mut cmd = tool_command("podman");
    cmd.args(["machine", "set", "--rootful"]);
    // Best-effort: machine must be stopped for `set` to take effect; ignore failures.
    let _ = cmd.output();
}

async fn ensure_host_tools(window: &Window) -> BootstrapResult<()> {
    for tool in ["kind", "kubectl", "helm", "argocd"] {
        if find_tool_binary(tool).is_some() {
            continue;
        }

        emit(window, "dependencies", &format!("Installing {tool}..."), 18);
        install_tool(tool).await?;

        if find_tool_binary(tool).is_none() {
            return Err(format!("{tool} was installed but is not visible on PATH"));
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
        "Missing required tool '{tool}'. Install Homebrew or install '{tool}' manually."
    ))
}

fn supports_direct_install(tool: &str) -> bool {
    matches!(tool, "kind" | "kubectl" | "argocd")
}

async fn install_direct_binary(tool: &str) -> BootstrapResult<()> {
    let url = direct_binary_url(tool).await?;
    let response = reqwest::get(&url)
        .await
        .map_err(|error| format!("Failed to download {tool}: {error}"))?;

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
        .map_err(|error| format!("Failed reading {tool} download: {error}"))?;

    let local_bin = local_bin_dir().ok_or("Cannot resolve ~/.local/bin".to_string())?;
    std::fs::create_dir_all(&local_bin)
        .map_err(|error| format!("Failed to create {}: {error}", local_bin.display()))?;

    let binary_name = if cfg!(windows) {
        format!("{tool}.exe")
    } else {
        tool.to_string()
    };
    let temp_path = std::env::temp_dir().join(format!("cto-app-{binary_name}"));
    let final_path = local_bin.join(binary_name);

    std::fs::write(&temp_path, bytes)
        .map_err(|error| format!("Failed to write {}: {error}", temp_path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&temp_path)
            .map_err(|error| format!("Failed to stat {}: {error}", temp_path.display()))?
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&temp_path, permissions)
            .map_err(|error| format!("Failed to chmod {}: {error}", temp_path.display()))?;
    }

    if final_path.exists() {
        std::fs::remove_file(&final_path)
            .map_err(|error| format!("Failed to replace {}: {error}", final_path.display()))?;
    }
    std::fs::rename(&temp_path, &final_path)
        .map_err(|error| format!("Failed to install {}: {error}", final_path.display()))?;

    ensure_runtime_tool_paths_on_process();
    Ok(())
}

async fn direct_binary_url(tool: &str) -> BootstrapResult<String> {
    let os = target_os_for_download()?;
    let arch = target_arch_for_download()?;
    let exe = if cfg!(windows) { ".exe" } else { "" };

    match tool {
        "kind" => Ok(format!(
            "https://kind.sigs.k8s.io/dl/v0.31.0/kind-{os}-{arch}"
        )),
        "kubectl" => {
            let version = reqwest::get("https://dl.k8s.io/release/stable.txt")
                .await
                .map_err(|error| format!("Failed to resolve kubectl version: {error}"))?
                .text()
                .await
                .map_err(|error| format!("Failed reading kubectl version: {error}"))?;
            Ok(format!(
                "https://dl.k8s.io/release/{}/bin/{}/{}/kubectl{}",
                version.trim(),
                os,
                arch,
                exe
            ))
        }
        "argocd" => Ok(format!(
            "https://github.com/argoproj/argo-cd/releases/latest/download/argocd-{os}-{arch}{exe}"
        )),
        _ => Err(format!("No direct installer for {tool}")),
    }
}

fn target_os_for_download() -> BootstrapResult<&'static str> {
    match std::env::consts::OS {
        "macos" => Ok("darwin"),
        "linux" => Ok("linux"),
        "windows" => Ok("windows"),
        other => Err(format!("Unsupported OS for direct install: {other}")),
    }
}

fn target_arch_for_download() -> BootstrapResult<&'static str> {
    match std::env::consts::ARCH {
        "aarch64" | "arm64" => Ok("arm64"),
        "x86_64" | "amd64" => Ok("amd64"),
        arch => Err(format!(
            "Unsupported architecture for direct install: {arch}"
        )),
    }
}

fn ensure_kind_cluster() -> BootstrapResult<()> {
    if kind_cluster_exists()? {
        return Ok(());
    }

    let config = r"kind: Cluster
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
"
    .to_string();

    let mut child = kind_command()
        .args(["create", "cluster", "--name", CLUSTER_NAME, "--config", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to run kind create cluster: {error}"))?;

    child
        .stdin
        .as_mut()
        .ok_or("Failed to open kind stdin".to_string())?
        .write_all(config.as_bytes())
        .map_err(|error| format!("Failed to write kind config: {error}"))?;

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to wait for kind: {error}"))?;

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
    let mut command = kind_command();
    command.args(["get", "clusters"]);
    let output = run_command(command, "kind get clusters")?;
    if !output.status.success() {
        return Ok(false);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().any(|line| line.trim() == CLUSTER_NAME))
}

async fn apply_remote_manifest_server_side(url: &str) -> BootstrapResult<()> {
    apply_manifest_with_args(
        &download_manifest(url).await?,
        &["apply", "--server-side", "--force-conflicts", "-f", "-"],
    )
}

async fn download_manifest(url: &str) -> BootstrapResult<String> {
    let response = reqwest::get(url)
        .await
        .map_err(|error| format!("Failed to download manifest {url}: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download manifest {}: HTTP {}",
            url,
            response.status()
        ));
    }

    response
        .text()
        .await
        .map_err(|error| format!("Failed reading manifest {url}: {error}"))
}

fn apply_manifest(manifest: &str) -> BootstrapResult<()> {
    apply_manifest_with_args(manifest, &["apply", "-f", "-"])
}

fn apply_bootstrap_apps(mode: BootstrapAppMode) -> BootstrapResult<()> {
    for app in mode.manifests() {
        tracing::info!("Applying {} Argo Application", app.name);
        apply_manifest(app.manifest)
            .map_err(|error| format!("Failed to apply {} Argo Application: {error}", app.name))?;
    }

    Ok(())
}

fn apply_manifest_with_args(manifest: &str, args: &[&str]) -> BootstrapResult<()> {
    let mut command = kubectl_command();
    command.args(args);

    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to run kubectl apply: {error}"))?;

    child
        .stdin
        .as_mut()
        .ok_or("Failed to open kubectl stdin".to_string())?
        .write_all(manifest.as_bytes())
        .map_err(|error| format!("Failed to write manifest: {error}"))?;

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to wait for kubectl apply: {error}"))?;

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
    let manifest = format!("apiVersion: v1\nkind: Namespace\nmetadata:\n  name: {name}\n");
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
        &format!("crd/{name}"),
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
        .map_err(|error| format!("Failed to run {label}: {error}"))
}

fn kubectl_command() -> Command {
    let mut command = tool_command("kubectl");
    command.args(["--context", KIND_CONTEXT]);
    command
}

fn docker_command() -> Command {
    tool_command("docker")
}

fn kind_command() -> Command {
    let mut command = tool_command("kind");
    if matches!(active_runtime(), Some(RuntimeKind::Podman)) {
        command.env("KIND_EXPERIMENTAL_PROVIDER", "podman");
    }
    command
}

fn helm_command() -> Command {
    let mut command = tool_command("helm");
    command.args(["--kube-context", KIND_CONTEXT]);
    command
}

#[allow(clippy::unused_async)]
async fn install_argocd() -> BootstrapResult<()> {
    // Register the argo-helm repo (idempotent) and refresh its index.
    {
        let mut cmd = helm_command();
        cmd.args([
            "repo",
            "add",
            ARGOCD_HELM_REPO_NAME,
            ARGOCD_HELM_REPO_URL,
            "--force-update",
        ]);
        run_expecting_success(cmd, "helm repo add argo")?;
    }
    {
        let mut cmd = helm_command();
        cmd.args(["repo", "update", ARGOCD_HELM_REPO_NAME]);
        run_expecting_success(cmd, "helm repo update argo")?;
    }

    // Stream our overlay in via stdin rather than writing a temp file — keeps
    // install reproducible and avoids leaking files on failure paths.
    let mut cmd = helm_command();
    cmd.args([
        "upgrade",
        "--install",
        ARGOCD_HELM_RELEASE,
        ARGOCD_HELM_CHART,
        "--namespace",
        ARGOCD_NAMESPACE,
        "--create-namespace",
        "--wait",
        "--timeout",
        "10m",
        "-f",
        "-",
    ]);

    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("helm upgrade failed to spawn: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(ARGOCD_VALUES.as_bytes())
            .map_err(|error| format!("helm upgrade stdin write failed: {error}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("helm upgrade wait failed: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "helm upgrade --install argocd failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

fn run_expecting_success(mut command: Command, action: &str) -> BootstrapResult<()> {
    let output = command
        .output()
        .map_err(|error| format!("{action} failed to run: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "{} failed: {}",
            action,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

fn docker_ready() -> bool {
    let mut command = docker_command();
    command.arg("info");
    command.output().is_ok_and(|output| output.status.success())
}

fn podman_ready() -> bool {
    let mut command = tool_command("podman");
    command.arg("info");
    command.output().is_ok_and(|output| output.status.success())
}

fn runtime_ready(kind: RuntimeKind) -> bool {
    match kind {
        RuntimeKind::Colima => docker_ready(),
        RuntimeKind::Podman => podman_ready(),
    }
}

fn wait_for_runtime_ready(kind: RuntimeKind, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if runtime_ready(kind) {
            return true;
        }
        thread::sleep(Duration::from_secs(2));
    }
    false
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
    ];

    if let Some(local_bin) = local_bin_dir() {
        dirs.push(local_bin);
    }

    dirs
}

fn binary_names(name: &str) -> Vec<String> {
    let is_exe = std::path::Path::new(name)
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"));
    if cfg!(windows) && !is_exe {
        vec![format!("{name}.exe"), name.to_string()]
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

#[cfg(test)]
mod tests {
    use super::{BootstrapAppMode, BOOTSTRAP_TEST_MODE_ENV};

    #[test]
    fn bootstrap_test_mode_defaults_to_full_for_empty_or_false_values() {
        for value in ["", "0", "false", "full", "off"] {
            assert_eq!(
                BootstrapAppMode::parse(value).unwrap(),
                BootstrapAppMode::Full
            );
        }
    }

    #[test]
    fn bootstrap_test_mode_accepts_controller_only_values() {
        for value in ["1", "true", "controller-only", "cto-only", "on"] {
            assert_eq!(
                BootstrapAppMode::parse(value).unwrap(),
                BootstrapAppMode::ControllerOnly
            );
        }
    }

    #[test]
    fn bootstrap_test_mode_rejects_unknown_values() {
        let error = BootstrapAppMode::parse("qdrant-only").unwrap_err();
        assert!(error.contains(BOOTSTRAP_TEST_MODE_ENV));
        assert!(error.contains("controller-only"));
    }

    #[test]
    fn bootstrap_app_order_is_full_by_default_and_cto_only_in_test_mode() {
        let full_names: Vec<_> = BootstrapAppMode::Full
            .manifests()
            .iter()
            .map(|app| app.name)
            .collect();
        assert_eq!(full_names, ["cto", "qdrant", "morgan"]);

        let controller_only_names: Vec<_> = BootstrapAppMode::ControllerOnly
            .manifests()
            .iter()
            .map(|app| app.name)
            .collect();
        assert_eq!(controller_only_names, ["cto"]);
    }
}
