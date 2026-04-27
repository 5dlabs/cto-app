use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::ffi::OsString;
use std::fmt::Write as _;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, Window};

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
const KIND_CLUSTER_LABEL_KEY: &str = "io.x-k8s.kind.cluster";
const INGRESS_NGINX_KIND_URL: &str =
    "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.14.3/deploy/static/provider/kind/deploy.yaml";
const METRICS_SERVER_MANIFEST_URL: &str =
    "https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.7.2/components.yaml";
const METRICS_SERVER_NAMESPACE: &str = "kube-system";
const METRICS_SERVER_DEPLOYMENT: &str = "deployment/metrics-server";
const METRICS_SERVER_API_SERVICE: &str = "v1beta1.metrics.k8s.io";
const METRICS_SERVER_KUBELET_INSECURE_TLS_ARG: &str = "--kubelet-insecure-tls";
const METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_ARG: &str =
    "--kubelet-preferred-address-types=InternalIP,Hostname,ExternalIP";
const METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_PREFIX: &str =
    "--kubelet-preferred-address-types=";

// Upstream Argo CD Helm chart + our values overlay.  We prefer the chart
// over raw `install.yaml` so we can pin the server to HTTP-only, disable
// dex/notifications/redis-ha, and wire the NGINX ingress in one shot.
const ARGOCD_HELM_REPO_NAME: &str = "argo";
const ARGOCD_HELM_REPO_URL: &str = "https://argoproj.github.io/argo-helm";
const ARGOCD_HELM_CHART: &str = "argo/argo-cd";
const ARGOCD_HELM_RELEASE: &str = "argocd";
const ARGOCD_NAMESPACE: &str = "argocd";
const ARGOCD_VALUES: &str = include_str!("../../.gitops/charts/argocd/values.yaml");
const CTO_NAMESPACE: &str = "cto-system";
const CTO_AGENT_KEYS_SECRET: &str = "cto-agent-keys";
const GITHUB_TOKEN_SECRET_KEY: &str = "GITHUB_TOKEN";
const BOOTSTRAP_GITHUB_PAT_ENV: &str = "CTO_GITHUB_PAT";
const BOOTSTRAP_GITHUB_OWNER_ENV: &str = "CTO_GITHUB_OWNER";
const BOOTSTRAP_TOOL_API_KEY_ENV_NAMES: &[&str] = &[
    "EXA_API_KEY",
    "FIRECRAWL_API_KEY",
    "TAVILY_API_KEY",
    "BRAVE_API_KEY",
    "CONTEXT7_API_KEY",
    "PERPLEXITY_API_KEY",
];

// CTO platform + Qdrant + Morgan Argo Applications, published by
// .github/workflows/publish-chart.yml to ghcr.io.
const CTO_APP_MANIFEST: &str = include_str!("../../.gitops/apps/cto.yaml");
const QDRANT_APP_MANIFEST: &str = include_str!("../../.gitops/apps/qdrant.yaml");
const MORGAN_APP_MANIFEST: &str = include_str!("../../.gitops/apps/morgan.yaml");
const VOICE_BRIDGE_APP_MANIFEST: &str = include_str!("../../.gitops/apps/voice-bridge.yaml");
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
const VOICE_BRIDGE_BOOTSTRAP_APP: BootstrapAppManifest = BootstrapAppManifest {
    name: "voice-bridge",
    manifest: VOICE_BRIDGE_APP_MANIFEST,
};
const FULL_BOOTSTRAP_APPS: [BootstrapAppManifest; 4] = [
    CTO_BOOTSTRAP_APP,
    QDRANT_BOOTSTRAP_APP,
    MORGAN_BOOTSTRAP_APP,
    VOICE_BRIDGE_BOOTSTRAP_APP,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapLocalStackRequest {
    github: Option<BootstrapGithubRequest>,
    tools: Option<BootstrapToolsRequest>,
    setup: Option<BootstrapSetupProfile>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapGithubRequest {
    #[serde(default)]
    enabled: Option<bool>,
    token: Option<String>,
    owner: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapToolsRequest {
    #[serde(default)]
    api_keys: Vec<BootstrapToolApiKeyRequest>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapToolApiKeyRequest {
    name: String,
    value: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapSetupProfile {
    source: BootstrapSetupSource,
    harness: BootstrapSetupHarness,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapSetupSource {
    provider: BootstrapSourceProvider,
    base_url: String,
    owner: String,
    connection_id: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum BootstrapSourceProvider {
    #[serde(rename = "github")]
    GitHub,
    #[serde(rename = "gitlab")]
    GitLab,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapSetupHarness {
    mode: BootstrapHarnessMode,
    clis: Vec<BootstrapAiCli>,
    providers: Vec<BootstrapProviderSelection>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum BootstrapHarnessMode {
    #[serde(rename = "openclaw")]
    OpenClaw,
    #[serde(rename = "hermes")]
    Hermes,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum BootstrapAiCli {
    #[serde(rename = "openclaw")]
    OpenClaw,
    #[serde(rename = "codex")]
    Codex,
    #[serde(rename = "claudeCode")]
    ClaudeCode,
    #[serde(rename = "geminiCli")]
    GeminiCli,
    #[serde(rename = "opencode")]
    OpenCode,
    #[serde(rename = "qwenCode")]
    QwenCode,
    #[serde(rename = "githubCli")]
    GitHubCli,
    #[serde(rename = "gitlabCli")]
    GitLabCli,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapProviderSelection {
    id: String,
    auth: BootstrapProviderAuth,
    model: String,
    #[serde(default)]
    models: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum BootstrapProviderAuth {
    #[serde(rename = "oauth")]
    OAuth,
    #[serde(rename = "api-key")]
    ApiKey,
    #[serde(rename = "cloud")]
    Cloud,
    #[serde(rename = "local")]
    Local,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapLocalStackDefaults {
    github: BootstrapGithubDefaults,
    tool_keys: BTreeMap<String, BootstrapToolKeyDefaults>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapGithubDefaults {
    token: String,
    token_source: Option<String>,
    owner: String,
    owner_source: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapToolKeyDefaults {
    value: String,
    value_source: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct BootstrapGithubCredentials {
    token: Option<String>,
    owner: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct BootstrapAgentKey {
    name: String,
    value: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceAmount {
    cpu_milli_cores: Option<u64>,
    memory_bytes: Option<u64>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveResourceUsage {
    cpu_nano_cores: Option<u64>,
    memory_bytes: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStackResourceMetricsReport {
    generated_at_epoch_seconds: u64,
    cluster: MetricsClusterReport,
    runtime: MetricsRuntimeReport,
    node_containers: Vec<RuntimeContainerMetrics>,
    nodes: Vec<KubernetesNodeMetrics>,
    pods: Vec<KubernetesPodMetrics>,
    totals: ResourceMetricTotals,
    sources: Vec<MetricsSourceStatus>,
    warnings: Vec<String>,
    errors: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsClusterReport {
    name: String,
    context: String,
    kind_cluster_exists: bool,
    api_reachable: bool,
    reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsRuntimeReport {
    label: String,
    available: bool,
    allocation: Option<RuntimeAllocation>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAllocation {
    cpu_cores: Option<u64>,
    memory_bytes: Option<u64>,
    disk_bytes: Option<u64>,
    source: String,
    details: BTreeMap<String, String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeContainerMetrics {
    name: String,
    runtime: String,
    stats_available: bool,
    unavailable_reason: Option<String>,
    cpu_percent: Option<f64>,
    memory_usage_bytes: Option<u64>,
    memory_limit_bytes: Option<u64>,
    memory_percent: Option<f64>,
    pids: Option<u64>,
    raw: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KubernetesNodeMetrics {
    name: String,
    ready: bool,
    roles: Vec<String>,
    created_at: Option<String>,
    age_seconds: Option<u64>,
    capacity: ResourceAmount,
    allocatable: ResourceAmount,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KubernetesPodMetrics {
    namespace: String,
    name: String,
    phase: String,
    node_name: Option<String>,
    created_at: Option<String>,
    age_seconds: Option<u64>,
    ready_containers: u64,
    total_containers: u64,
    restarts: u64,
    container_names: Vec<String>,
    requests: ResourceAmount,
    limits: ResourceAmount,
    live_usage: LiveResourceUsage,
    containers: Vec<KubernetesContainerMetrics>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KubernetesContainerMetrics {
    name: String,
    requests: ResourceAmount,
    limits: ResourceAmount,
    live_usage: LiveResourceUsage,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMetricTotals {
    nodes: u64,
    pods: u64,
    containers: u64,
    restarts: u64,
    node_capacity: ResourceAmount,
    node_allocatable: ResourceAmount,
    requests: ResourceAmount,
    limits: ResourceAmount,
    live_usage: LiveResourceUsage,
    by_namespace: Vec<NamespaceResourceTotals>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamespaceResourceTotals {
    namespace: String,
    pods: u64,
    containers: u64,
    restarts: u64,
    requests: ResourceAmount,
    limits: ResourceAmount,
    live_usage: LiveResourceUsage,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsSourceStatus {
    name: String,
    available: bool,
    partial: bool,
    message: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct KindNodeContainerState {
    name: String,
    state: String,
}

impl KindNodeContainerState {
    fn is_running(&self) -> bool {
        self.state.eq_ignore_ascii_case("running")
    }
}

type BootstrapResult<T> = Result<T, String>;

#[tauri::command]
pub fn local_stack_bootstrap_defaults() -> BootstrapLocalStackDefaults {
    BootstrapLocalStackDefaults {
        github: BootstrapGithubDefaults {
            token: env_var_trimmed(BOOTSTRAP_GITHUB_PAT_ENV)
                .or_else(|| env_var_trimmed("GITHUB_TOKEN"))
                .unwrap_or_default(),
            token_source: env_var_source(BOOTSTRAP_GITHUB_PAT_ENV)
                .or_else(|| env_var_source("GITHUB_TOKEN")),
            owner: env_var_trimmed(BOOTSTRAP_GITHUB_OWNER_ENV)
                .or_else(|| env_var_trimmed("GITHUB_ORG"))
                .unwrap_or_else(|| "5dlabs".to_string()),
            owner_source: env_var_source(BOOTSTRAP_GITHUB_OWNER_ENV)
                .or_else(|| env_var_source("GITHUB_ORG")),
        },
        tool_keys: bootstrap_tool_key_defaults(),
    }
}

#[tauri::command]
pub async fn bootstrap_local_stack(
    window: Window,
    request: Option<BootstrapLocalStackRequest>,
) -> BootstrapResult<BootstrapReport> {
    tracing::info!("bootstrap_local_stack invoked");
    let app_mode = BootstrapAppMode::from_env()?;
    let github_credentials = normalize_bootstrap_github_credentials(request.as_ref())?;
    let tool_api_keys = normalize_bootstrap_tool_api_keys(request.as_ref())?;
    let agent_keys = bootstrap_agent_keys(github_credentials.as_ref(), &tool_api_keys);
    persist_bootstrap_setup(
        &window,
        request.as_ref().and_then(|request| request.setup.as_ref()),
    )?;
    if app_mode.skips_layered_apps() {
        tracing::warn!(
            "{BOOTSTRAP_TEST_MODE_ENV}={} enabled; qdrant and morgan Argo Applications will not be applied",
            app_mode.label()
        );
    }

    emit(&window, "runtime", "Detecting container runtime...", 5);
    ensure_runtime_tool_paths_on_process();

    let runtime_kind = ensure_container_runtime(&window)?;
    let _ = ACTIVE_RUNTIME.set(runtime_kind);
    let runtime = runtime_kind.label().to_string();

    emit(&window, "dependencies", "Installing dependencies...", 16);
    ensure_host_tools(&window).await?;

    emit(&window, "cluster", "Starting local Kubernetes...", 32);
    ensure_kind_cluster(runtime_kind)?;

    emit(&window, "ingress", "Configuring ingress...", 52);
    apply_remote_manifest_server_side(INGRESS_NGINX_KIND_URL).await?;
    wait_for_rollout(
        "ingress-nginx",
        "deployment/ingress-nginx-controller",
        "240s",
    )?;

    emit(&window, "metrics", "Installing Lens metrics support...", 60);
    install_metrics_server_for_kind().await?;

    emit(&window, "gitops", "Starting GitOps controller...", 68);
    ensure_namespace(ARGOCD_NAMESPACE)?;
    install_argocd()?;
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

    emit(&window, "credentials", "Configuring local API keys...", 82);
    ensure_namespace(CTO_NAMESPACE)?;
    apply_bootstrap_agent_keys(&agent_keys)?;

    let app_message = if app_mode.skips_layered_apps() {
        "Registering CTO app (test mode)..."
    } else {
        "Registering platform apps..."
    };
    emit(&window, "tools", app_message, 86);
    apply_bootstrap_apps(app_mode)?;
    patch_bootstrap_cto_agent_keys(&agent_keys)?;
    patch_bootstrap_github_owner(app_mode, github_credentials.as_ref())?;

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

#[tauri::command]
pub fn local_stack_resource_metrics() -> LocalStackResourceMetricsReport {
    tracing::info!("local_stack_resource_metrics invoked");
    ensure_runtime_tool_paths_on_process();

    let mut collector = MetricsCollector::default();
    let runtime_kind = active_runtime();
    let runtime = collect_metrics_runtime(runtime_kind, &mut collector);
    let cluster = collect_metrics_cluster(&mut collector);

    let node_names = collect_kind_node_names(&mut collector);
    let mut node_containers =
        collect_runtime_container_metrics(runtime_kind, &node_names, &mut collector);
    ensure_container_entries_for_nodes(&mut node_containers, runtime_kind, &node_names);

    let (nodes, mut pods) = if cluster.api_reachable {
        let nodes = collect_kubernetes_nodes(&mut collector);
        let pods = collect_kubernetes_pods(&mut collector);
        (nodes, pods)
    } else {
        collector.source(
            "kubernetesInventory",
            false,
            false,
            cluster
                .reason
                .clone()
                .unwrap_or_else(|| "Kind Kubernetes API is not reachable".to_string()),
        );
        (Vec::new(), Vec::new())
    };

    if cluster.api_reachable && !nodes.is_empty() {
        let usage = collect_kubelet_summary_usage(&nodes, &mut collector);
        apply_summary_usage(&mut pods, &usage);
    } else {
        collector.source(
            "kubeletSummary",
            false,
            false,
            "No reachable Kubernetes nodes for kubelet summary".to_string(),
        );
    }

    let totals = aggregate_resource_metrics(&nodes, &pods);
    LocalStackResourceMetricsReport {
        generated_at_epoch_seconds: current_epoch_seconds(),
        cluster,
        runtime,
        node_containers,
        nodes,
        pods,
        totals,
        sources: collector.sources,
        warnings: collector.warnings,
        errors: collector.errors,
    }
}

#[derive(Default)]
struct MetricsCollector {
    sources: Vec<MetricsSourceStatus>,
    warnings: Vec<String>,
    errors: Vec<String>,
}

impl MetricsCollector {
    fn source(&mut self, name: &str, available: bool, partial: bool, message: String) {
        if !available || partial {
            self.warnings.push(format!("{name}: {message}"));
        }
        self.sources.push(MetricsSourceStatus {
            name: name.to_string(),
            available,
            partial,
            message: (!message.is_empty()).then_some(message),
        });
    }
}

fn current_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn collect_metrics_runtime(
    runtime_kind: Option<RuntimeKind>,
    collector: &mut MetricsCollector,
) -> MetricsRuntimeReport {
    let label = runtime_kind.map_or_else(
        || "Unavailable".to_string(),
        |runtime| runtime.label().to_string(),
    );
    let available = runtime_kind.is_some();
    collector.source(
        "containerRuntime",
        available,
        false,
        if available {
            format!("Detected {label}")
        } else {
            "Neither Docker/Colima nor Podman is available".to_string()
        },
    );

    let allocation =
        runtime_kind.and_then(|runtime| collect_runtime_allocation(runtime, collector));
    MetricsRuntimeReport {
        label,
        available,
        allocation,
    }
}

fn collect_metrics_cluster(collector: &mut MetricsCollector) -> MetricsClusterReport {
    let mut reason = None;
    let kind_cluster_exists = match kind_cluster_exists() {
        Ok(exists) => {
            collector.source(
                "kindCluster",
                exists,
                false,
                if exists {
                    format!("Kind cluster '{CLUSTER_NAME}' exists")
                } else {
                    format!("Kind cluster '{CLUSTER_NAME}' was not found")
                },
            );
            exists
        }
        Err(error) => {
            reason = Some(error.clone());
            collector.source("kindCluster", false, false, error);
            false
        }
    };

    let api_reachable = if kind_cluster_exists {
        match current_kubectl_context()
            .and_then(|previous_context| ensure_kind_kube_context(previous_context.as_deref()))
        {
            Ok(()) => {
                collector.source(
                    "kubernetesApi",
                    true,
                    false,
                    format!("Kubernetes API is reachable through context '{KIND_CONTEXT}'"),
                );
                true
            }
            Err(error) => {
                reason = Some(error.clone());
                collector.source("kubernetesApi", false, false, error);
                false
            }
        }
    } else {
        false
    };

    if !api_reachable && kind_cluster_exists && reason.is_none() {
        reason = Some("Kind cluster exists, but Kubernetes API was not checked".to_string());
    }
    if !kind_cluster_exists && reason.is_none() {
        reason = Some(format!("Kind cluster '{CLUSTER_NAME}' was not found"));
    }

    MetricsClusterReport {
        name: CLUSTER_NAME.to_string(),
        context: KIND_CONTEXT.to_string(),
        kind_cluster_exists,
        api_reachable,
        reason,
    }
}

fn collect_runtime_allocation(
    runtime: RuntimeKind,
    collector: &mut MetricsCollector,
) -> Option<RuntimeAllocation> {
    match runtime {
        RuntimeKind::Colima => collect_colima_allocation(collector),
        RuntimeKind::Podman => collect_podman_allocation(collector),
    }
}

fn collect_colima_allocation(collector: &mut MetricsCollector) -> Option<RuntimeAllocation> {
    if find_tool_binary("colima").is_none() {
        collector.source(
            "runtimeAllocation",
            false,
            false,
            "Colima binary was not found".to_string(),
        );
        return None;
    }

    let output = match run_tool("colima", &["status", "--json"]) {
        Ok(output) => output,
        Err(error) => {
            collector.source("runtimeAllocation", false, false, error);
            return None;
        }
    };

    if !output.status.success() {
        collector.source(
            "runtimeAllocation",
            false,
            false,
            command_failure_message("colima status --json", &output),
        );
        return None;
    }

    let value = match serde_json::from_slice::<Value>(&output.stdout) {
        Ok(value) => value,
        Err(error) => {
            collector.source(
                "runtimeAllocation",
                false,
                false,
                format!("Failed to parse Colima allocation JSON: {error}"),
            );
            return None;
        }
    };

    let cpu_cores = value_u64_by_keys(&value, &["cpu", "cpus", "CPUs"]);
    let memory_bytes = value_u64_by_keys(&value, &["memory", "mem"])
        .and_then(|gib| multiply_u64(gib, 1_073_741_824));
    let disk_bytes = value_u64_by_keys(&value, &["disk", "diskSize"])
        .and_then(|gib| multiply_u64(gib, 1_073_741_824));
    let details =
        allocation_details_from_value(&value, &["arch", "runtime", "mountType", "socket"]);
    let available = cpu_cores.is_some() || memory_bytes.is_some() || disk_bytes.is_some();
    collector.source(
        "runtimeAllocation",
        available,
        !available,
        if available {
            "Read Colima runtime allocation".to_string()
        } else {
            "Colima status did not include cpu, memory, or disk allocation fields".to_string()
        },
    );

    available.then_some(RuntimeAllocation {
        cpu_cores,
        memory_bytes,
        disk_bytes,
        source: "colima status --json".to_string(),
        details,
    })
}

fn collect_podman_allocation(collector: &mut MetricsCollector) -> Option<RuntimeAllocation> {
    let output = match run_tool("podman", &["machine", "inspect", "--format", "json"]) {
        Ok(output) => output,
        Err(error) => {
            collector.source("runtimeAllocation", false, false, error);
            return None;
        }
    };

    if !output.status.success() {
        collector.source(
            "runtimeAllocation",
            false,
            false,
            command_failure_message("podman machine inspect --format json", &output),
        );
        return None;
    }

    let value = match serde_json::from_slice::<Value>(&output.stdout) {
        Ok(Value::Array(items)) => items.into_iter().next().unwrap_or(Value::Null),
        Ok(value) => value,
        Err(error) => {
            collector.source(
                "runtimeAllocation",
                false,
                false,
                format!("Failed to parse Podman machine allocation JSON: {error}"),
            );
            return None;
        }
    };

    let cpu_cores = nested_u64_by_paths(
        &value,
        &[
            &["Resources", "CPUs"],
            &["Config", "CPUs"],
            &["resources", "cpus"],
            &["config", "cpus"],
        ],
    );
    let memory_bytes = nested_u64_by_paths(
        &value,
        &[
            &["Resources", "Memory"],
            &["Config", "Memory"],
            &["resources", "memory"],
            &["config", "memory"],
        ],
    )
    .and_then(|mib| multiply_u64(mib, 1_048_576));
    let disk_bytes = nested_u64_by_paths(
        &value,
        &[
            &["Resources", "DiskSize"],
            &["Config", "DiskSize"],
            &["resources", "diskSize"],
            &["config", "diskSize"],
        ],
    )
    .and_then(|gib| multiply_u64(gib, 1_073_741_824));
    let details = allocation_details_from_value(&value, &["Name", "State", "VMType", "Rootful"]);
    let available = cpu_cores.is_some() || memory_bytes.is_some() || disk_bytes.is_some();
    collector.source(
        "runtimeAllocation",
        available,
        !available,
        if available {
            "Read Podman machine allocation".to_string()
        } else {
            "Podman machine inspect did not include cpu, memory, or disk allocation fields"
                .to_string()
        },
    );

    available.then_some(RuntimeAllocation {
        cpu_cores,
        memory_bytes,
        disk_bytes,
        source: "podman machine inspect --format json".to_string(),
        details,
    })
}

fn collect_kind_node_names(collector: &mut MetricsCollector) -> Vec<String> {
    let mut command = kind_command();
    command.args(["get", "nodes", "--name", CLUSTER_NAME]);
    let output = match run_command(command, "kind get nodes") {
        Ok(output) => output,
        Err(error) => {
            collector.source("kindNodeContainers", false, false, error);
            return Vec::new();
        }
    };

    if !output.status.success() {
        collector.source(
            "kindNodeContainers",
            false,
            false,
            command_failure_message("kind get nodes", &output),
        );
        return Vec::new();
    }

    let names: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect();
    collector.source(
        "kindNodeContainers",
        !names.is_empty(),
        names.is_empty(),
        if names.is_empty() {
            format!("Kind cluster '{CLUSTER_NAME}' has no reported node containers")
        } else {
            format!("Found {} Kind node container(s)", names.len())
        },
    );
    names
}

fn collect_runtime_container_metrics(
    runtime: Option<RuntimeKind>,
    node_names: &[String],
    collector: &mut MetricsCollector,
) -> Vec<RuntimeContainerMetrics> {
    let Some(runtime) = runtime else {
        collector.source(
            "containerRuntimeStats",
            false,
            false,
            "No active container runtime was detected".to_string(),
        );
        return Vec::new();
    };

    if node_names.is_empty() {
        collector.source(
            "containerRuntimeStats",
            false,
            false,
            "No Kind node containers were available for runtime stats".to_string(),
        );
        return Vec::new();
    }

    let mut command = match runtime {
        RuntimeKind::Colima => docker_command(),
        RuntimeKind::Podman => tool_command("podman"),
    };
    command.args(["stats", "--no-stream", "--format", "{{json .}}"]);
    command.args(node_names);
    let label = format!("{} stats", runtime_stats_tool(runtime));
    let output = match run_command(command, &label) {
        Ok(output) => output,
        Err(error) => {
            collector.source("containerRuntimeStats", false, false, error);
            return Vec::new();
        }
    };

    if !output.status.success() {
        collector.source(
            "containerRuntimeStats",
            false,
            false,
            command_failure_message(&label, &output),
        );
        return Vec::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stats = parse_runtime_stats_lines(&stdout, runtime.label());
    collector.source(
        "containerRuntimeStats",
        !stats.is_empty(),
        stats.len() < node_names.len(),
        if stats.is_empty() {
            "Container runtime stats command returned no parseable stats".to_string()
        } else {
            format!(
                "Parsed runtime stats for {} of {} Kind node container(s)",
                stats.len(),
                node_names.len()
            )
        },
    );
    stats
}

fn ensure_container_entries_for_nodes(
    containers: &mut Vec<RuntimeContainerMetrics>,
    runtime: Option<RuntimeKind>,
    node_names: &[String],
) {
    let runtime_label = runtime
        .map_or("Unavailable", RuntimeKind::label)
        .to_string();
    for name in node_names {
        if containers.iter().any(|container| &container.name == name) {
            continue;
        }
        containers.push(RuntimeContainerMetrics {
            name: name.clone(),
            runtime: runtime_label.clone(),
            stats_available: false,
            unavailable_reason: Some("Runtime stats unavailable for this container".to_string()),
            cpu_percent: None,
            memory_usage_bytes: None,
            memory_limit_bytes: None,
            memory_percent: None,
            pids: None,
            raw: BTreeMap::new(),
        });
    }
}

fn collect_kubernetes_nodes(collector: &mut MetricsCollector) -> Vec<KubernetesNodeMetrics> {
    let output = match run_kubectl(&["get", "nodes", "-o", "json"]) {
        Ok(output) => output,
        Err(error) => {
            collector.source("kubernetesNodes", false, false, error);
            return Vec::new();
        }
    };

    if !output.status.success() {
        collector.source(
            "kubernetesNodes",
            false,
            false,
            command_failure_message("kubectl get nodes -o json", &output),
        );
        return Vec::new();
    }

    match serde_json::from_slice::<Value>(&output.stdout) {
        Ok(value) => {
            let nodes = parse_kubernetes_nodes(&value, current_epoch_seconds());
            collector.source(
                "kubernetesNodes",
                !nodes.is_empty(),
                nodes.is_empty(),
                if nodes.is_empty() {
                    "Kubernetes returned no nodes".to_string()
                } else {
                    format!("Read {} Kubernetes node(s)", nodes.len())
                },
            );
            nodes
        }
        Err(error) => {
            collector.source(
                "kubernetesNodes",
                false,
                false,
                format!("Failed to parse Kubernetes node inventory: {error}"),
            );
            Vec::new()
        }
    }
}

fn collect_kubernetes_pods(collector: &mut MetricsCollector) -> Vec<KubernetesPodMetrics> {
    let output = match run_kubectl(&["get", "pods", "-A", "-o", "json"]) {
        Ok(output) => output,
        Err(error) => {
            collector.source("kubernetesPods", false, false, error);
            return Vec::new();
        }
    };

    if !output.status.success() {
        collector.source(
            "kubernetesPods",
            false,
            false,
            command_failure_message("kubectl get pods -A -o json", &output),
        );
        return Vec::new();
    }

    match serde_json::from_slice::<Value>(&output.stdout) {
        Ok(value) => {
            let pods = parse_kubernetes_pods(&value, current_epoch_seconds());
            collector.source(
                "kubernetesPods",
                true,
                false,
                format!("Read {} Kubernetes pod(s)", pods.len()),
            );
            pods
        }
        Err(error) => {
            collector.source(
                "kubernetesPods",
                false,
                false,
                format!("Failed to parse Kubernetes pod inventory: {error}"),
            );
            Vec::new()
        }
    }
}

fn collect_kubelet_summary_usage(
    nodes: &[KubernetesNodeMetrics],
    collector: &mut MetricsCollector,
) -> SummaryUsage {
    let mut usage = SummaryUsage::default();
    let mut failures = Vec::new();
    let mut successes = 0_u64;

    for node in nodes {
        let raw_path = format!("/api/v1/nodes/{}/proxy/stats/summary", node.name);
        match run_kubectl(&["get", "--raw", &raw_path]) {
            Ok(output) if output.status.success() => {
                match serde_json::from_slice::<Value>(&output.stdout) {
                    Ok(value) => {
                        usage.merge(parse_kubelet_summary_usage(&value));
                        successes = successes.saturating_add(1);
                    }
                    Err(error) => {
                        failures.push(format!("{}: invalid summary JSON ({error})", node.name));
                    }
                }
            }
            Ok(output) => failures.push(command_failure_message(
                &format!("kubectl get --raw {raw_path}"),
                &output,
            )),
            Err(error) => failures.push(error),
        }
    }

    let available = successes > 0;
    collector.source(
        "kubeletSummary",
        available,
        !failures.is_empty(),
        if failures.is_empty() {
            format!("Read kubelet summary from {successes} node(s)")
        } else {
            format!(
                "Read kubelet summary from {successes} node(s); {} node(s) unavailable: {}",
                failures.len(),
                failures.join("; ")
            )
        },
    );
    usage
}

fn runtime_stats_tool(runtime: RuntimeKind) -> &'static str {
    match runtime {
        RuntimeKind::Colima => "docker",
        RuntimeKind::Podman => "podman",
    }
}

fn command_failure_message(label: &str, output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        format!("{label} failed with status {}", output.status)
    } else {
        format!("{label} failed: {stderr}")
    }
}

fn multiply_u64(value: u64, multiplier: u64) -> Option<u64> {
    value.checked_mul(multiplier)
}

fn value_u64_by_keys(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(value_as_u64))
}

fn nested_u64_by_paths(value: &Value, paths: &[&[&str]]) -> Option<u64> {
    paths.iter().find_map(|path| {
        let mut cursor = value;
        for key in *path {
            cursor = cursor.get(*key)?;
        }
        value_as_u64(cursor)
    })
}

fn value_as_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_str().and_then(|text| text.trim().parse().ok()))
}

fn allocation_details_from_value(value: &Value, keys: &[&str]) -> BTreeMap<String, String> {
    let mut details = BTreeMap::new();
    for key in keys {
        if let Some(value) = value.get(*key) {
            if let Some(text) = value
                .as_str()
                .map(ToString::to_string)
                .or_else(|| value.as_bool().map(|flag| flag.to_string()))
                .or_else(|| value_as_u64(value).map(|number| number.to_string()))
            {
                details.insert((*key).to_string(), text);
            }
        }
    }
    details
}

fn parse_runtime_stats_lines(stdout: &str, runtime_label: &str) -> Vec<RuntimeContainerMetrics> {
    stdout
        .lines()
        .filter_map(|line| parse_runtime_container_metric(line, runtime_label))
        .collect()
}

fn parse_runtime_container_metric(
    line: &str,
    runtime_label: &str,
) -> Option<RuntimeContainerMetrics> {
    let value = serde_json::from_str::<Value>(line.trim()).ok()?;
    let object = value.as_object()?;
    let name = object
        .get("Name")
        .or_else(|| object.get("name"))
        .or_else(|| object.get("Container"))
        .or_else(|| object.get("container"))
        .or_else(|| object.get("ID"))
        .and_then(Value::as_str)?
        .to_string();
    let cpu_percent =
        string_field(object, &["CPUPerc", "CPU", "cpu_percent", "cpu"]).and_then(parse_percent);
    let memory_percent =
        string_field(object, &["MemPerc", "MemPercent", "mem_percent"]).and_then(parse_percent);
    let (memory_usage_bytes, memory_limit_bytes) =
        string_field(object, &["MemUsage", "Mem", "mem_usage"])
            .map_or((None, None), parse_memory_usage_pair);
    let pids = string_field(object, &["PIDs", "PIDS", "pids"]).and_then(|text| {
        text.trim()
            .parse::<u64>()
            .ok()
            .or_else(|| parse_decimal_scaled_to_u128(text.trim(), 1).and_then(u128_to_u64))
    });
    let raw = object
        .iter()
        .filter_map(|(key, value)| {
            value
                .as_str()
                .map(ToString::to_string)
                .or_else(|| value.as_i64().map(|number| number.to_string()))
                .or_else(|| value.as_u64().map(|number| number.to_string()))
                .or_else(|| value.as_f64().map(|number| number.to_string()))
                .map(|text| (key.clone(), text))
        })
        .collect();

    Some(RuntimeContainerMetrics {
        name,
        runtime: runtime_label.to_string(),
        stats_available: true,
        unavailable_reason: None,
        cpu_percent,
        memory_usage_bytes,
        memory_limit_bytes,
        memory_percent,
        pids,
        raw,
    })
}

fn string_field<'a>(object: &'a serde_json::Map<String, Value>, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(Value::as_str))
}

fn parse_percent(value: &str) -> Option<f64> {
    value.trim().strip_suffix('%')?.trim().parse().ok()
}

fn parse_memory_usage_pair(value: &str) -> (Option<u64>, Option<u64>) {
    let mut parts = value.split('/').map(str::trim);
    let used = parts.next().and_then(parse_memory_quantity_to_bytes);
    let limit = parts.next().and_then(parse_memory_quantity_to_bytes);
    (used, limit)
}

fn parse_kubernetes_nodes(value: &Value, now_epoch_seconds: u64) -> Vec<KubernetesNodeMetrics> {
    value
        .get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let metadata = item.get("metadata")?;
            let status = item.get("status");
            let name = metadata.get("name").and_then(Value::as_str)?.to_string();
            let created_at = metadata
                .get("creationTimestamp")
                .and_then(Value::as_str)
                .map(ToString::to_string);
            let age_seconds = created_at
                .as_deref()
                .and_then(|timestamp| age_seconds(timestamp, now_epoch_seconds));
            let roles = node_roles(metadata.get("labels"));
            let ready = status
                .and_then(|status| status.get("conditions"))
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .any(|condition| {
                    condition.get("type").and_then(Value::as_str) == Some("Ready")
                        && condition.get("status").and_then(Value::as_str) == Some("True")
                });
            let capacity =
                resource_amount_from_map(status.and_then(|status| status.get("capacity")));
            let allocatable =
                resource_amount_from_map(status.and_then(|status| status.get("allocatable")));

            Some(KubernetesNodeMetrics {
                name,
                ready,
                roles,
                created_at,
                age_seconds,
                capacity,
                allocatable,
            })
        })
        .collect()
}

fn node_roles(labels: Option<&Value>) -> Vec<String> {
    let mut roles: Vec<String> = labels
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|labels| labels.keys())
        .filter_map(|key| key.strip_prefix("node-role.kubernetes.io/"))
        .filter(|role| !role.is_empty())
        .map(ToString::to_string)
        .collect();
    if roles.is_empty() {
        roles.push("worker".to_string());
    }
    roles.sort();
    roles
}

fn parse_kubernetes_pods(value: &Value, now_epoch_seconds: u64) -> Vec<KubernetesPodMetrics> {
    value
        .get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| parse_kubernetes_pod(item, now_epoch_seconds))
        .collect()
}

fn parse_kubernetes_pod(item: &Value, now_epoch_seconds: u64) -> Option<KubernetesPodMetrics> {
    let metadata = item.get("metadata")?;
    let spec = item.get("spec");
    let status = item.get("status");
    let namespace = metadata
        .get("namespace")
        .and_then(Value::as_str)
        .unwrap_or("default")
        .to_string();
    let name = metadata.get("name").and_then(Value::as_str)?.to_string();
    let created_at = metadata
        .get("creationTimestamp")
        .and_then(Value::as_str)
        .map(ToString::to_string);
    let age_seconds = created_at
        .as_deref()
        .and_then(|timestamp| age_seconds(timestamp, now_epoch_seconds));
    let phase = status
        .and_then(|status| status.get("phase"))
        .and_then(Value::as_str)
        .unwrap_or("Unknown")
        .to_string();
    let node_name = spec
        .and_then(|spec| spec.get("nodeName"))
        .and_then(Value::as_str)
        .map(ToString::to_string);
    let containers = parse_pod_containers(spec.and_then(|spec| spec.get("containers")));
    let container_names: Vec<String> = containers
        .iter()
        .map(|container| container.name.clone())
        .collect();
    let total_containers = u64::try_from(containers.len()).unwrap_or(u64::MAX);
    let ready_containers = status
        .and_then(|status| status.get("containerStatuses"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|container| {
            container
                .get("ready")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .count();
    let ready_containers = u64::try_from(ready_containers).unwrap_or(u64::MAX);
    let restarts = status
        .and_then(|status| status.get("containerStatuses"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|container| container.get("restartCount").and_then(Value::as_u64))
        .fold(0_u64, u64::saturating_add);
    let requests = aggregate_container_requests(&containers);
    let limits = aggregate_container_limits(&containers);

    Some(KubernetesPodMetrics {
        namespace,
        name,
        phase,
        node_name,
        created_at,
        age_seconds,
        ready_containers,
        total_containers,
        restarts,
        container_names,
        requests,
        limits,
        live_usage: LiveResourceUsage::default(),
        containers,
    })
}

fn parse_pod_containers(containers: Option<&Value>) -> Vec<KubernetesContainerMetrics> {
    containers
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|container| {
            let name = container.get("name").and_then(Value::as_str)?.to_string();
            let resources = container.get("resources");
            let requests =
                resource_amount_from_map(resources.and_then(|resources| resources.get("requests")));
            let limits =
                resource_amount_from_map(resources.and_then(|resources| resources.get("limits")));
            Some(KubernetesContainerMetrics {
                name,
                requests,
                limits,
                live_usage: LiveResourceUsage::default(),
            })
        })
        .collect()
}

fn resource_amount_from_map(value: Option<&Value>) -> ResourceAmount {
    let cpu_milli_cores = value
        .and_then(|value| value.get("cpu"))
        .and_then(Value::as_str)
        .and_then(parse_cpu_quantity_to_milli);
    let memory_bytes = value
        .and_then(|value| value.get("memory"))
        .and_then(Value::as_str)
        .and_then(parse_memory_quantity_to_bytes);
    ResourceAmount {
        cpu_milli_cores,
        memory_bytes,
    }
}

fn aggregate_container_requests(containers: &[KubernetesContainerMetrics]) -> ResourceAmount {
    let mut total = ResourceAmount::default();
    for container in containers {
        add_resource_amount(&mut total, &container.requests);
    }
    total
}

fn aggregate_container_limits(containers: &[KubernetesContainerMetrics]) -> ResourceAmount {
    let mut total = ResourceAmount::default();
    for container in containers {
        add_resource_amount(&mut total, &container.limits);
    }
    total
}

fn add_resource_amount(total: &mut ResourceAmount, amount: &ResourceAmount) {
    total.cpu_milli_cores = add_optional_u64(total.cpu_milli_cores, amount.cpu_milli_cores);
    total.memory_bytes = add_optional_u64(total.memory_bytes, amount.memory_bytes);
}

fn add_live_usage(total: &mut LiveResourceUsage, usage: &LiveResourceUsage) {
    total.cpu_nano_cores = add_optional_u64(total.cpu_nano_cores, usage.cpu_nano_cores);
    total.memory_bytes = add_optional_u64(total.memory_bytes, usage.memory_bytes);
}

fn add_optional_u64(current: Option<u64>, value: Option<u64>) -> Option<u64> {
    match (current, value) {
        (Some(left), Some(right)) => Some(left.saturating_add(right)),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct PodKey {
    namespace: String,
    name: String,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct ContainerKey {
    namespace: String,
    pod: String,
    container: String,
}

#[derive(Clone, Debug, Default)]
struct SummaryUsage {
    pods: HashMap<PodKey, LiveResourceUsage>,
    containers: HashMap<ContainerKey, LiveResourceUsage>,
}

impl SummaryUsage {
    fn merge(&mut self, other: Self) {
        for (key, usage) in other.pods {
            self.pods
                .entry(key)
                .and_modify(|existing| add_live_usage(existing, &usage))
                .or_insert(usage);
        }
        for (key, usage) in other.containers {
            self.containers
                .entry(key)
                .and_modify(|existing| add_live_usage(existing, &usage))
                .or_insert(usage);
        }
    }
}

fn parse_kubelet_summary_usage(value: &Value) -> SummaryUsage {
    let mut usage = SummaryUsage::default();
    let Some(pods) = value.get("pods").and_then(Value::as_array) else {
        return usage;
    };

    for pod in pods {
        let Some(pod_ref) = pod.get("podRef") else {
            continue;
        };
        let Some(namespace) = pod_ref.get("namespace").and_then(Value::as_str) else {
            continue;
        };
        let Some(name) = pod_ref.get("name").and_then(Value::as_str) else {
            continue;
        };

        let pod_key = PodKey {
            namespace: namespace.to_string(),
            name: name.to_string(),
        };
        let mut container_total = LiveResourceUsage::default();
        if let Some(containers) = pod.get("containers").and_then(Value::as_array) {
            for container in containers {
                let Some(container_name) = container.get("name").and_then(Value::as_str) else {
                    continue;
                };
                let container_usage = summary_live_usage(container);
                add_live_usage(&mut container_total, &container_usage);
                usage.containers.insert(
                    ContainerKey {
                        namespace: namespace.to_string(),
                        pod: name.to_string(),
                        container: container_name.to_string(),
                    },
                    container_usage,
                );
            }
        }

        let pod_usage = summary_live_usage(pod);
        usage.pods.insert(
            pod_key,
            if pod_usage.cpu_nano_cores.is_some() || pod_usage.memory_bytes.is_some() {
                pod_usage
            } else {
                container_total
            },
        );
    }

    usage
}

fn summary_live_usage(value: &Value) -> LiveResourceUsage {
    LiveResourceUsage {
        cpu_nano_cores: value
            .get("cpu")
            .and_then(|cpu| cpu.get("usageNanoCores"))
            .and_then(Value::as_u64),
        memory_bytes: value
            .get("memory")
            .and_then(|memory| memory.get("workingSetBytes"))
            .and_then(Value::as_u64),
    }
}

fn apply_summary_usage(pods: &mut [KubernetesPodMetrics], usage: &SummaryUsage) {
    for pod in pods {
        let pod_key = PodKey {
            namespace: pod.namespace.clone(),
            name: pod.name.clone(),
        };
        if let Some(live_usage) = usage.pods.get(&pod_key) {
            pod.live_usage = live_usage.clone();
        }

        for container in &mut pod.containers {
            let container_key = ContainerKey {
                namespace: pod.namespace.clone(),
                pod: pod.name.clone(),
                container: container.name.clone(),
            };
            if let Some(live_usage) = usage.containers.get(&container_key) {
                container.live_usage = live_usage.clone();
            }
        }
    }
}

fn aggregate_resource_metrics(
    nodes: &[KubernetesNodeMetrics],
    pods: &[KubernetesPodMetrics],
) -> ResourceMetricTotals {
    let mut totals = ResourceMetricTotals {
        nodes: u64::try_from(nodes.len()).unwrap_or(u64::MAX),
        pods: u64::try_from(pods.len()).unwrap_or(u64::MAX),
        ..ResourceMetricTotals::default()
    };
    let mut by_namespace: BTreeMap<String, NamespaceResourceTotals> = BTreeMap::new();

    for node in nodes {
        add_resource_amount(&mut totals.node_capacity, &node.capacity);
        add_resource_amount(&mut totals.node_allocatable, &node.allocatable);
    }

    for pod in pods {
        totals.containers = totals.containers.saturating_add(pod.total_containers);
        totals.restarts = totals.restarts.saturating_add(pod.restarts);
        add_resource_amount(&mut totals.requests, &pod.requests);
        add_resource_amount(&mut totals.limits, &pod.limits);
        add_live_usage(&mut totals.live_usage, &pod.live_usage);

        let namespace = by_namespace
            .entry(pod.namespace.clone())
            .or_insert_with(|| NamespaceResourceTotals {
                namespace: pod.namespace.clone(),
                ..NamespaceResourceTotals::default()
            });
        namespace.pods = namespace.pods.saturating_add(1);
        namespace.containers = namespace.containers.saturating_add(pod.total_containers);
        namespace.restarts = namespace.restarts.saturating_add(pod.restarts);
        add_resource_amount(&mut namespace.requests, &pod.requests);
        add_resource_amount(&mut namespace.limits, &pod.limits);
        add_live_usage(&mut namespace.live_usage, &pod.live_usage);
    }

    totals.by_namespace = by_namespace.into_values().collect();
    totals
}

fn parse_cpu_quantity_to_milli(quantity: &str) -> Option<u64> {
    let quantity = quantity.trim();
    if quantity.is_empty() || quantity.starts_with('-') {
        return None;
    }

    if let Some(value) = quantity.strip_suffix('n') {
        return parse_decimal_scaled_to_u128(value, 1)
            .and_then(|nano_cores| ceil_div_u128(nano_cores, 1_000_000))
            .and_then(u128_to_u64);
    }
    if let Some(value) = quantity.strip_suffix('u') {
        return parse_decimal_scaled_to_u128(value, 1)
            .and_then(|micro_cores| ceil_div_u128(micro_cores, 1_000))
            .and_then(u128_to_u64);
    }
    if let Some(value) = quantity.strip_suffix('m') {
        return parse_decimal_scaled_to_u128(value, 1).and_then(u128_to_u64);
    }

    let (number, multiplier) = decimal_si_suffix(quantity).unwrap_or((quantity, 1));
    parse_decimal_scaled_to_u128(number, multiplier.saturating_mul(1_000)).and_then(u128_to_u64)
}

fn parse_memory_quantity_to_bytes(quantity: &str) -> Option<u64> {
    let quantity = quantity.trim();
    if quantity.is_empty() || quantity.starts_with('-') {
        return None;
    }

    let (number, multiplier) = memory_suffix(quantity).unwrap_or((quantity, 1));
    parse_decimal_scaled_to_u128(number, multiplier).and_then(u128_to_u64)
}

fn decimal_si_suffix(quantity: &str) -> Option<(&str, u128)> {
    for (suffix, multiplier) in [
        ("E", 1_000_000_000_000_000_000_u128),
        ("P", 1_000_000_000_000_000_u128),
        ("T", 1_000_000_000_000_u128),
        ("G", 1_000_000_000_u128),
        ("M", 1_000_000_u128),
        ("K", 1_000_u128),
        ("k", 1_000_u128),
    ] {
        if let Some(number) = quantity.strip_suffix(suffix) {
            return Some((number, multiplier));
        }
    }
    None
}

fn memory_suffix(quantity: &str) -> Option<(&str, u128)> {
    for (suffix, multiplier) in [
        ("EiB", 1_152_921_504_606_846_976_u128),
        ("PiB", 1_125_899_906_842_624_u128),
        ("TiB", 1_099_511_627_776_u128),
        ("GiB", 1_073_741_824_u128),
        ("MiB", 1_048_576_u128),
        ("KiB", 1_024_u128),
        ("Ei", 1_152_921_504_606_846_976_u128),
        ("Pi", 1_125_899_906_842_624_u128),
        ("Ti", 1_099_511_627_776_u128),
        ("Gi", 1_073_741_824_u128),
        ("Mi", 1_048_576_u128),
        ("Ki", 1_024_u128),
        ("EB", 1_000_000_000_000_000_000_u128),
        ("PB", 1_000_000_000_000_000_u128),
        ("TB", 1_000_000_000_000_u128),
        ("GB", 1_000_000_000_u128),
        ("MB", 1_000_000_u128),
        ("KB", 1_000_u128),
        ("E", 1_000_000_000_000_000_000_u128),
        ("P", 1_000_000_000_000_000_u128),
        ("T", 1_000_000_000_000_u128),
        ("G", 1_000_000_000_u128),
        ("M", 1_000_000_u128),
        ("K", 1_000_u128),
        ("k", 1_000_u128),
        ("B", 1_u128),
    ] {
        if let Some(number) = quantity.strip_suffix(suffix) {
            return Some((number, multiplier));
        }
    }
    None
}

fn parse_decimal_scaled_to_u128(number: &str, multiplier: u128) -> Option<u128> {
    let number = number.trim();
    if number.is_empty() || number.starts_with('-') {
        return None;
    }
    let (whole, fraction) = number.split_once('.').unwrap_or((number, ""));
    if whole.is_empty() && fraction.is_empty() {
        return None;
    }
    if !whole.chars().all(|character| character.is_ascii_digit())
        || !fraction.chars().all(|character| character.is_ascii_digit())
    {
        return None;
    }

    let whole_value = if whole.is_empty() {
        0
    } else {
        whole.parse::<u128>().ok()?
    };
    let whole_scaled = whole_value.checked_mul(multiplier)?;
    if fraction.is_empty() {
        return Some(whole_scaled);
    }

    let fraction_value = fraction.parse::<u128>().ok()?;
    let divisor = pow10_u128(fraction.len())?;
    let fraction_scaled = ceil_div_u128(fraction_value.checked_mul(multiplier)?, divisor)?;
    whole_scaled.checked_add(fraction_scaled)
}

fn pow10_u128(exponent: usize) -> Option<u128> {
    let mut value = 1_u128;
    for _ in 0..exponent {
        value = value.checked_mul(10)?;
    }
    Some(value)
}

fn ceil_div_u128(numerator: u128, denominator: u128) -> Option<u128> {
    if denominator == 0 {
        return None;
    }
    Some(numerator / denominator + u128::from(numerator % denominator != 0))
}

fn u128_to_u64(value: u128) -> Option<u64> {
    u64::try_from(value).ok()
}

fn age_seconds(timestamp: &str, now_epoch_seconds: u64) -> Option<u64> {
    parse_rfc3339_z_epoch_seconds(timestamp)
        .and_then(|created| now_epoch_seconds.checked_sub(created))
}

fn parse_rfc3339_z_epoch_seconds(timestamp: &str) -> Option<u64> {
    let trimmed = timestamp.trim();
    let trimmed = trimmed.strip_suffix('Z')?;
    let (date, time) = trimmed.split_once('T')?;
    let mut date_parts = date.split('-');
    let year = date_parts.next()?.parse::<i64>().ok()?;
    let month = date_parts.next()?.parse::<u32>().ok()?;
    let day = date_parts.next()?.parse::<u32>().ok()?;
    if date_parts.next().is_some() {
        return None;
    }

    let time = time.split_once('.').map_or(time, |(whole, _)| whole);
    let mut time_parts = time.split(':');
    let hour = time_parts.next()?.parse::<u32>().ok()?;
    let minute = time_parts.next()?.parse::<u32>().ok()?;
    let second = time_parts.next()?.parse::<u32>().ok()?;
    if time_parts.next().is_some()
        || !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 60
    {
        return None;
    }

    let days = days_from_civil(year, month, day)?;
    let seconds = days
        .checked_mul(86_400)?
        .checked_add(i64::from(hour) * 3_600)?
        .checked_add(i64::from(minute) * 60)?
        .checked_add(i64::from(second))?;
    u64::try_from(seconds).ok()
}

fn days_from_civil(year: i64, month: u32, day: u32) -> Option<i64> {
    let month = i64::from(month);
    let day = i64::from(day);
    let adjusted_year = year - i64::from(month <= 2);
    let era = if adjusted_year >= 0 {
        adjusted_year
    } else {
        adjusted_year - 399
    } / 400;
    let year_of_era = adjusted_year - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    if !(0..=365).contains(&day_of_year) {
        return None;
    }
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    Some(era * 146_097 + day_of_era - 719_468)
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

fn env_var_trimmed(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_var_source(name: &str) -> Option<String> {
    env_var_trimmed(name).map(|_| name.to_string())
}

fn bootstrap_tool_key_defaults() -> BTreeMap<String, BootstrapToolKeyDefaults> {
    BOOTSTRAP_TOOL_API_KEY_ENV_NAMES
        .iter()
        .map(|name| {
            (
                (*name).to_string(),
                BootstrapToolKeyDefaults {
                    value: env_var_trimmed(name).unwrap_or_default(),
                    value_source: env_var_source(name),
                },
            )
        })
        .collect()
}

fn normalize_bootstrap_github_credentials(
    request: Option<&BootstrapLocalStackRequest>,
) -> BootstrapResult<Option<BootstrapGithubCredentials>> {
    let github = if let Some(request) = request {
        request.github.clone()
    } else {
        let defaults = local_stack_bootstrap_defaults().github;
        Some(BootstrapGithubRequest {
            enabled: Some(true),
            token: (!defaults.token.is_empty()).then_some(defaults.token),
            owner: (!defaults.owner.is_empty()).then_some(defaults.owner),
        })
    };

    let Some(github) = github else {
        return Ok(None);
    };
    if github.enabled == Some(false) {
        return Ok(None);
    }

    let token = github
        .token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(validate_github_token)
        .transpose()?;
    let owner = github
        .owner
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(validate_github_owner)
        .transpose()?;

    if token.is_none() && owner.is_none() {
        return Ok(None);
    }

    Ok(Some(BootstrapGithubCredentials { token, owner }))
}

fn normalize_bootstrap_tool_api_keys(
    request: Option<&BootstrapLocalStackRequest>,
) -> BootstrapResult<Vec<BootstrapAgentKey>> {
    let requested_keys = request
        .and_then(|request| request.tools.as_ref())
        .map_or_else(default_bootstrap_tool_api_key_requests, |tools| {
            tools.api_keys.clone()
        });

    let mut normalized = BTreeMap::new();
    for key in requested_keys {
        let name = validate_bootstrap_tool_api_key_name(&key.name)?;
        let value = key.value.trim();
        if value.is_empty() {
            continue;
        }
        validate_bootstrap_secret_value(value, &name)?;
        if normalized.contains_key(&name) {
            return Err(format!("duplicate tool API key entry for {name}"));
        }
        normalized.insert(name, value.to_string());
    }

    Ok(normalized
        .into_iter()
        .map(|(name, value)| BootstrapAgentKey { name, value })
        .collect())
}

fn default_bootstrap_tool_api_key_requests() -> Vec<BootstrapToolApiKeyRequest> {
    BOOTSTRAP_TOOL_API_KEY_ENV_NAMES
        .iter()
        .filter_map(|name| {
            env_var_trimmed(name).map(|value| BootstrapToolApiKeyRequest {
                name: (*name).to_string(),
                value,
            })
        })
        .collect()
}

fn validate_bootstrap_tool_api_key_name(raw: &str) -> BootstrapResult<String> {
    let name = raw.trim().to_ascii_uppercase();
    if BOOTSTRAP_TOOL_API_KEY_ENV_NAMES
        .iter()
        .any(|allowed| *allowed == name)
    {
        Ok(name)
    } else {
        Err(format!("unsupported tool API key: {raw}"))
    }
}

fn validate_bootstrap_secret_value(value: &str, label: &str) -> BootstrapResult<()> {
    if value.chars().any(char::is_control) {
        return Err(format!("{label} must not contain control characters"));
    }
    Ok(())
}

fn bootstrap_agent_keys(
    github_credentials: Option<&BootstrapGithubCredentials>,
    tool_api_keys: &[BootstrapAgentKey],
) -> Vec<BootstrapAgentKey> {
    let mut keys = Vec::new();
    if let Some(token) = github_credentials.and_then(|credentials| credentials.token.as_ref()) {
        keys.push(BootstrapAgentKey {
            name: GITHUB_TOKEN_SECRET_KEY.to_string(),
            value: token.clone(),
        });
    }
    keys.extend(tool_api_keys.iter().cloned());
    keys
}

fn persist_bootstrap_setup(
    window: &Window,
    setup: Option<&BootstrapSetupProfile>,
) -> BootstrapResult<()> {
    let Some(setup) = setup else {
        return Ok(());
    };

    validate_bootstrap_setup(setup)?;
    let path = bootstrap_setup_path(window)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    let json = serde_json::to_vec_pretty(setup)
        .map_err(|error| format!("failed to serialize bootstrap setup: {error}"))?;
    std::fs::write(&path, json)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn bootstrap_setup_path(window: &Window) -> BootstrapResult<PathBuf> {
    let dir = window
        .app_handle()
        .path()
        .app_config_dir()
        .map_err(|error| format!("failed to resolve app config dir: {error}"))?
        .join("bootstrap");
    Ok(dir.join("setup.json"))
}

fn validate_bootstrap_setup(setup: &BootstrapSetupProfile) -> BootstrapResult<()> {
    validate_nonempty_text(&setup.source.owner, "source owner")?;
    validate_bootstrap_connection_id(&setup.source.connection_id)?;
    validate_bootstrap_base_url(&setup.source.base_url)?;

    if setup.harness.clis.is_empty() {
        return Err("bootstrap setup requires at least one selected CLI agent".to_string());
    }
    if setup.harness.providers.is_empty() {
        return Err("bootstrap setup requires at least one provider/model selection".to_string());
    }
    for provider in &setup.harness.providers {
        validate_nonempty_text(&provider.id, "provider id")?;
        validate_nonempty_text(&provider.model, "provider model")?;
        for model in &provider.models {
            validate_nonempty_text(model, "provider model")?;
        }
    }

    Ok(())
}

fn validate_nonempty_text(value: &str, label: &str) -> BootstrapResult<()> {
    let value = value.trim();
    if value.is_empty() || value.chars().any(char::is_control) {
        return Err(format!(
            "{label} must be set and must not contain control characters"
        ));
    }
    Ok(())
}

fn validate_bootstrap_base_url(raw: &str) -> BootstrapResult<()> {
    let url = reqwest::Url::parse(raw.trim())
        .map_err(|error| format!("invalid source-control base URL: {error}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("source-control base URL must use http or https".to_string());
    }
    Ok(())
}

fn validate_bootstrap_connection_id(connection_id: &str) -> BootstrapResult<()> {
    let valid = !connection_id.is_empty()
        && connection_id.len() <= 48
        && connection_id
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
        && !connection_id.starts_with('-')
        && !connection_id.ends_with('-');
    if !valid {
        return Err(
            "source-control connection ID must be lowercase letters, numbers, or hyphens"
                .to_string(),
        );
    }
    Ok(())
}

fn validate_github_token(token: &str) -> BootstrapResult<String> {
    if token.chars().any(char::is_control) {
        return Err("GitHub PAT must not contain control characters or newlines".to_string());
    }
    Ok(token.to_string())
}

fn validate_github_owner(owner: &str) -> BootstrapResult<String> {
    let valid = owner.len() <= 100
        && owner
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
        && !owner.starts_with('-')
        && !owner.ends_with('-');
    if !valid {
        return Err(
            "GitHub owner/org must use only letters, numbers, and hyphens, and cannot start or end with a hyphen"
                .to_string(),
        );
    }
    Ok(owner.to_string())
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

fn ensure_container_runtime(window: &Window) -> BootstrapResult<RuntimeKind> {
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

fn ensure_kind_cluster(runtime_kind: RuntimeKind) -> BootstrapResult<()> {
    let previous_context = current_kubectl_context()?;
    let restarted_containers = ensure_persisted_kind_node_containers_started(runtime_kind)?;
    if restarted_containers > 0 {
        tracing::info!(
            "Started {restarted_containers} persisted Kind node container(s) for cluster '{}'",
            CLUSTER_NAME
        );
        if !wait_for_kind_cluster_listed(Duration::from_secs(30)) {
            return Err(format!(
                "Started persisted Kind node container(s) for cluster '{CLUSTER_NAME}', but \
                 `kind get clusters` did not report the cluster in time."
            ));
        }
    }

    if kind_cluster_exists()? {
        ensure_kind_kube_context(previous_context.as_deref())?;
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
        ensure_kind_kube_context(previous_context.as_deref())
    } else {
        Err(format!(
            "kind create cluster failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn ensure_persisted_kind_node_containers_started(runtime: RuntimeKind) -> BootstrapResult<usize> {
    let containers = list_kind_node_container_states(runtime)?;
    let stopped_containers = containers
        .iter()
        .filter(|container| !container.is_running())
        .collect::<Vec<_>>();

    for container in &stopped_containers {
        start_kind_node_container(runtime, &container.name)?;
    }

    Ok(stopped_containers.len())
}

fn list_kind_node_container_states(
    runtime: RuntimeKind,
) -> BootstrapResult<Vec<KindNodeContainerState>> {
    let runtime_tool = runtime_stats_tool(runtime);
    let label_filter = format!("label={KIND_CLUSTER_LABEL_KEY}={CLUSTER_NAME}");
    let mut command = tool_command(runtime_tool);
    command.args([
        "ps",
        "-a",
        "--filter",
        label_filter.as_str(),
        "--format",
        "{{.Names}} {{.State}}",
    ]);
    let label = format!("{runtime_tool} ps -a for Kind cluster");
    let output = run_command(command, &label)?;
    if !output.status.success() {
        return Err(command_failure_message(&label, &output));
    }

    Ok(parse_kind_node_container_states(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

fn parse_kind_node_container_states(stdout: &str) -> Vec<KindNodeContainerState> {
    stdout
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }

            let (name, state) = line.split_once('\t').or_else(|| line.split_once(' '))?;
            let name = name.trim();
            let state = state.trim();
            if name.is_empty() || state.is_empty() {
                return None;
            }

            Some(KindNodeContainerState {
                name: name.to_string(),
                state: state.to_string(),
            })
        })
        .collect()
}

fn start_kind_node_container(runtime: RuntimeKind, name: &str) -> BootstrapResult<()> {
    let runtime_tool = runtime_stats_tool(runtime);
    let mut command = tool_command(runtime_tool);
    command.args(["start", name]);
    let label = format!("{runtime_tool} start {name}");
    let output = run_command(command, &label)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_failure_message(&label, &output))
    }
}

fn ensure_kind_kube_context(previous_context: Option<&str>) -> BootstrapResult<()> {
    if kind_kube_context_ready()? {
        restore_previous_kubectl_context(previous_context);
        return Ok(());
    }

    tracing::warn!(
        "Kind cluster '{}' exists but kubectl context '{}' is not usable; re-exporting kubeconfig",
        CLUSTER_NAME,
        KIND_CONTEXT
    );
    export_kind_kubeconfig()?;
    restore_previous_kubectl_context(previous_context);

    if wait_for_kind_kube_context(Duration::from_secs(30)) {
        Ok(())
    } else {
        Err(format!(
            "Kind cluster '{CLUSTER_NAME}' exists, but kubectl context '{KIND_CONTEXT}' is not \
             usable after re-exporting kubeconfig."
        ))
    }
}

fn kind_kube_context_ready() -> BootstrapResult<bool> {
    let output = run_kubectl(&["cluster-info"])?;
    Ok(output.status.success())
}

fn wait_for_kind_kube_context(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if kind_kube_context_ready().unwrap_or(false) {
            return true;
        }
        thread::sleep(Duration::from_secs(2));
    }

    false
}

fn wait_for_kind_cluster_listed(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if kind_cluster_exists().unwrap_or(false) {
            return true;
        }
        thread::sleep(Duration::from_secs(2));
    }

    false
}

fn export_kind_kubeconfig() -> BootstrapResult<()> {
    let mut command = kind_command();
    command.args(["export", "kubeconfig", "--name", CLUSTER_NAME]);
    run_expecting_success(command, "kind export kubeconfig")
}

fn current_kubectl_context() -> BootstrapResult<Option<String>> {
    let mut command = tool_command("kubectl");
    command.args(["config", "current-context"]);
    let output = run_command(command, "kubectl config current-context")?;
    if !output.status.success() {
        return Ok(None);
    }

    let context = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!context.is_empty()).then_some(context))
}

fn restore_previous_kubectl_context(previous_context: Option<&str>) {
    match previous_context {
        Some(context) if context != KIND_CONTEXT => {
            let mut command = tool_command("kubectl");
            command.args(["config", "use-context", context]);
            if let Err(error) = run_expecting_success(command, "kubectl config use-context") {
                tracing::warn!("Failed to restore kubectl context '{}': {}", context, error);
            }
        }
        None => {
            let mut command = tool_command("kubectl");
            command.args(["config", "unset", "current-context"]);
            let _ = command.output();
        }
        _ => {}
    }
}

fn kind_cluster_exists() -> BootstrapResult<bool> {
    let mut command = kind_command();
    command.args(["get", "clusters"]);
    let output = run_command(command, "kind get clusters")?;
    if !output.status.success() {
        return Err(command_failure_message("kind get clusters", &output));
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

fn apply_bootstrap_agent_keys(agent_keys: &[BootstrapAgentKey]) -> BootstrapResult<()> {
    if agent_keys.is_empty() {
        tracing::warn!(
            "No local API keys configured for bootstrap; cto-tools providers that require keys will stay unavailable"
        );
        return Ok(());
    }

    tracing::info!(
        "Applying {} local API key(s) to {}",
        agent_keys.len(),
        CTO_AGENT_KEYS_SECRET
    );
    apply_manifest(&agent_keys_secret_manifest(agent_keys)?)
        .map_err(|error| format!("Failed to apply local API key Secret: {error}"))
}

fn patch_bootstrap_cto_agent_keys(agent_keys: &[BootstrapAgentKey]) -> BootstrapResult<()> {
    if agent_keys.is_empty() {
        return Ok(());
    }

    tracing::info!("Configuring CTO chart agentKeys from setup API keys");
    let agent_keys = agent_keys
        .iter()
        .map(|key| (key.name.clone(), json!(key.value)))
        .collect::<serde_json::Map<_, _>>();
    let patch = json!({
        "spec": {
            "source": {
                "helm": {
                    "valuesObject": {
                        "agentKeys": agent_keys
                    }
                }
            }
        }
    })
    .to_string();
    run_kubectl(&[
        "-n",
        ARGOCD_NAMESPACE,
        "patch",
        "application",
        "cto",
        "--type",
        "merge",
        "-p",
        &patch,
    ])
    .map(|_| ())
    .map_err(|error| format!("Failed to configure CTO API keys: {error}"))
}

fn patch_bootstrap_github_owner(
    mode: BootstrapAppMode,
    credentials: Option<&BootstrapGithubCredentials>,
) -> BootstrapResult<()> {
    if mode.skips_layered_apps() {
        return Ok(());
    }
    let Some(owner) = credentials.and_then(|credentials| credentials.owner.as_deref()) else {
        return Ok(());
    };

    tracing::info!("Configuring Morgan project-api GitHub owner: {}", owner);
    let patch = json!({
        "spec": {
            "source": {
                "helm": {
                    "valuesObject": {
                        "projectApi": {
                            "githubOrg": owner
                        }
                    }
                }
            }
        }
    })
    .to_string();
    run_kubectl(&[
        "-n",
        ARGOCD_NAMESPACE,
        "patch",
        "application",
        "morgan",
        "--type",
        "merge",
        "-p",
        &patch,
    ])
    .map(|_| ())
    .map_err(|error| format!("Failed to configure Morgan GitHub owner: {error}"))
}

fn agent_keys_secret_manifest(agent_keys: &[BootstrapAgentKey]) -> BootstrapResult<String> {
    let mut secret_entries = String::new();
    for key in agent_keys {
        let quoted_value = serde_json::to_string(&key.value)
            .map_err(|error| format!("Failed to render {} Secret value: {error}", key.name))?;
        writeln!(secret_entries, "  {}: {quoted_value}", key.name)
            .map_err(|error| format!("Failed to render {} Secret value: {error}", key.name))?;
    }

    Ok(format!(
        r"apiVersion: v1
kind: Secret
metadata:
  name: {CTO_AGENT_KEYS_SECRET}
  namespace: {CTO_NAMESPACE}
  labels:
    app.kubernetes.io/name: cto
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: cto-desktop
type: Opaque
stringData:
{secret_entries}
"
    ))
}

async fn install_metrics_server_for_kind() -> BootstrapResult<()> {
    tracing::info!("Installing metrics-server for Lens metrics API discovery");
    apply_remote_manifest_server_side(METRICS_SERVER_MANIFEST_URL)
        .await
        .map_err(|error| format!("Failed to apply metrics-server manifest for Lens: {error}"))?;
    patch_metrics_server_for_kind()?;
    wait_for_rollout(METRICS_SERVER_NAMESPACE, METRICS_SERVER_DEPLOYMENT, "180s")
        .map_err(|error| format!("metrics-server rollout failed after Kind patch: {error}"))?;
    wait_for_api_service_available(METRICS_SERVER_API_SERVICE, "120s")
}

fn patch_metrics_server_for_kind() -> BootstrapResult<()> {
    let output = run_kubectl(&[
        "get",
        "deployment",
        "metrics-server",
        "-n",
        METRICS_SERVER_NAMESPACE,
        "-o",
        "json",
    ])?;
    if !output.status.success() {
        return Err(format!(
            "Failed to read metrics-server deployment before Kind patch: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let deployment = serde_json::from_slice::<Value>(&output.stdout).map_err(|error| {
        format!("Failed to parse metrics-server deployment before Kind patch: {error}")
    })?;
    let patch = metrics_server_kind_patch(&deployment)?;
    if patch.is_empty() {
        return Ok(());
    }

    let patch_json = serde_json::to_string(&patch).map_err(|error| {
        format!("Failed to serialize metrics-server Kind compatibility patch: {error}")
    })?;
    let output = run_kubectl(&[
        "patch",
        "deployment",
        "metrics-server",
        "-n",
        METRICS_SERVER_NAMESPACE,
        "--type=json",
        "-p",
        &patch_json,
    ])?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to patch metrics-server deployment for Kind Lens metrics: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn metrics_server_kind_patch(deployment: &Value) -> BootstrapResult<Vec<Value>> {
    let containers = deployment
        .pointer("/spec/template/spec/containers")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            "metrics-server deployment is missing spec.template.spec.containers".to_string()
        })?;
    let (container_index, container) = containers
        .iter()
        .enumerate()
        .find(|(_, container)| {
            container
                .get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| name == "metrics-server")
        })
        .ok_or_else(|| "metrics-server deployment has no metrics-server container".to_string())?;
    let args_path = format!("/spec/template/spec/containers/{container_index}/args");
    let Some(args_value) = container.get("args") else {
        return Ok(vec![serde_json::json!({
            "op": "add",
            "path": args_path,
            "value": [
                METRICS_SERVER_KUBELET_INSECURE_TLS_ARG,
                METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_ARG,
            ],
        })]);
    };
    let args = args_value.as_array().ok_or_else(|| {
        "metrics-server deployment container args field is not an array".to_string()
    })?;

    let mut patch = Vec::new();
    if !args.iter().any(|arg| {
        arg.as_str()
            .is_some_and(|arg| metrics_arg_matches(arg, METRICS_SERVER_KUBELET_INSECURE_TLS_ARG))
    }) {
        patch.push(serde_json::json!({
            "op": "add",
            "path": format!("{args_path}/-"),
            "value": METRICS_SERVER_KUBELET_INSECURE_TLS_ARG,
        }));
    }

    match args.iter().enumerate().find_map(|(index, arg)| {
        arg.as_str()
            .filter(|arg| arg.starts_with(METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_PREFIX))
            .map(|arg| (index, arg))
    }) {
        Some((_, arg)) if arg == METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_ARG => {}
        Some((index, _)) => patch.push(serde_json::json!({
            "op": "replace",
            "path": format!("{args_path}/{index}"),
            "value": METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_ARG,
        })),
        None => patch.push(serde_json::json!({
            "op": "add",
            "path": format!("{args_path}/-"),
            "value": METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_ARG,
        })),
    }

    Ok(patch)
}

fn metrics_arg_matches(arg: &str, flag: &str) -> bool {
    arg == flag
        || arg
            .strip_prefix(flag)
            .is_some_and(|suffix| suffix.starts_with('='))
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

fn wait_for_api_service_available(name: &str, timeout: &str) -> BootstrapResult<()> {
    let resource = format!("apiservice/{name}");
    let output = run_kubectl(&[
        "wait",
        "--for=condition=Available",
        &resource,
        "--timeout",
        timeout,
    ])?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Timed out waiting for APIService {} to become Available for Lens metrics: {}",
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

fn install_argocd() -> BootstrapResult<()> {
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
    use super::{
        agent_keys_secret_manifest, aggregate_resource_metrics, apply_summary_usage,
        metrics_server_kind_patch, normalize_bootstrap_github_credentials,
        normalize_bootstrap_tool_api_keys, parse_cpu_quantity_to_milli,
        parse_kind_node_container_states, parse_kubelet_summary_usage, parse_kubernetes_nodes,
        parse_kubernetes_pods, parse_memory_quantity_to_bytes, parse_runtime_stats_lines,
        validate_bootstrap_setup, BootstrapAgentKey, BootstrapAiCli, BootstrapAppMode,
        BootstrapGithubRequest, BootstrapHarnessMode, BootstrapLocalStackRequest,
        BootstrapProviderAuth, BootstrapProviderSelection, BootstrapSetupHarness,
        BootstrapSetupProfile, BootstrapSetupSource, BootstrapSourceProvider,
        BootstrapToolApiKeyRequest, BootstrapToolsRequest, KindNodeContainerState,
        BOOTSTRAP_TEST_MODE_ENV, GITHUB_TOKEN_SECRET_KEY, METRICS_SERVER_KUBELET_INSECURE_TLS_ARG,
        METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_ARG,
    };
    use serde_json::json;

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
        assert_eq!(full_names, ["cto", "qdrant", "morgan", "voice-bridge"]);

        let controller_only_names: Vec<_> = BootstrapAppMode::ControllerOnly
            .manifests()
            .iter()
            .map(|app| app.name)
            .collect();
        assert_eq!(controller_only_names, ["cto"]);
    }

    #[test]
    fn metrics_server_kind_patch_adds_missing_kind_args() {
        let deployment = json!({
            "spec": {
                "template": {
                    "spec": {
                        "containers": [{
                            "name": "metrics-server",
                            "args": [
                                "--cert-dir=/tmp",
                                "--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname"
                            ]
                        }]
                    }
                }
            }
        });

        let patch = metrics_server_kind_patch(&deployment).unwrap();

        assert_eq!(
            patch,
            vec![
                json!({
                    "op": "add",
                    "path": "/spec/template/spec/containers/0/args/-",
                    "value": METRICS_SERVER_KUBELET_INSECURE_TLS_ARG,
                }),
                json!({
                    "op": "replace",
                    "path": "/spec/template/spec/containers/0/args/1",
                    "value": METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_ARG,
                }),
            ]
        );
    }

    #[test]
    fn metrics_server_kind_patch_is_idempotent_when_kind_args_exist() {
        let deployment = json!({
            "spec": {
                "template": {
                    "spec": {
                        "containers": [{
                            "name": "metrics-server",
                            "args": [
                                "--cert-dir=/tmp",
                                METRICS_SERVER_KUBELET_INSECURE_TLS_ARG,
                                METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_ARG
                            ]
                        }]
                    }
                }
            }
        });

        let patch = metrics_server_kind_patch(&deployment).unwrap();

        assert!(patch.is_empty());
    }

    #[test]
    fn parses_kind_node_container_states() {
        let states = parse_kind_node_container_states(
            "cto-app-control-plane\trunning\ncto-app-worker\texited\n\nmalformed\n",
        );

        assert_eq!(
            states,
            vec![
                KindNodeContainerState {
                    name: "cto-app-control-plane".to_string(),
                    state: "running".to_string(),
                },
                KindNodeContainerState {
                    name: "cto-app-worker".to_string(),
                    state: "exited".to_string(),
                },
            ]
        );
        assert!(states[0].is_running());
        assert!(!states[1].is_running());
    }

    #[test]
    fn parses_kubernetes_cpu_quantities_to_millicores() {
        assert_eq!(parse_cpu_quantity_to_milli("250m"), Some(250));
        assert_eq!(parse_cpu_quantity_to_milli("2"), Some(2_000));
        assert_eq!(parse_cpu_quantity_to_milli("0.5"), Some(500));
        assert_eq!(parse_cpu_quantity_to_milli("250u"), Some(1));
        assert_eq!(parse_cpu_quantity_to_milli("1000000n"), Some(1));
    }

    #[test]
    fn parses_kubernetes_memory_quantities_to_bytes() {
        assert_eq!(parse_memory_quantity_to_bytes("128Mi"), Some(134_217_728));
        assert_eq!(parse_memory_quantity_to_bytes("1Gi"), Some(1_073_741_824));
        assert_eq!(parse_memory_quantity_to_bytes("500M"), Some(500_000_000));
        assert_eq!(parse_memory_quantity_to_bytes("42"), Some(42));
        assert_eq!(parse_memory_quantity_to_bytes("1.5Ki"), Some(1_536));
    }

    #[test]
    fn parses_runtime_container_stats_and_skips_unparseable_lines() {
        let stdout = r#"
{"Name":"cto-app-control-plane","CPUPerc":"12.5%","MemUsage":"1.5MiB / 2GiB","MemPerc":"0.07%","PIDs":"7"}
not-json
{"CPUPerc":"99%"}
"#;

        let stats = parse_runtime_stats_lines(stdout, "Docker");

        assert_eq!(stats.len(), 1);
        let container = &stats[0];
        assert_eq!(container.name, "cto-app-control-plane");
        assert_eq!(container.runtime, "Docker");
        assert!(container.stats_available);
        assert_eq!(container.unavailable_reason, None);
        assert_eq!(container.cpu_percent, Some(12.5));
        assert_eq!(container.memory_usage_bytes, Some(1_572_864));
        assert_eq!(container.memory_limit_bytes, Some(2_147_483_648));
        assert_eq!(container.memory_percent, Some(0.07));
        assert_eq!(container.pids, Some(7));
        assert_eq!(
            container.raw.get("MemUsage").map(String::as_str),
            Some("1.5MiB / 2GiB")
        );
    }

    #[test]
    fn parses_kubernetes_node_inventory_roles_readiness_and_capacity() {
        let nodes_json = json!({
            "items": [
                {
                    "metadata": {
                        "name": "cto-app-control-plane",
                        "creationTimestamp": "1970-01-01T00:00:10Z",
                        "labels": {
                            "node-role.kubernetes.io/control-plane": "",
                            "node-role.kubernetes.io/master": ""
                        }
                    },
                    "status": {
                        "conditions": [{ "type": "Ready", "status": "True" }],
                        "capacity": { "cpu": "4", "memory": "8Gi" },
                        "allocatable": { "cpu": "3500m", "memory": "7Gi" }
                    }
                },
                {
                    "metadata": {
                        "name": "cto-app-worker",
                        "creationTimestamp": "1970-01-01T00:00:20Z",
                        "labels": {}
                    },
                    "status": {
                        "conditions": [{ "type": "Ready", "status": "False" }],
                        "capacity": { "cpu": "2", "memory": "4Gi" },
                        "allocatable": { "cpu": "1900m", "memory": "3Gi" }
                    }
                }
            ]
        });

        let nodes = parse_kubernetes_nodes(&nodes_json, 70);

        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].name, "cto-app-control-plane");
        assert!(nodes[0].ready);
        assert_eq!(nodes[0].roles, ["control-plane", "master"]);
        assert_eq!(nodes[0].age_seconds, Some(60));
        assert_eq!(nodes[0].capacity.cpu_milli_cores, Some(4_000));
        assert_eq!(nodes[0].capacity.memory_bytes, Some(8_589_934_592));
        assert_eq!(nodes[0].allocatable.cpu_milli_cores, Some(3_500));
        assert_eq!(nodes[0].allocatable.memory_bytes, Some(7_516_192_768));
        assert_eq!(nodes[1].roles, ["worker"]);
        assert!(!nodes[1].ready);
    }

    #[test]
    fn parses_pod_resources_and_applies_kubelet_summary_usage() {
        let pods_json = json!({
            "items": [{
                "metadata": {
                    "namespace": "default",
                    "name": "web",
                    "creationTimestamp": "1970-01-01T00:00:10Z"
                },
                "spec": {
                    "nodeName": "cto-app-control-plane",
                    "containers": [{
                        "name": "app",
                        "resources": {
                            "requests": { "cpu": "250m", "memory": "128Mi" },
                            "limits": { "cpu": "1", "memory": "256Mi" }
                        }
                    }]
                },
                "status": {
                    "phase": "Running",
                    "containerStatuses": [{
                        "name": "app",
                        "ready": true,
                        "restartCount": 2
                    }]
                }
            }]
        });
        let mut pods = parse_kubernetes_pods(&pods_json, 70);
        assert_eq!(pods.len(), 1);
        assert_eq!(pods[0].age_seconds, Some(60));
        assert_eq!(pods[0].requests.cpu_milli_cores, Some(250));
        assert_eq!(pods[0].limits.memory_bytes, Some(268_435_456));

        let summary_json = json!({
            "pods": [{
                "podRef": { "namespace": "default", "name": "web" },
                "cpu": { "usageNanoCores": 25_000_000_u64 },
                "memory": { "workingSetBytes": 64_000_000_u64 },
                "containers": [{
                    "name": "app",
                    "cpu": { "usageNanoCores": 20_000_000_u64 },
                    "memory": { "workingSetBytes": 60_000_000_u64 }
                }]
            }]
        });
        let usage = parse_kubelet_summary_usage(&summary_json);
        apply_summary_usage(&mut pods, &usage);

        assert_eq!(pods[0].live_usage.cpu_nano_cores, Some(25_000_000));
        assert_eq!(pods[0].live_usage.memory_bytes, Some(64_000_000));
        assert_eq!(
            pods[0].containers[0].live_usage.cpu_nano_cores,
            Some(20_000_000)
        );
    }

    #[test]
    fn aggregates_resource_totals_by_namespace() {
        let nodes_json = json!({
            "items": [{
                "metadata": { "name": "cto-app-control-plane" },
                "status": {
                    "conditions": [{ "type": "Ready", "status": "True" }],
                    "capacity": { "cpu": "4", "memory": "8Gi" },
                    "allocatable": { "cpu": "3500m", "memory": "7Gi" }
                }
            }]
        });
        let pods_json = json!({
            "items": [
                {
                    "metadata": { "namespace": "default", "name": "web" },
                    "spec": {
                        "containers": [{
                            "name": "app",
                            "resources": {
                                "requests": { "cpu": "250m", "memory": "128Mi" },
                                "limits": { "cpu": "500m", "memory": "256Mi" }
                            }
                        }]
                    },
                    "status": {
                        "phase": "Running",
                        "containerStatuses": [{ "ready": true, "restartCount": 1 }]
                    }
                },
                {
                    "metadata": { "namespace": "argocd", "name": "controller" },
                    "spec": {
                        "containers": [{
                            "name": "controller",
                            "resources": {
                                "requests": { "cpu": "100m", "memory": "64Mi" },
                                "limits": { "cpu": "250m", "memory": "128Mi" }
                            }
                        }]
                    },
                    "status": {
                        "phase": "Running",
                        "containerStatuses": [{ "ready": true, "restartCount": 3 }]
                    }
                }
            ]
        });
        let summary_json = json!({
            "pods": [
                {
                    "podRef": { "namespace": "default", "name": "web" },
                    "cpu": { "usageNanoCores": 10_000_000_u64 },
                    "memory": { "workingSetBytes": 32_000_000_u64 }
                },
                {
                    "podRef": { "namespace": "argocd", "name": "controller" },
                    "cpu": { "usageNanoCores": 20_000_000_u64 },
                    "memory": { "workingSetBytes": 64_000_000_u64 }
                }
            ]
        });
        let nodes = parse_kubernetes_nodes(&nodes_json, 0);
        let mut pods = parse_kubernetes_pods(&pods_json, 0);
        let usage = parse_kubelet_summary_usage(&summary_json);
        apply_summary_usage(&mut pods, &usage);
        let totals = aggregate_resource_metrics(&nodes, &pods);

        assert_eq!(totals.nodes, 1);
        assert_eq!(totals.pods, 2);
        assert_eq!(totals.containers, 2);
        assert_eq!(totals.restarts, 4);
        assert_eq!(totals.node_capacity.cpu_milli_cores, Some(4_000));
        assert_eq!(totals.node_capacity.memory_bytes, Some(8_589_934_592));
        assert_eq!(totals.node_allocatable.cpu_milli_cores, Some(3_500));
        assert_eq!(totals.node_allocatable.memory_bytes, Some(7_516_192_768));
        assert_eq!(totals.requests.cpu_milli_cores, Some(350));
        assert_eq!(totals.requests.memory_bytes, Some(201_326_592));
        assert_eq!(totals.live_usage.cpu_nano_cores, Some(30_000_000));
        assert_eq!(totals.live_usage.memory_bytes, Some(96_000_000));
        assert_eq!(totals.by_namespace.len(), 2);
        assert_eq!(totals.by_namespace[0].namespace, "argocd");
        assert_eq!(
            totals.by_namespace[0].live_usage.cpu_nano_cores,
            Some(20_000_000)
        );
        assert_eq!(totals.by_namespace[1].namespace, "default");
        assert_eq!(
            totals.by_namespace[1].live_usage.memory_bytes,
            Some(32_000_000)
        );
    }

    #[test]
    fn normalizes_bootstrap_github_credentials() {
        let credentials =
            normalize_bootstrap_github_credentials(Some(&BootstrapLocalStackRequest {
                github: Some(BootstrapGithubRequest {
                    enabled: Some(true),
                    token: Some("  github_pat_example  ".to_string()),
                    owner: Some("acme-dev".to_string()),
                }),
                tools: None,
                setup: None,
            }))
            .expect("credentials")
            .expect("enabled credentials");

        assert_eq!(credentials.token.as_deref(), Some("github_pat_example"));
        assert_eq!(credentials.owner.as_deref(), Some("acme-dev"));
    }

    #[test]
    fn skips_disabled_bootstrap_github_credentials() {
        let credentials =
            normalize_bootstrap_github_credentials(Some(&BootstrapLocalStackRequest {
                github: Some(BootstrapGithubRequest {
                    enabled: Some(false),
                    token: Some("github_pat_example".to_string()),
                    owner: Some("acme-dev".to_string()),
                }),
                tools: None,
                setup: None,
            }))
            .expect("credentials");

        assert_eq!(credentials, None);
    }

    #[test]
    fn rejects_multiline_bootstrap_github_token() {
        let error = normalize_bootstrap_github_credentials(Some(&BootstrapLocalStackRequest {
            github: Some(BootstrapGithubRequest {
                enabled: Some(true),
                token: Some("github_pat_example\nextra".to_string()),
                owner: Some("acme-dev".to_string()),
            }),
            tools: None,
            setup: None,
        }))
        .expect_err("multiline token rejected");

        assert!(error.contains("GitHub PAT"));
    }

    #[test]
    fn normalizes_bootstrap_tool_api_keys() {
        let keys = normalize_bootstrap_tool_api_keys(Some(&BootstrapLocalStackRequest {
            github: None,
            tools: Some(BootstrapToolsRequest {
                api_keys: vec![
                    BootstrapToolApiKeyRequest {
                        name: "exa_api_key".to_string(),
                        value: "  exa_example  ".to_string(),
                    },
                    BootstrapToolApiKeyRequest {
                        name: "TAVILY_API_KEY".to_string(),
                        value: String::new(),
                    },
                ],
            }),
            setup: None,
        }))
        .expect("tool keys");

        assert_eq!(
            keys,
            vec![BootstrapAgentKey {
                name: "EXA_API_KEY".to_string(),
                value: "exa_example".to_string(),
            }]
        );
    }

    #[test]
    fn rejects_unknown_bootstrap_tool_api_key() {
        let error = normalize_bootstrap_tool_api_keys(Some(&BootstrapLocalStackRequest {
            github: None,
            tools: Some(BootstrapToolsRequest {
                api_keys: vec![BootstrapToolApiKeyRequest {
                    name: "UNKNOWN_API_KEY".to_string(),
                    value: "secret".to_string(),
                }],
            }),
            setup: None,
        }))
        .expect_err("unknown key rejected");

        assert!(error.contains("unsupported tool API key"));
    }

    #[test]
    fn validates_bootstrap_setup_profile() {
        let setup = BootstrapSetupProfile {
            source: BootstrapSetupSource {
                provider: BootstrapSourceProvider::GitHub,
                base_url: "https://github.com".to_string(),
                owner: "acme-dev".to_string(),
                connection_id: "acme-dev".to_string(),
            },
            harness: BootstrapSetupHarness {
                mode: BootstrapHarnessMode::OpenClaw,
                clis: vec![BootstrapAiCli::ClaudeCode],
                providers: vec![BootstrapProviderSelection {
                    id: "anthropic".to_string(),
                    auth: BootstrapProviderAuth::OAuth,
                    model: "Sonnet 4.6".to_string(),
                    models: vec!["Sonnet 4.6".to_string(), "Haiku 4.5".to_string()],
                }],
            },
        };

        validate_bootstrap_setup(&setup).expect("valid setup");
    }

    #[test]
    fn rejects_setup_without_cli_selection() {
        let setup = BootstrapSetupProfile {
            source: BootstrapSetupSource {
                provider: BootstrapSourceProvider::GitLab,
                base_url: "https://gitlab.com".to_string(),
                owner: "platform/team".to_string(),
                connection_id: "platform-team".to_string(),
            },
            harness: BootstrapSetupHarness {
                mode: BootstrapHarnessMode::Hermes,
                clis: Vec::new(),
                providers: vec![BootstrapProviderSelection {
                    id: "openrouter".to_string(),
                    auth: BootstrapProviderAuth::ApiKey,
                    model: "Auto".to_string(),
                    models: vec!["Auto".to_string()],
                }],
            },
        };

        let error = validate_bootstrap_setup(&setup).expect_err("missing CLI rejected");
        assert!(error.contains("at least one selected CLI"));
    }

    #[test]
    fn renders_bootstrap_github_secret_manifest() {
        let manifest = agent_keys_secret_manifest(&[BootstrapAgentKey {
            name: GITHUB_TOKEN_SECRET_KEY.to_string(),
            value: "github_pat_example".to_string(),
        }])
        .expect("manifest");

        assert!(manifest.contains("name: cto-agent-keys"));
        assert!(manifest.contains("namespace: cto-system"));
        assert!(manifest.contains("GITHUB_TOKEN: \"github_pat_example\""));
    }

    #[test]
    fn renders_bootstrap_agent_keys_secret_manifest() {
        let manifest = agent_keys_secret_manifest(&[
            BootstrapAgentKey {
                name: GITHUB_TOKEN_SECRET_KEY.to_string(),
                value: "github_pat_example".to_string(),
            },
            BootstrapAgentKey {
                name: "FIRECRAWL_API_KEY".to_string(),
                value: "fc_example".to_string(),
            },
        ])
        .expect("manifest");

        assert!(manifest.contains("GITHUB_TOKEN: \"github_pat_example\""));
        assert!(manifest.contains("FIRECRAWL_API_KEY: \"fc_example\""));
    }
}
