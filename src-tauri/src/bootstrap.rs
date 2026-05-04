use cpal::traits::{DeviceTrait, HostTrait};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::ffi::OsString;
use std::fmt::Write as _;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, Window};

static ACTIVE_RUNTIME: OnceLock<RuntimeKind> = OnceLock::new();
static ACTIVE_BOOTSTRAP_LOG_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

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
const CTO_NAMESPACE: &str = "cto";
const CTO_ARGO_APP_NAME: &str = "cto";
const MORGAN_ARGO_APP_NAME: &str = "morgan";
const MORGAN_CTO_CONFIG_PATH: &str = "/workspace/cto-config.json";
const CTO_AGENT_KEYS_SECRET: &str = "cto-agent-keys";
const CTO_GITOPS_REPO_NAME: &str = "cto-gitops";
const GHCR_PULL_SECRET: &str = "ghcr-pull-secret";
const GHCR_REGISTRY: &str = "ghcr.io";
const OPENCLAW_DISCORD_TOKENS_SECRET: &str = "openclaw-discord-tokens";
const GITHUB_TOKEN_SECRET_KEY: &str = "GITHUB_TOKEN";
const GITLAB_TOKEN_SECRET_KEY: &str = "GITLAB_TOKEN";
const MAX_BOOTSTRAP_SCM_SECRET_MANIFEST_BYTES: usize = 64 * 1024;
const BOOTSTRAP_GITHUB_PAT_ENV: &str = "CTO_GITHUB_PAT";
const BOOTSTRAP_GITHUB_OWNER_ENV: &str = "CTO_GITHUB_OWNER";
const BOOTSTRAP_DEV_LOG_DIR: &str = ".local/bootstrap-runs";
const BOOTSTRAP_LOG_MAX_OUTPUT_CHARS: usize = 8 * 1024;
const BOOTSTRAP_TOOL_API_KEY_ENV_NAMES: &[&str] = &[
    "EXA_API_KEY",
    "FIRECRAWL_API_KEY",
    "TAVILY_API_KEY",
    "BRAVE_API_KEY",
    "CONTEXT7_API_KEY",
    "PERPLEXITY_API_KEY",
];
const SECRET_SOURCE_PROVIDER_ONEPASSWORD: &str = "onepassword";
const SECRET_SOURCE_CANONICAL_TARGETS: &[(&str, &str)] = &[
    ("GITHUB_TOKEN", "source.github.token"),
    ("GITLAB_TOKEN", "source.gitlab.token"),
    ("OPENAI_API_KEY", "provider.openai.apiKey"),
    ("OPENROUTER_API_KEY", "provider.openrouter.apiKey"),
    ("EXA_API_KEY", "tool.exa.apiKey"),
    ("FIRECRAWL_API_KEY", "tool.firecrawl.apiKey"),
    ("TAVILY_API_KEY", "tool.tavily.apiKey"),
    ("DISCORD_BOT_TOKEN", "agent.discord.botToken"),
];
const ORIGIN_STANDARD_APP_NAME: &str = "origin-standard";
const ORIGIN_GITLAB_COMPATIBLE_APP_NAME: &str = "origin-gitlab-compatible";

// CTO platform + Qdrant + Morgan Argo Applications, published by
// .github/workflows/publish-chart.yml to ghcr.io.
const CTO_APP_MANIFEST: &str = include_str!("../../.gitops/apps/cto.yaml");
const QDRANT_APP_MANIFEST: &str = include_str!("../../.gitops/apps/qdrant.yaml");
const MORGAN_APP_MANIFEST: &str = include_str!("../../.gitops/apps/morgan.yaml");
const VOICE_BRIDGE_APP_MANIFEST: &str = include_str!("../../.gitops/apps/voice-bridge.yaml");
const ORIGIN_STANDARD_APP_MANIFEST: &str = include_str!("../../.gitops/apps/origin-standard.yaml");
const ORIGIN_GITLAB_COMPATIBLE_APP_MANIFEST: &str =
    include_str!("../../.gitops/apps/origin-gitlab-compatible.yaml");
const GITOPS_TEMPLATE_FILES: &[(&str, &str)] = &[
    (
        ".cto/template.json",
        include_str!("../../.gitops/template/.cto/template.json"),
    ),
    (
        ".github/workflows/cto-update.yml",
        include_str!("../../.gitops/template/.github/workflows/cto-update.yml"),
    ),
    (
        ".gitops/apps/README.md",
        include_str!("../../.gitops/template/.gitops/apps/README.md"),
    ),
    (
        ".gitops/apps/cto.yaml",
        include_str!("../../.gitops/template/.gitops/apps/cto.yaml"),
    ),
    (
        ".gitops/apps/morgan.yaml",
        include_str!("../../.gitops/template/.gitops/apps/morgan.yaml"),
    ),
    (
        ".gitops/apps/observability.yaml",
        include_str!("../../.gitops/template/.gitops/apps/observability.yaml"),
    ),
    (
        ".gitops/apps/qdrant.yaml",
        include_str!("../../.gitops/template/.gitops/apps/qdrant.yaml"),
    ),
    (
        ".gitops/apps/voice-bridge.yaml",
        include_str!("../../.gitops/template/.gitops/apps/voice-bridge.yaml"),
    ),
    (
        ".gitops/apps/origin-standard.yaml",
        include_str!("../../.gitops/template/.gitops/apps/origin-standard.yaml"),
    ),
    (
        ".gitops/apps/origin-gitlab-compatible.yaml",
        include_str!("../../.gitops/template/.gitops/apps/origin-gitlab-compatible.yaml"),
    ),
    (
        ".gitops/overrides/.gitkeep",
        include_str!("../../.gitops/template/.gitops/overrides/.gitkeep"),
    ),
    (
        ".gitops/values/.gitkeep",
        include_str!("../../.gitops/template/.gitops/values/.gitkeep"),
    ),
];
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
const CLIENT_CLUSTER_BASELINE_APPS: [BootstrapAppManifest; 2] =
    [CTO_BOOTSTRAP_APP, QDRANT_BOOTSTRAP_APP];
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputStatus {
    has_output_device: bool,
    output_device_name: Option<String>,
    output_volume_percent: Option<u8>,
    output_muted: Option<bool>,
    warning: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCliOAuthResult {
    token: String,
    username: Option<String>,
    accounts: Vec<GitHubCliAccount>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCliAccount {
    login: String,
    kind: GitHubCliAccountKind,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubCliAccountKind {
    User,
    Organization,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCliOAuthPrompt {
    message: String,
    verification_uri: Option<String>,
    user_code: Option<String>,
    copied_to_clipboard: bool,
    clipboard_error: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretSourceProviderStatus {
    provider: String,
    label: String,
    detected: bool,
    available: bool,
    version: Option<String>,
    reason: Option<String>,
    primary_action: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretSourceDetectionResult {
    providers: Vec<SecretSourceProviderStatus>,
    manual_fallback_available: bool,
    message: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretSourcePreviewRequest {
    provider: String,
    #[serde(default)]
    targets: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretSourceMatchPreview {
    provider: String,
    purpose: String,
    target_secret_name: String,
    target_secret_key: String,
    provider_ref: String,
    label: String,
    confidence: String,
    redacted_value_preview: String,
    approval_required: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretSourcePreviewResult {
    provider: String,
    discovery: String,
    matches: Vec<SecretSourceMatchPreview>,
    warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretSourceApplyRequest {
    provider: String,
    approved: bool,
    matches: Vec<SecretSourceApplySelection>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretSourceApplySelection {
    purpose: String,
    target_secret_key: String,
    provider_ref: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretSourceAppliedReference {
    purpose: String,
    target_secret_name: String,
    target_secret_key: String,
    provider_ref: String,
    status: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretSourceApplyResult {
    provider: String,
    applied: Vec<SecretSourceAppliedReference>,
    raw_values_persisted: bool,
    message: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum OriginEngine {
    Standard,
    GitlabCompatible,
}

impl OriginEngine {
    const fn app_name(self) -> &'static str {
        match self {
            Self::Standard => ORIGIN_STANDARD_APP_NAME,
            Self::GitlabCompatible => ORIGIN_GITLAB_COMPATIBLE_APP_NAME,
        }
    }

    const fn label(self) -> &'static str {
        match self {
            Self::Standard => "5D Origin Gitea",
            Self::GitlabCompatible => "5D Origin GitLab",
        }
    }

    const fn manifest(self) -> &'static str {
        match self {
            Self::Standard => ORIGIN_STANDARD_APP_MANIFEST,
            Self::GitlabCompatible => ORIGIN_GITLAB_COMPATIBLE_APP_MANIFEST,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum OriginTransferMode {
    Mirror,
    Migrate,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginTransferRequest {
    pub engine: OriginEngine,
    pub source_provider: String,
    pub source_connection_id: String,
    #[serde(default)]
    pub repositories: Vec<String>,
    pub mode: Option<OriginTransferMode>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginTransferPlan {
    pub engine: OriginEngine,
    pub mode: OriginTransferMode,
    pub app_name: String,
    pub app_label: String,
    pub source_provider: String,
    pub source_connection_id: String,
    pub repositories: Vec<String>,
    pub action_plan: Vec<String>,
    pub manifest_preview: String,
    pub redaction: String,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginProvisionRequest {
    pub engine: OriginEngine,
    pub approved: bool,
    pub dry_run: Option<bool>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginProvisionResult {
    pub engine: OriginEngine,
    pub app_name: String,
    pub applied: bool,
    pub dry_run: bool,
    pub manifest_preview: String,
    pub message: String,
}

#[derive(Clone, Debug)]
struct GitOpsFile {
    path: String,
    content: String,
}

#[derive(Deserialize)]
struct GitHubUserResponse {
    login: String,
}

#[derive(Deserialize)]
struct GitHubRepoResponse {
    html_url: String,
}

#[derive(Deserialize)]
struct GitHubRefObject {
    sha: String,
}

#[derive(Deserialize)]
struct GitHubRefResponse {
    object: GitHubRefObject,
}

#[derive(Deserialize)]
struct GitHubCommitTree {
    sha: String,
}

#[derive(Deserialize)]
struct GitHubCommitResponse {
    sha: String,
    tree: GitHubCommitTree,
}

#[derive(Deserialize)]
struct GitHubBlobResponse {
    sha: String,
}

#[derive(Deserialize)]
struct GitHubTreeResponse {
    sha: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapLocalStackRequest {
    github: Option<BootstrapGithubRequest>,
    scm: Option<BootstrapScmRequest>,
    tools: Option<BootstrapToolsRequest>,
    providers: Option<BootstrapProvidersRequest>,
    agents: Option<BootstrapAgentsRequest>,
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
pub struct BootstrapScmRequest {
    github_app_secret_manifest: Option<String>,
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

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapProvidersRequest {
    #[serde(default)]
    credentials: Vec<BootstrapProviderCredentialRequest>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapProviderCredentialRequest {
    provider_id: String,
    auth: BootstrapProviderAuth,
    secret_key: Option<String>,
    value: Option<String>,
    api_key_secret_key: Option<String>,
    api_key: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapAgentsRequest {
    #[serde(default)]
    discord_tokens: Vec<BootstrapDiscordTokenRequest>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapDiscordTokenRequest {
    id: String,
    #[serde(default)]
    enabled: bool,
    token: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapSetupProfile {
    source: BootstrapSetupSource,
    harness: BootstrapSetupHarness,
    #[serde(default)]
    agents: Vec<BootstrapSetupAgent>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapSetupAgent {
    id: String,
    enabled: bool,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    routing: Option<BootstrapHarnessRouting>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum BootstrapHarnessMode {
    #[serde(rename = "openclaw")]
    OpenClaw,
    #[serde(rename = "hermes")]
    Hermes,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub enum BootstrapAiCli {
    #[serde(rename = "openclaw")]
    OpenClaw,
    #[serde(rename = "codex")]
    Codex,
    #[serde(rename = "claudeCode", alias = "claude")]
    ClaudeCode,
    #[serde(rename = "geminiCli", alias = "gemini")]
    GeminiCli,
    #[serde(rename = "opencode", alias = "code")]
    OpenCode,
    #[serde(rename = "qwenCode")]
    QwenCode,
    #[serde(rename = "githubCli", alias = "copilot")]
    GitHubCli,
    #[serde(rename = "gitlabCli")]
    GitLabCli,
    #[serde(rename = "cursor")]
    Cursor,
    #[serde(rename = "factory")]
    Factory,
    #[serde(rename = "kimi")]
    Kimi,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapProviderSelection {
    id: String,
    auth: BootstrapProviderAuth,
    #[serde(default)]
    cli_ids: Vec<BootstrapAiCli>,
    model: String,
    #[serde(default)]
    models: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapHarnessRouting {
    primary: BootstrapModelRoute,
    #[serde(default)]
    fallbacks: Vec<BootstrapModelRoute>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapModelRoute {
    provider_id: String,
    model: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum BootstrapProviderAuth {
    #[serde(rename = "oauth")]
    OAuth,
    #[serde(rename = "api-key")]
    ApiKey,
    #[serde(rename = "cloud")]
    Cloud,
    #[serde(rename = "gateway")]
    Gateway,
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
struct BootstrapSourceCredentials {
    github: Option<BootstrapGithubCredentials>,
    gitlab_token: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct BootstrapAgentKey {
    name: String,
    value: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct BootstrapProviderCredentialBundle {
    agent_keys: Vec<BootstrapAgentKey>,
    config: BTreeMap<String, BootstrapProviderCredentialConfig>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapCtoConfig {
    version: u8,
    source: BootstrapSetupSource,
    harness: BootstrapCtoHarnessConfig,
    clis: BTreeMap<String, BootstrapCtoCliConfig>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapCtoHarnessConfig {
    default: BootstrapHarnessMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    routing: Option<BootstrapHarnessRouting>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapCtoCliConfig {
    id: BootstrapAiCli,
    default_harness: BootstrapHarnessMode,
    providers: BTreeMap<String, BootstrapCtoProviderConfig>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapCtoProviderConfig {
    id: String,
    auth: BootstrapProviderAuth,
    default_model: String,
    models: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    credential: Option<BootstrapProviderCredentialConfig>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapProviderCredentialConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    secret_ref: Option<BootstrapSecretReference>,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key_secret_ref: Option<BootstrapSecretReference>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapSecretReference {
    name: String,
    key: String,
    env: String,
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
    ensure_runtime_tool_paths_on_process();
    BootstrapLocalStackDefaults {
        github: BootstrapGithubDefaults {
            token: env_var_trimmed(BOOTSTRAP_GITHUB_PAT_ENV)
                .or_else(|| env_var_trimmed("GITHUB_TOKEN"))
                .unwrap_or_default(),
            token_source: env_var_source(BOOTSTRAP_GITHUB_PAT_ENV)
                .or_else(|| env_var_source("GITHUB_TOKEN")),
            owner: env_var_trimmed(BOOTSTRAP_GITHUB_OWNER_ENV)
                .or_else(|| env_var_trimmed("GITHUB_ORG"))
                .unwrap_or_default(),
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
    let log_guard = BootstrapRunLogGuard::start(&window);
    let result = bootstrap_local_stack_impl(window.clone(), request).await;
    match &result {
        Ok(_) => append_bootstrap_log("bootstrap completed successfully"),
        Err(error) => append_bootstrap_log(&format!("bootstrap failed: {error}")),
    }
    let _ = log_guard.is_active();
    drop(log_guard);

    result
}

#[tauri::command]
pub async fn prepare_local_stack_dependencies(window: Window) -> BootstrapResult<BootstrapReport> {
    let log_guard = BootstrapRunLogGuard::start(&window);
    let result = prepare_local_stack_dependencies_impl(window.clone()).await;
    match &result {
        Ok(_) => append_bootstrap_log("local stack dependencies prepared successfully"),
        Err(error) => append_bootstrap_log(&format!(
            "local stack dependency preparation failed: {error}"
        )),
    }
    let _ = log_guard.is_active();
    drop(log_guard);

    result
}

async fn bootstrap_local_stack_impl(
    window: Window,
    request: Option<BootstrapLocalStackRequest>,
) -> BootstrapResult<BootstrapReport> {
    tracing::info!("bootstrap_local_stack invoked");
    let app_mode = BootstrapAppMode::from_env()?;
    let source_credentials = normalize_bootstrap_source_credentials(request.as_ref())?;
    let github_credentials = source_credentials.github.as_ref();
    let scm_secret_manifest = normalize_bootstrap_scm_secret_manifest(request.as_ref())?;
    let tool_api_keys = normalize_bootstrap_tool_api_keys(request.as_ref())?;
    let provider_credentials = normalize_bootstrap_provider_credentials(request.as_ref())?;
    let discord_tokens = normalize_bootstrap_discord_tokens(request.as_ref())?;
    let agent_keys = bootstrap_agent_keys(
        &source_credentials,
        &tool_api_keys,
        &provider_credentials.agent_keys,
    )?;
    let cto_config = build_bootstrap_cto_config(
        request.as_ref().and_then(|request| request.setup.as_ref()),
        &provider_credentials.config,
    )?;
    persist_bootstrap_setup(
        &window,
        request.as_ref().and_then(|request| request.setup.as_ref()),
    )?;

    emit(&window, "gitops", "Preparing GitOps repository...", 10);
    ensure_bootstrap_gitops_repository(
        github_credentials,
        request.as_ref().and_then(|request| request.github.as_ref()),
        request.as_ref().and_then(|request| request.setup.as_ref()),
    )
    .await?;

    if app_mode.skips_layered_apps() {
        tracing::warn!(
            "{BOOTSTRAP_TEST_MODE_ENV}={} enabled; qdrant and morgan Argo Applications will not be applied",
            app_mode.label()
        );
    }

    let runtime = ensure_local_stack_cluster_dependencies(&window).await?;

    emit(&window, "credentials", "Configuring local API keys...", 82);
    ensure_namespace(CTO_NAMESPACE)?;
    apply_bootstrap_scm_secret(scm_secret_manifest.as_deref())?;
    apply_bootstrap_agent_keys(&agent_keys)?;
    apply_bootstrap_argocd_oci_repository(github_credentials)?;
    apply_bootstrap_ghcr_pull_secret(github_credentials)?;
    apply_bootstrap_discord_tokens(&discord_tokens)?;

    let app_message = if app_mode.skips_layered_apps() {
        "Registering CTO app (test mode)..."
    } else {
        "Registering platform apps..."
    };
    emit(&window, "tools", app_message, 86);
    apply_bootstrap_apps(app_mode)?;
    patch_bootstrap_cto_agent_keys(&agent_keys)?;
    patch_bootstrap_cto_config(cto_config.as_ref())?;
    patch_bootstrap_morgan_cto_config(app_mode, cto_config.as_ref())?;
    patch_bootstrap_github_owner(app_mode, github_credentials)?;

    emit(&window, "gitops", "Waiting for platform apps...", 92);
    wait_for_bootstrap_apps(app_mode, Duration::from_secs(600))?;

    emit(&window, "ready", "Launching Codex App...", 100);

    Ok(BootstrapReport {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        runtime,
        cluster: CLUSTER_NAME.to_string(),
        tools: current_tool_statuses(),
    })
}

async fn prepare_local_stack_dependencies_impl(window: Window) -> BootstrapResult<BootstrapReport> {
    tracing::info!("prepare_local_stack_dependencies invoked");
    let runtime = ensure_local_stack_cluster_dependencies(&window).await?;
    emit(
        &window,
        "baseline",
        "Client Cluster baseline ready for setup choices.",
        100,
    );

    Ok(BootstrapReport {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        runtime,
        cluster: CLUSTER_NAME.to_string(),
        tools: current_tool_statuses(),
    })
}

async fn ensure_local_stack_cluster_dependencies(window: &Window) -> BootstrapResult<String> {
    emit(window, "runtime", "Detecting container runtime...", 5);
    ensure_runtime_tool_paths_on_process();

    let runtime_kind = ensure_container_runtime(window)?;
    let _ = ACTIVE_RUNTIME.set(runtime_kind);
    let runtime = runtime_kind.label().to_string();

    emit(window, "dependencies", "Installing dependencies...", 16);
    ensure_host_tools(window).await?;

    emit(window, "cluster", "Starting local Kubernetes...", 32);
    ensure_kind_cluster(runtime_kind)?;

    emit(window, "ingress", "Configuring ingress...", 52);
    apply_remote_manifest_server_side(INGRESS_NGINX_KIND_URL).await?;
    wait_for_rollout(
        "ingress-nginx",
        "deployment/ingress-nginx-controller",
        "240s",
    )?;

    emit(window, "metrics", "Installing Lens metrics support...", 60);
    install_metrics_server_for_kind().await?;

    emit(window, "gitops", "Starting Argo CD...", 68);
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
    ensure_namespace(CTO_NAMESPACE)?;

    emit(window, "charts", "Installing CTO Helm charts...", 76);
    apply_client_cluster_baseline_apps()?;
    emit(window, "charts", "Waiting for CTO Helm charts...", 82);
    wait_for_client_cluster_baseline_apps(Duration::from_secs(600))?;

    Ok(runtime)
}

#[tauri::command]
pub fn detect_secret_sources() -> SecretSourceDetectionResult {
    detect_secret_sources_inner()
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn preview_secret_source_matches(
    request: SecretSourcePreviewRequest,
) -> BootstrapResult<SecretSourcePreviewResult> {
    preview_secret_source_matches_inner(&request)
}

#[tauri::command]
pub fn apply_secret_source_matches(
    request: SecretSourceApplyRequest,
) -> BootstrapResult<SecretSourceApplyResult> {
    apply_secret_source_matches_inner(request)
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn prepare_origin_transfer(
    request: OriginTransferRequest,
) -> BootstrapResult<OriginTransferPlan> {
    prepare_origin_transfer_inner(&request)
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn provision_origin_application(
    request: OriginProvisionRequest,
) -> BootstrapResult<OriginProvisionResult> {
    provision_origin_application_inner(&request)
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetLocalStackBootstrapReport {
    removed_setup_profile: bool,
    deleted_kind_cluster: bool,
}

#[tauri::command]
pub async fn reset_local_stack_bootstrap(
    window: Window,
) -> BootstrapResult<ResetLocalStackBootstrapReport> {
    tokio::task::spawn_blocking(move || reset_local_stack_bootstrap_blocking(&window))
        .await
        .map_err(|error| format!("local stack reset task failed: {error}"))?
}

fn reset_local_stack_bootstrap_blocking(
    window: &Window,
) -> BootstrapResult<ResetLocalStackBootstrapReport> {
    ensure_runtime_tool_paths_on_process();
    let removed_setup_profile = remove_bootstrap_setup_profile(window)?;
    let deleted_kind_cluster = delete_bootstrap_kind_cluster()?;

    Ok(ResetLocalStackBootstrapReport {
        removed_setup_profile,
        deleted_kind_cluster,
    })
}

#[tauri::command]
pub fn audio_output_status() -> AudioOutputStatus {
    let host = cpal::default_host();
    let output_device = host.default_output_device();
    let output_device_name = output_device
        .as_ref()
        .and_then(|device| device.name().ok())
        .filter(|name| !name.trim().is_empty());
    let has_output_device = output_device.is_some();
    let volume = system_output_volume();
    let output_muted = system_output_muted();
    let warning = if !has_output_device {
        Some("No active audio output device was detected. Connect or enable speakers or headphones so you can hear Morgan.".to_string())
    } else if output_muted == Some(true) {
        Some(
            "System audio appears to be muted. Unmute your output so you can hear Morgan."
                .to_string(),
        )
    } else if volume == Some(0) {
        Some(
            "System output volume appears to be set to zero. Turn it up so you can hear Morgan."
                .to_string(),
        )
    } else {
        None
    };

    AudioOutputStatus {
        has_output_device,
        output_device_name,
        output_volume_percent: volume,
        output_muted,
        warning,
    }
}

#[tauri::command]
pub async fn github_cli_oauth(window: Window) -> BootstrapResult<GitHubCliOAuthResult> {
    tokio::task::spawn_blocking(move || github_cli_oauth_blocking(&window))
        .await
        .map_err(|error| format!("GitHub OAuth task failed: {error}"))?
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
    let label = sanitize_bootstrap_command_label(label);
    let stderr = sanitize_bootstrap_log_text(String::from_utf8_lossy(&output.stderr).trim());
    if stderr.is_empty() {
        format!("{label} failed with status {}", output.status)
    } else {
        format!("{label} failed: {stderr}")
    }
}

#[cfg(target_os = "macos")]
fn system_output_volume() -> Option<u8> {
    let output = Command::new("osascript")
        .args(["-e", "output volume of (get volume settings)"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u8>()
        .ok()
}

#[cfg(not(target_os = "macos"))]
fn system_output_volume() -> Option<u8> {
    None
}

#[cfg(target_os = "macos")]
fn system_output_muted() -> Option<bool> {
    let output = Command::new("osascript")
        .args(["-e", "output muted of (get volume settings)"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    match String::from_utf8_lossy(&output.stdout)
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

#[cfg(not(target_os = "macos"))]
fn system_output_muted() -> Option<bool> {
    None
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
    append_bootstrap_log(&format!("progress {progress:>3}% [{stage}] {message}"));
    let _ = window.emit(
        "local-stack-progress",
        BootstrapProgress {
            stage: stage.to_string(),
            message: message.to_string(),
            progress,
        },
    );
}

struct BootstrapRunLogGuard {
    path: Option<PathBuf>,
}

impl BootstrapRunLogGuard {
    fn start(window: &Window) -> Self {
        match create_bootstrap_run_log(window) {
            Ok(path) => {
                set_active_bootstrap_log_path(Some(path.clone()));
                append_bootstrap_log("bootstrap run log started");
                tracing::info!("Bootstrap run log: {}", path.display());
                Self { path: Some(path) }
            }
            Err(error) => {
                tracing::warn!("Failed to create bootstrap run log: {error}");
                Self { path: None }
            }
        }
    }

    fn is_active(&self) -> bool {
        self.path.is_some()
    }
}

impl Drop for BootstrapRunLogGuard {
    fn drop(&mut self) {
        append_bootstrap_log("bootstrap run log closed");
        set_active_bootstrap_log_path(None);
    }
}

fn create_bootstrap_run_log(window: &Window) -> BootstrapResult<PathBuf> {
    let dir = bootstrap_run_log_dir(window)?;
    fs::create_dir_all(&dir).map_err(|error| {
        format!(
            "failed to create bootstrap run log directory {}: {error}",
            dir.display()
        )
    })?;
    let path = dir.join(format!("bootstrap-{}.log", bootstrap_log_timestamp()));
    fs::write(
        &path,
        format!(
            "CTO local stack bootstrap log\nstarted={}\nrepo={}\n\n",
            bootstrap_log_timestamp(),
            find_repo_root_for_bootstrap_logs().map_or_else(
                || "unavailable".to_string(),
                |path| path.display().to_string()
            )
        ),
    )
    .map_err(|error| {
        format!(
            "failed to create bootstrap run log {}: {error}",
            path.display()
        )
    })?;
    Ok(path)
}

fn bootstrap_run_log_dir(window: &Window) -> BootstrapResult<PathBuf> {
    if let Some(repo_root) = find_repo_root_for_bootstrap_logs() {
        return Ok(repo_root.join(BOOTSTRAP_DEV_LOG_DIR));
    }

    Ok(window
        .app_handle()
        .path()
        .app_log_dir()
        .map_err(|error| format!("failed to resolve app log dir: {error}"))?
        .join("bootstrap-runs"))
}

fn find_repo_root_for_bootstrap_logs() -> Option<PathBuf> {
    let mut current = std::env::current_dir().ok()?;
    loop {
        if current.join("package.json").is_file() && current.join("src-tauri").is_dir() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn active_bootstrap_log_path() -> &'static Mutex<Option<PathBuf>> {
    ACTIVE_BOOTSTRAP_LOG_PATH.get_or_init(|| Mutex::new(None))
}

fn set_active_bootstrap_log_path(path: Option<PathBuf>) {
    match active_bootstrap_log_path().lock() {
        Ok(mut active_path) => *active_path = path,
        Err(error) => tracing::warn!("Failed to lock bootstrap log path: {error}"),
    }
}

fn append_bootstrap_log(message: &str) {
    let path = match active_bootstrap_log_path().lock() {
        Ok(active_path) => active_path.clone(),
        Err(error) => {
            tracing::warn!("Failed to lock bootstrap log path: {error}");
            None
        }
    };
    let Some(path) = path else {
        return;
    };

    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(mut file) => {
            if let Err(error) = writeln!(file, "[{}] {message}", bootstrap_log_timestamp()) {
                tracing::warn!("Failed to write bootstrap log {}: {error}", path.display());
            }
        }
        Err(error) => tracing::warn!("Failed to open bootstrap log {}: {error}", path.display()),
    }
}

fn bootstrap_log_timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}", duration.as_secs(), duration.subsec_millis())
}

fn log_command_output(label: &str, output: &Output) {
    let label = sanitize_bootstrap_command_label(label);
    let status = output
        .status
        .code()
        .map_or_else(|| "signal".to_string(), |code| code.to_string());
    append_bootstrap_log(&format!("command `{label}` exited with status {status}"));

    if output.status.success() || !should_log_command_streams(&label) {
        return;
    }

    append_command_stream(&label, "stdout", &output.stdout);
    append_command_stream(&label, "stderr", &output.stderr);
}

fn should_log_command_streams(label: &str) -> bool {
    !(label == "pbpaste" || label.starts_with("gh "))
}

fn append_command_stream(label: &str, stream: &str, bytes: &[u8]) {
    if bytes.is_empty() {
        return;
    }
    let text = sanitize_bootstrap_log_text(&String::from_utf8_lossy(bytes));
    let text = truncate_log_text(&text, BOOTSTRAP_LOG_MAX_OUTPUT_CHARS);
    append_bootstrap_log(&format!("command `{label}` {stream}:\n{text}"));
}

fn sanitize_bootstrap_command_label(label: &str) -> String {
    let lower = label.to_ascii_lowercase();
    if lower.contains("github_token")
        || lower.contains("agentkeys")
        || lower.contains("stringdata")
        || lower.contains("--patch")
        || lower.contains(" -p ")
        || lower.contains("github_pat_")
        || lower.contains("gho_")
        || lower.contains("ghp_")
        || lower.contains("ghs_")
        || lower.contains("ghu_")
        || lower.contains("ghr_")
    {
        return redact_kubectl_patch_label(label);
    }

    label.to_string()
}

fn redact_kubectl_patch_label(label: &str) -> String {
    if label.starts_with("kubectl ") && label.contains(" patch ") {
        let parts = label.split_whitespace().collect::<Vec<_>>();
        let namespace = parts
            .windows(2)
            .find_map(|window| (window[0] == "-n").then_some(window[1]));
        let resource = parts
            .windows(2)
            .find_map(|window| (window[0] == "patch").then_some(window[1]));
        let name =
            resource.and_then(|_| parts.get(parts.iter().position(|part| *part == "patch")? + 2));
        return match (namespace, resource, name) {
            (Some(namespace), Some(resource), Some(name)) => {
                format!("kubectl -n {namespace} patch {resource} {name} [payload redacted]")
            }
            _ => "kubectl patch [payload redacted]".to_string(),
        };
    }

    "[command redacted]".to_string()
}

fn sanitize_bootstrap_log_text(raw: &str) -> String {
    raw.lines()
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            if lower.contains("authorization:")
                || lower.contains("access_token")
                || lower.contains("refresh_token")
                || lower.contains("github_token")
                || lower.contains("api_key")
                || lower.contains("apikey")
                || lower.contains("secret")
                || lower.contains("token:")
                || lower.contains("github_pat_")
                || lower.contains("ghp_")
                || lower.contains("gho_")
                || lower.contains("ghs_")
                || lower.contains("ghu_")
                || lower.contains("ghr_")
            {
                "[redacted sensitive line]"
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn truncate_log_text(text: &str, max_chars: usize) -> String {
    let mut chars = text.chars();
    let truncated = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}\n[truncated]")
    } else {
        truncated
    }
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

fn prepare_origin_transfer_inner(
    request: &OriginTransferRequest,
) -> BootstrapResult<OriginTransferPlan> {
    let source_provider = request.source_provider.trim().to_ascii_lowercase();
    if !matches!(source_provider.as_str(), "github" | "gitlab") {
        return Err(
            "5D Origin transfer requires an existing GitHub or GitLab Source connection"
                .to_string(),
        );
    }
    let source_connection_id = request.source_connection_id.trim();
    validate_origin_slug(source_connection_id, "sourceConnectionId")?;
    let mode = request.mode.unwrap_or(OriginTransferMode::Mirror);
    let repositories = request
        .repositories
        .iter()
        .map(|repo| repo.trim())
        .filter(|repo| !repo.is_empty())
        .map(sanitize_origin_repository)
        .collect::<BootstrapResult<Vec<_>>>()?;
    let app_name = request.engine.app_name().to_string();
    let manifest_preview = redacted_origin_manifest_preview(request.engine.manifest());
    let mut warnings = vec![
        "Mirror-first plan: hosted GitHub/GitLab remains the source of truth until the user explicitly migrates.".to_string(),
        "No provider tokens or repository credentials are included in this dry-run preview.".to_string(),
    ];
    if request.engine == OriginEngine::GitlabCompatible {
        warnings.push("GitLab is heavier than Gitea and should be provisioned only after the Client Cluster baseline is healthy.".to_string());
    }

    Ok(OriginTransferPlan {
        engine: request.engine,
        mode,
        app_name,
        app_label: request.engine.label().to_string(),
        source_provider,
        source_connection_id: source_connection_id.to_string(),
        repositories,
        action_plan: vec![
            "Confirm the existing hosted Source connection is ready.".to_string(),
            format!("Create or update the {} Argo Application.", request.engine.app_name()),
            "Configure repository mirrors; do not cut over writes unless migrate is explicitly selected.".to_string(),
            "Keep provider credentials in CTO-managed Secrets and display only redacted previews.".to_string(),
        ],
        manifest_preview,
        redaction: "[REDACTED]".to_string(),
        warnings,
    })
}

fn provision_origin_application_inner(
    request: &OriginProvisionRequest,
) -> BootstrapResult<OriginProvisionResult> {
    if !request.approved {
        return Err("approval required before creating a 5D Origin Argo Application".to_string());
    }
    let dry_run = request.dry_run.unwrap_or(true);
    let manifest = request.engine.manifest();
    if !manifest.contains(&format!("name: {}", request.engine.app_name())) {
        return Err(format!(
            "{} manifest does not declare the expected Argo Application name",
            request.engine.app_name()
        ));
    }
    if !dry_run {
        let mut command = tool_command("kubectl");
        command.args(["--context", KIND_CONTEXT, "apply", "-f", "-"]);
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|error| format!("failed to start kubectl for Origin app creation: {error}"))?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(manifest.as_bytes())
                .map_err(|error| format!("failed to send Origin manifest to kubectl: {error}"))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|error| format!("failed to wait for Origin app creation: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "Origin app creation failed: {}",
                sanitize_bootstrap_log_text(&String::from_utf8_lossy(&output.stderr)).trim()
            ));
        }
    }

    Ok(OriginProvisionResult {
        engine: request.engine,
        app_name: request.engine.app_name().to_string(),
        applied: !dry_run,
        dry_run,
        manifest_preview: redacted_origin_manifest_preview(manifest),
        message: if dry_run {
            "Origin application dry-run is ready for approval".to_string()
        } else {
            "Origin application created".to_string()
        },
    })
}

fn validate_origin_slug(value: &str, label: &str) -> BootstrapResult<()> {
    if value.is_empty() || value.len() > 96 {
        return Err(format!("{label} must be 1-96 characters"));
    }
    if value.starts_with('-') || value.ends_with('-') || value.contains("..") {
        return Err(format!(
            "{label} has an invalid repository/source identifier shape"
        ));
    }
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'/'))
    {
        return Err(format!("{label} contains unsupported characters"));
    }
    Ok(())
}

fn sanitize_origin_repository(value: &str) -> BootstrapResult<String> {
    validate_origin_slug(value, "repository")?;
    Ok(value.to_string())
}

fn redacted_origin_manifest_preview(manifest: &str) -> String {
    manifest
        .replace("password:", "password: [REDACTED]")
        .replace("token:", "token: [REDACTED]")
}

fn validate_secret_source_provider(provider: &str) -> BootstrapResult<()> {
    if provider
        .trim()
        .eq_ignore_ascii_case(SECRET_SOURCE_PROVIDER_ONEPASSWORD)
    {
        Ok(())
    } else {
        Err("unsupported secret source provider; only onepassword quick connect is available locally".to_string())
    }
}

fn canonical_secret_target(key: &str) -> Option<(&'static str, &'static str)> {
    SECRET_SOURCE_CANONICAL_TARGETS
        .iter()
        .copied()
        .find(|(target_key, _)| target_key.eq_ignore_ascii_case(key.trim()))
}

fn secret_source_targets(requested: &[String]) -> Vec<(&'static str, &'static str)> {
    if requested.is_empty() {
        return SECRET_SOURCE_CANONICAL_TARGETS.to_vec();
    }

    let requested = requested
        .iter()
        .map(|target| target.trim().to_ascii_uppercase())
        .collect::<HashSet<_>>();
    SECRET_SOURCE_CANONICAL_TARGETS
        .iter()
        .copied()
        .filter(|(key, purpose)| {
            requested.contains(*key) || requested.contains(&purpose.to_ascii_uppercase())
        })
        .collect()
}

fn detect_secret_sources_inner() -> SecretSourceDetectionResult {
    // Contract probe: op --version
    let output = run_tool("op", &["--version"]);
    let (detected, available, version, reason) = match output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, true, (!version.is_empty()).then_some(version), None)
        }
        Ok(output) => (
            true,
            false,
            None,
            Some(
                sanitize_bootstrap_log_text(&String::from_utf8_lossy(&output.stderr))
                    .trim()
                    .to_string(),
            ),
        ),
        Err(error) => (false, false, None, Some(error)),
    };

    SecretSourceDetectionResult {
        providers: vec![SecretSourceProviderStatus {
            provider: SECRET_SOURCE_PROVIDER_ONEPASSWORD.to_string(),
            label: "1Password".to_string(),
            detected,
            available,
            version,
            reason,
            primary_action: if available {
                "Use saved access"
            } else {
                "Paste instead"
            }
            .to_string(),
        }],
        manual_fallback_available: true,
        message: if available {
            "1Password quick connect is available; review matches before connecting.".to_string()
        } else {
            "No optional saved-access provider is ready; paste instead remains available."
                .to_string()
        },
    }
}

fn preview_secret_source_matches_inner(
    request: &SecretSourcePreviewRequest,
) -> BootstrapResult<SecretSourcePreviewResult> {
    validate_secret_source_provider(&request.provider)?;
    let targets = secret_source_targets(&request.targets);
    let mut command = tool_command("op");
    command.args(["item", "list", "--format", "json"]);
    // Metadata-only discovery: `op item list` enumerates items without reading fields.
    let output = run_command(command, "op item list --format json")?;
    if !output.status.success() {
        return Err(format!(
            "1Password metadata discovery failed; paste instead is still available: {}",
            sanitize_bootstrap_log_text(&String::from_utf8_lossy(&output.stderr)).trim()
        ));
    }
    let raw_items = serde_json::from_slice::<Value>(&output.stdout)
        .map_err(|error| format!("Failed to parse 1Password item metadata: {error}"))?;
    let items = raw_items.as_array().cloned().unwrap_or_default();
    let mut matches = Vec::new();
    for (target_key, purpose) in targets {
        let target_lower = target_key.to_ascii_lowercase();
        if let Some(item) = items.iter().find(|item| {
            let title = item
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_ascii_lowercase();
            title.contains(&target_lower) || title.contains(&target_lower.replace('_', " "))
        }) {
            let id = item
                .get("id")
                .or_else(|| item.get("uuid"))
                .and_then(Value::as_str)
                .unwrap_or(target_key);
            let title = item
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or(target_key);
            matches.push(SecretSourceMatchPreview {
                provider: SECRET_SOURCE_PROVIDER_ONEPASSWORD.to_string(),
                purpose: purpose.to_string(),
                target_secret_name: CTO_AGENT_KEYS_SECRET.to_string(),
                target_secret_key: target_key.to_string(),
                provider_ref: format!("op://{id}"),
                label: title.to_string(),
                confidence: "name-match".to_string(),
                redacted_value_preview: "[REDACTED]".to_string(),
                approval_required: true,
            });
        }
    }

    Ok(SecretSourcePreviewResult {
        provider: SECRET_SOURCE_PROVIDER_ONEPASSWORD.to_string(),
        discovery: "metadata-only".to_string(),
        matches,
        warnings: vec![
            "Review before connecting; raw values are not read until approval is submitted."
                .to_string(),
            "Paste instead remains available for any missing key.".to_string(),
        ],
    })
}

fn apply_secret_source_matches_inner(
    request: SecretSourceApplyRequest,
) -> BootstrapResult<SecretSourceApplyResult> {
    validate_secret_source_provider(&request.provider)?;
    if !request.approved {
        return Err("approval required before reading selected 1Password fields".to_string());
    }
    if request.matches.is_empty() {
        return Err("at least one approved saved-access match is required".to_string());
    }

    let mut agent_keys = Vec::new();
    let mut applied = Vec::new();
    for selection in request.matches {
        let (target_key, purpose) = canonical_secret_target(&selection.target_secret_key)
            .ok_or_else(|| {
                format!(
                    "unsupported saved-access target key: {}",
                    selection.target_secret_key
                )
            })?;
        let provider_ref = selection.provider_ref.trim();
        if !provider_ref.starts_with("op://") {
            return Err("1Password providerRef must use op:// provenance".to_string());
        }
        let item_id = provider_ref.trim_start_matches("op://");
        let mut command = tool_command("op");
        command.args([
            "item",
            "get",
            item_id,
            "--fields",
            "label=password",
            "--reveal",
        ]);
        // Approved field read: raw value is held only in memory long enough to build/apply the Kubernetes Secret.
        let output = run_command(command, "op item get [approved field redacted]")?;
        if !output.status.success() {
            return Err(format!(
                "1Password approved field read failed for {target_key}: {}",
                sanitize_bootstrap_log_text(&String::from_utf8_lossy(&output.stderr)).trim()
            ));
        }
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        validate_bootstrap_secret_value(&value, target_key)?;
        if value.is_empty() {
            return Err(format!(
                "1Password returned an empty value for {target_key}"
            ));
        }
        agent_keys.push(BootstrapAgentKey {
            name: target_key.to_string(),
            value,
        });
        applied.push(SecretSourceAppliedReference {
            purpose: if selection.purpose.trim().is_empty() {
                purpose.to_string()
            } else {
                selection.purpose.trim().to_string()
            },
            target_secret_name: CTO_AGENT_KEYS_SECRET.to_string(),
            target_secret_key: target_key.to_string(),
            provider_ref: provider_ref.to_string(),
            status: "applied".to_string(),
        });
    }

    apply_bootstrap_agent_keys(&agent_keys)?;
    Ok(SecretSourceApplyResult {
        provider: SECRET_SOURCE_PROVIDER_ONEPASSWORD.to_string(),
        applied,
        raw_values_persisted: false,
        message: "Access connected".to_string(),
    })
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
        tracing::info!("No GitHub token or owner configured for bootstrap");
        return Ok(None);
    }
    tracing::info!(
        github_token_present = token.is_some(),
        owner = owner.as_deref().unwrap_or("unset"),
        "Normalized GitHub bootstrap credentials (token value not logged)"
    );

    Ok(Some(BootstrapGithubCredentials { token, owner }))
}

fn normalize_bootstrap_source_credentials(
    request: Option<&BootstrapLocalStackRequest>,
) -> BootstrapResult<BootstrapSourceCredentials> {
    let github = normalize_bootstrap_github_credentials(request)?;
    let gitlab_token = request
        .and_then(|request| request.tools.as_ref())
        .into_iter()
        .flat_map(|tools| tools.api_keys.iter())
        .find(|key| {
            key.name
                .trim()
                .eq_ignore_ascii_case(GITLAB_TOKEN_SECRET_KEY)
        })
        .map(|key| key.value.trim())
        .filter(|value| !value.is_empty())
        .map(validate_gitlab_token)
        .transpose()?;

    if gitlab_token.is_some() {
        tracing::info!("Normalized GitLab bootstrap token (token value not logged)");
    }

    Ok(BootstrapSourceCredentials {
        github,
        gitlab_token,
    })
}

fn normalize_bootstrap_scm_secret_manifest(
    request: Option<&BootstrapLocalStackRequest>,
) -> BootstrapResult<Option<String>> {
    let Some(manifest) = request
        .and_then(|request| request.scm.as_ref())
        .and_then(|scm| scm.github_app_secret_manifest.as_deref())
        .map(str::trim)
        .filter(|manifest| !manifest.is_empty())
    else {
        return Ok(None);
    };

    if manifest.len() > MAX_BOOTSTRAP_SCM_SECRET_MANIFEST_BYTES {
        return Err(format!(
            "GitHub App Secret manifest must be at most {MAX_BOOTSTRAP_SCM_SECRET_MANIFEST_BYTES} bytes"
        ));
    }
    if manifest
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err("GitHub App Secret manifest must not contain control characters".to_string());
    }

    let normalized = manifest.replace("\r\n", "\n").replace('\r', "\n");
    let namespace_required = format!("namespace: {CTO_NAMESPACE}");
    for required in [
        "kind: Secret",
        namespace_required.as_str(),
        "cto.5dlabs.ai/scm-provider: github",
        "app-id: |-",
        "client-id: |-",
        "client-secret: |-",
        "private-key: |-",
    ] {
        if !normalized.contains(required) {
            return Err(format!(
                "GitHub App Secret manifest is missing required field: {required}"
            ));
        }
    }

    Ok(Some(format!("{}\n", normalized.trim_end())))
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

fn normalize_bootstrap_provider_credentials(
    request: Option<&BootstrapLocalStackRequest>,
) -> BootstrapResult<BootstrapProviderCredentialBundle> {
    let requested_credentials = request
        .and_then(|request| request.providers.as_ref())
        .map_or_else(Vec::new, |providers| providers.credentials.clone());
    let mut agent_keys = BTreeMap::new();
    let mut config = BTreeMap::new();

    for credential in requested_credentials {
        let provider_id = validate_bootstrap_provider_id(&credential.provider_id)?;
        let value = credential
            .value
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        let api_key = credential
            .api_key
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);

        if let Some(value) = value.as_deref() {
            validate_bootstrap_secret_value(value, &format!("{provider_id} provider value"))?;
        }
        if let Some(api_key) = api_key.as_deref() {
            validate_bootstrap_secret_value(api_key, &format!("{provider_id} provider API key"))?;
        }

        let mut credential_config = BootstrapProviderCredentialConfig {
            value: None,
            secret_ref: None,
            api_key_secret_ref: None,
        };

        match credential.auth {
            BootstrapProviderAuth::ApiKey => {
                if let Some(value) = value {
                    let secret_key = validate_bootstrap_agent_key_name(
                        credential.secret_key.as_deref().ok_or_else(|| {
                            format!("{provider_id} API key credential requires a secretKey")
                        })?,
                    )?;
                    insert_bootstrap_agent_key(&mut agent_keys, &secret_key, value)?;
                    credential_config.secret_ref = Some(bootstrap_secret_reference(secret_key));
                }
            }
            BootstrapProviderAuth::Gateway | BootstrapProviderAuth::Local => {
                credential_config.value = value;
                if let Some(api_key) = api_key {
                    let secret_key = validate_bootstrap_agent_key_name(
                        credential.api_key_secret_key.as_deref().ok_or_else(|| {
                            format!("{provider_id} provider API key requires an apiKeySecretKey")
                        })?,
                    )?;
                    insert_bootstrap_agent_key(&mut agent_keys, &secret_key, api_key)?;
                    credential_config.api_key_secret_ref =
                        Some(bootstrap_secret_reference(secret_key));
                }
            }
            BootstrapProviderAuth::OAuth | BootstrapProviderAuth::Cloud => {
                credential_config.value = value;
            }
        }

        if (credential_config.value.is_some()
            || credential_config.secret_ref.is_some()
            || credential_config.api_key_secret_ref.is_some())
            && config
                .insert(provider_id.clone(), credential_config)
                .is_some()
        {
            return Err(format!(
                "duplicate provider credential entry for {provider_id}"
            ));
        }
    }

    Ok(BootstrapProviderCredentialBundle {
        agent_keys: agent_keys
            .into_iter()
            .map(|(name, value)| BootstrapAgentKey { name, value })
            .collect(),
        config,
    })
}

fn insert_bootstrap_agent_key(
    keys: &mut BTreeMap<String, String>,
    name: &str,
    value: String,
) -> BootstrapResult<()> {
    if keys.insert(name.to_string(), value).is_some() {
        return Err(format!("duplicate API key entry for {name}"));
    }
    Ok(())
}

fn bootstrap_secret_reference(key: String) -> BootstrapSecretReference {
    BootstrapSecretReference {
        name: CTO_AGENT_KEYS_SECRET.to_string(),
        env: key.clone(),
        key,
    }
}

fn normalize_bootstrap_discord_tokens(
    request: Option<&BootstrapLocalStackRequest>,
) -> BootstrapResult<Vec<BootstrapAgentKey>> {
    let requested_tokens = request
        .and_then(|request| request.agents.as_ref())
        .map_or_else(Vec::new, |agents| agents.discord_tokens.clone());

    let mut normalized = BTreeMap::new();
    for token in requested_tokens {
        if !token.enabled {
            continue;
        }
        let name = validate_bootstrap_discord_agent_id(&token.id)?;
        let Some(value) = token
            .token
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        validate_bootstrap_secret_value(value, &format!("{name} Discord bot token"))?;
        if normalized.contains_key(&name) {
            return Err(format!("duplicate Discord bot token entry for {name}"));
        }
        normalized.insert(name, value.to_string());
    }

    Ok(normalized
        .into_iter()
        .map(|(name, value)| BootstrapAgentKey { name, value })
        .collect())
}

fn validate_bootstrap_tool_api_key_name(raw: &str) -> BootstrapResult<String> {
    let name = raw.trim().to_ascii_uppercase();
    if name == GITLAB_TOKEN_SECRET_KEY
        || BOOTSTRAP_TOOL_API_KEY_ENV_NAMES
            .iter()
            .any(|allowed| *allowed == name)
    {
        Ok(name)
    } else {
        Err(format!("unsupported tool API key: {raw}"))
    }
}

fn validate_bootstrap_agent_key_name(raw: &str) -> BootstrapResult<String> {
    let name = raw.trim().to_ascii_uppercase();
    if name.is_empty()
        || name
            .chars()
            .any(|ch| !(ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_'))
        || name.chars().next().is_some_and(|ch| ch.is_ascii_digit())
    {
        return Err(format!("invalid API key name: {raw}"));
    }
    Ok(name)
}

fn validate_bootstrap_provider_id(raw: &str) -> BootstrapResult<String> {
    let id = raw.trim().to_ascii_lowercase();
    if id.is_empty()
        || id
            .chars()
            .any(|ch| !(ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-'))
    {
        return Err(format!("invalid provider id: {raw}"));
    }
    Ok(id)
}

fn validate_bootstrap_discord_agent_id(raw: &str) -> BootstrapResult<String> {
    let id = raw.trim().to_ascii_lowercase();
    let valid = matches!(
        id.as_str(),
        "morgan"
            | "rex"
            | "grizz"
            | "nova"
            | "viper"
            | "blaze"
            | "tap"
            | "spark"
            | "cleo"
            | "cipher"
            | "tess"
            | "stitch"
            | "atlas"
            | "bolt"
            | "block"
            | "vex"
            | "angie"
            | "glitch"
    );
    if valid {
        Ok(id)
    } else {
        Err(format!("unsupported Discord agent token: {raw}"))
    }
}

fn validate_bootstrap_secret_value(value: &str, label: &str) -> BootstrapResult<()> {
    if value.chars().any(char::is_control) {
        return Err(format!("{label} must not contain control characters"));
    }
    Ok(())
}

fn bootstrap_agent_keys(
    source_credentials: &BootstrapSourceCredentials,
    tool_api_keys: &[BootstrapAgentKey],
    provider_api_keys: &[BootstrapAgentKey],
) -> BootstrapResult<Vec<BootstrapAgentKey>> {
    let mut keys = BTreeMap::new();
    if let Some(token) = source_credentials
        .github
        .as_ref()
        .and_then(|credentials| credentials.token.as_ref())
    {
        insert_bootstrap_agent_key(&mut keys, GITHUB_TOKEN_SECRET_KEY, token.clone())?;
    }
    if let Some(token) = source_credentials.gitlab_token.as_ref() {
        insert_bootstrap_agent_key(&mut keys, GITLAB_TOKEN_SECRET_KEY, token.clone())?;
    }
    for key in tool_api_keys.iter().chain(provider_api_keys.iter()) {
        insert_bootstrap_agent_key(&mut keys, &key.name, key.value.clone())?;
    }
    Ok(keys
        .into_iter()
        .map(|(name, value)| BootstrapAgentKey { name, value })
        .collect())
}

fn build_bootstrap_cto_config(
    setup: Option<&BootstrapSetupProfile>,
    provider_credentials: &BTreeMap<String, BootstrapProviderCredentialConfig>,
) -> BootstrapResult<Option<BootstrapCtoConfig>> {
    let Some(setup) = setup else {
        return Ok(None);
    };

    validate_bootstrap_setup(setup)?;
    let selected_clis = setup.harness.clis.iter().copied().collect::<HashSet<_>>();
    let mut clis = setup
        .harness
        .clis
        .iter()
        .copied()
        .map(|cli| {
            (
                bootstrap_cli_id(cli).to_string(),
                BootstrapCtoCliConfig {
                    id: cli,
                    default_harness: setup.harness.mode,
                    providers: BTreeMap::new(),
                },
            )
        })
        .collect::<BTreeMap<_, _>>();

    for provider in &setup.harness.providers {
        let provider_clis = if provider.cli_ids.is_empty() {
            setup.harness.clis.clone()
        } else {
            provider.cli_ids.clone()
        };
        for cli in provider_clis {
            if !selected_clis.contains(&cli) {
                continue;
            }
            let Some(cli_config) = clis.get_mut(bootstrap_cli_id(cli)) else {
                continue;
            };
            cli_config.providers.insert(
                provider.id.clone(),
                BootstrapCtoProviderConfig {
                    id: provider.id.clone(),
                    auth: provider.auth,
                    default_model: provider.model.clone(),
                    models: provider.models.clone(),
                    credential: provider_credentials.get(&provider.id).cloned(),
                },
            );
        }
    }

    Ok(Some(BootstrapCtoConfig {
        version: 1,
        source: setup.source.clone(),
        harness: BootstrapCtoHarnessConfig {
            default: setup.harness.mode,
            routing: setup.harness.routing.clone(),
        },
        clis,
    }))
}

fn bootstrap_cli_id(cli: BootstrapAiCli) -> &'static str {
    match cli {
        BootstrapAiCli::OpenClaw => "openclaw",
        BootstrapAiCli::Codex => "codex",
        BootstrapAiCli::ClaudeCode => "claudeCode",
        BootstrapAiCli::GeminiCli => "geminiCli",
        BootstrapAiCli::OpenCode => "opencode",
        BootstrapAiCli::QwenCode => "qwenCode",
        BootstrapAiCli::GitHubCli => "githubCli",
        BootstrapAiCli::GitLabCli => "gitlabCli",
        BootstrapAiCli::Cursor => "cursor",
        BootstrapAiCli::Factory => "factory",
        BootstrapAiCli::Kimi => "kimi",
    }
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

fn remove_bootstrap_setup_profile(window: &Window) -> BootstrapResult<bool> {
    let path = bootstrap_setup_path(window)?;
    if !path.exists() {
        return Ok(false);
    }

    std::fs::remove_file(&path)
        .map_err(|error| format!("failed to remove {}: {error}", path.display()))?;
    Ok(true)
}

fn validate_bootstrap_setup(setup: &BootstrapSetupProfile) -> BootstrapResult<()> {
    if !setup.source.owner.trim().is_empty() {
        validate_nonempty_text(&setup.source.owner, "source owner")?;
    }
    validate_bootstrap_connection_id(&setup.source.connection_id)?;
    validate_bootstrap_base_url(&setup.source.base_url)?;

    if setup.harness.clis.is_empty() {
        return Err("bootstrap setup requires at least one selected CLI agent".to_string());
    }
    if setup.harness.providers.is_empty() {
        return Err("bootstrap setup requires at least one provider/model selection".to_string());
    }
    let mut selected_routes = HashSet::new();
    for provider in &setup.harness.providers {
        validate_nonempty_text(&provider.id, "provider id")?;
        validate_nonempty_text(&provider.model, "provider model")?;
        selected_routes.insert(BootstrapModelRoute {
            provider_id: provider.id.clone(),
            model: provider.model.clone(),
        });
        for model in &provider.models {
            validate_nonempty_text(model, "provider model")?;
            selected_routes.insert(BootstrapModelRoute {
                provider_id: provider.id.clone(),
                model: model.clone(),
            });
        }
    }
    if let Some(routing) = &setup.harness.routing {
        validate_bootstrap_model_route(&routing.primary, "primary harness model")?;
        if !selected_routes.contains(&routing.primary) {
            return Err(
                "primary harness model must match one selected provider/model pair".to_string(),
            );
        }
        if routing.fallbacks.is_empty() {
            return Err("harness routing requires at least one fallback model".to_string());
        }

        let mut fallback_routes = HashSet::new();
        for fallback in &routing.fallbacks {
            validate_bootstrap_model_route(fallback, "fallback harness model")?;
            if !selected_routes.contains(fallback) {
                return Err(
                    "fallback harness model must match a selected provider/model pair".to_string(),
                );
            }
            if !fallback_routes.insert(fallback) {
                return Err("harness routing fallback models must be unique".to_string());
            }
        }
    }
    for agent in &setup.agents {
        validate_bootstrap_discord_agent_id(&agent.id)?;
    }

    Ok(())
}

fn validate_bootstrap_model_route(route: &BootstrapModelRoute, label: &str) -> BootstrapResult<()> {
    validate_nonempty_text(&route.provider_id, &format!("{label} provider id"))?;
    validate_nonempty_text(&route.model, &format!("{label} name"))
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

fn validate_gitlab_token(token: &str) -> BootstrapResult<String> {
    if token.chars().any(char::is_control) {
        return Err("GitLab token must not contain control characters or newlines".to_string());
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

fn github_cli_oauth_blocking(window: &Window) -> BootstrapResult<GitHubCliOAuthResult> {
    if find_tool_binary("gh").is_none() {
        return Err(
            "GitHub OAuth requires the GitHub CLI (`gh`). Install it or use the PAT fallback."
                .to_string(),
        );
    }

    let gh_config = TemporaryGithubCliConfigDir::new()?;
    run_gh_browser_auth(
        window,
        &[
            "auth",
            "login",
            "--hostname",
            "github.com",
            "--web",
            "--git-protocol",
            "https",
            "--scopes",
            "repo,workflow,admin:org",
            "--insecure-storage",
        ],
        gh_config.path(),
    )?;

    let token_output = run_gh_with_config(
        gh_config.path(),
        &["auth", "token", "--hostname", "github.com"],
    )?;
    if !token_output.status.success() {
        return Err(command_failure_message("gh auth token", &token_output));
    }
    let token = validate_github_token(String::from_utf8_lossy(&token_output.stdout).trim())?;
    tracing::info!("GitHub CLI authorization returned a token (token value not logged)");

    let username_output = run_gh_with_config(gh_config.path(), &["api", "user", "--jq", ".login"])?;
    let username = if username_output.status.success() {
        Some(
            String::from_utf8_lossy(&username_output.stdout)
                .trim()
                .to_string(),
        )
        .filter(|value| !value.is_empty())
    } else {
        tracing::warn!("GitHub CLI token was retrieved, but username lookup failed");
        None
    };
    tracing::info!(
        username = username.as_deref().unwrap_or("unknown"),
        "GitHub CLI OAuth flow completed successfully"
    );
    let accounts = github_cli_oauth_accounts(gh_config.path(), username.as_deref());

    Ok(GitHubCliOAuthResult {
        token,
        username,
        accounts,
    })
}

fn github_cli_oauth_accounts(config_dir: &Path, username: Option<&str>) -> Vec<GitHubCliAccount> {
    let mut accounts = Vec::new();
    if let Some(username) = username {
        accounts.push(GitHubCliAccount {
            login: username.to_string(),
            kind: GitHubCliAccountKind::User,
        });
    }

    let org_output = run_gh_with_config(
        config_dir,
        &[
            "api",
            "user/memberships/orgs",
            "--paginate",
            "--jq",
            ".[] | select(.state == \"active\") | .organization.login",
        ],
    );
    match org_output {
        Ok(output) if output.status.success() => {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let login = line.trim();
                if login.is_empty()
                    || accounts
                        .iter()
                        .any(|account| account.login.eq_ignore_ascii_case(login))
                {
                    continue;
                }
                accounts.push(GitHubCliAccount {
                    login: login.to_string(),
                    kind: GitHubCliAccountKind::Organization,
                });
            }
        }
        Ok(_) | Err(_) => {
            tracing::warn!("GitHub CLI OAuth completed, but organization membership lookup failed");
        }
    }
    accounts
}

struct TemporaryGithubCliConfigDir {
    path: PathBuf,
}

impl TemporaryGithubCliConfigDir {
    fn new() -> BootstrapResult<Self> {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("system clock error: {error}"))?
            .as_nanos();
        let path = std::env::temp_dir().join(format!("cto-gh-auth-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&path).map_err(|error| {
            format!("failed to create temporary GitHub auth directory: {error}")
        })?;
        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TemporaryGithubCliConfigDir {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_dir_all(&self.path) {
            tracing::warn!(
                path = %self.path.display(),
                "Failed to remove temporary GitHub auth directory: {error}"
            );
        }
    }
}

fn gh_command_with_config(config_dir: &Path) -> Command {
    let mut command = tool_command("gh");
    command
        .env("GH_CONFIG_DIR", config_dir)
        .env_remove("GH_TOKEN")
        .env_remove("GITHUB_TOKEN")
        .env_remove("GITHUB_ENTERPRISE_TOKEN");
    command
}

fn run_gh_with_config(config_dir: &Path, args: &[&str]) -> BootstrapResult<Output> {
    let mut command = gh_command_with_config(config_dir);
    command.args(args);
    run_command(command, &format!("gh {}", args.join(" ")))
}

fn run_gh_browser_auth(window: &Window, args: &[&str], config_dir: &Path) -> BootstrapResult<()> {
    let mut command = gh_command_with_config(config_dir);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let label = format!("gh {}", args.join(" "));
    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to run {label}: {error}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("Failed to open {label} stdout"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("Failed to open {label} stderr"))?;
    let (line_tx, line_rx) = mpsc::channel::<String>();
    spawn_output_line_reader(stdout, line_tx.clone());
    spawn_output_line_reader(stderr, line_tx.clone());
    drop(line_tx);

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(b"\n")
            .map_err(|error| format!("Failed to start {label} browser flow: {error}"))?;
    }

    let mut prompt = GitHubCliOAuthPrompt {
        message: "Opening GitHub authorization in your browser with a temporary GitHub CLI profile. Morgan will show the device code here if GitHub CLI provides one.".to_string(),
        verification_uri: None,
        user_code: None,
        copied_to_clipboard: false,
        clipboard_error: None,
    };
    emit_github_cli_oauth_prompt(window, &prompt);

    let mut output_lines = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(120);
    loop {
        while let Ok(line) = line_rx.try_recv() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            merge_github_cli_oauth_prompt(&mut prompt, trimmed);
            emit_github_cli_oauth_prompt(window, &prompt);
            output_lines.push(trimmed.to_string());
        }

        match child
            .try_wait()
            .map_err(|error| format!("Failed to poll {label}: {error}"))?
        {
            Some(status) if status.success() => return Ok(()),
            Some(status) => {
                return Err(format!(
                    "{label} failed with exit code {}: {}",
                    status
                        .code()
                        .map_or_else(|| "unknown".to_string(), |code| code.to_string()),
                    output_lines.join("\n")
                ));
            }
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                return Err(format!(
                    "GitHub OAuth did not complete within 2 minutes. Close any stale browser prompt, switch to the right profile, and try again. {}",
                    output_lines.join("\n")
                ));
            }
            None => thread::sleep(Duration::from_millis(250)),
        }
    }
}

fn spawn_output_line_reader<R>(reader: R, line_tx: mpsc::Sender<String>)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let _ = line_tx.send(line);
        }
    });
}

fn merge_github_cli_oauth_prompt(prompt: &mut GitHubCliOAuthPrompt, line: &str) {
    if let Some(uri) = extract_github_verification_uri(line) {
        prompt.verification_uri = Some(uri);
    }
    if let Some(code) = extract_github_user_code(line) {
        if prompt.user_code.as_deref() != Some(code.as_str()) {
            match copy_text_to_clipboard(&code) {
                Ok(()) => {
                    prompt.copied_to_clipboard = true;
                    prompt.clipboard_error = None;
                }
                Err(error) => {
                    prompt.copied_to_clipboard = false;
                    prompt.clipboard_error = Some(error);
                }
            }
        }
        prompt.user_code = Some(code);
    }
    if line.contains("copy your one-time code")
        || line.contains("one-time code")
        || line.contains("device code")
        || line.contains("login/device")
    {
        prompt.message =
            "Morgan found the GitHub authorization code and copied it to your clipboard. Paste it into the browser window to continue."
                .to_string();
    }
}

fn copy_text_to_clipboard(text: &str) -> BootstrapResult<()> {
    #[cfg(target_os = "macos")]
    {
        let pbcopy_result = write_to_clipboard_command("pbcopy", &[], text)
            .and_then(|()| verify_macos_clipboard(text));
        if pbcopy_result.is_ok() {
            return Ok(());
        }

        write_to_macos_clipboard_with_osascript(text).and_then(|()| {
            verify_macos_clipboard(text).map_err(|fallback_error| {
                format!(
                    "{}; AppleScript fallback also failed: {fallback_error}",
                    pbcopy_result
                        .err()
                        .unwrap_or_else(|| "pbcopy verification failed".to_string())
                )
            })
        })
    }

    #[cfg(target_os = "windows")]
    {
        return write_to_clipboard_command(
            "powershell",
            &["-NoProfile", "-Command", "Set-Clipboard"],
            text,
        );
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        if find_tool_binary("wl-copy").is_some() {
            return write_to_clipboard_command("wl-copy", &[], text);
        }
        if find_tool_binary("xclip").is_some() {
            return write_to_clipboard_command("xclip", &["-selection", "clipboard"], text);
        }
        Err(
            "No clipboard helper found. Install wl-copy or xclip, or copy the code manually."
                .to_string(),
        )
    }
}

#[cfg(target_os = "macos")]
fn verify_macos_clipboard(expected: &str) -> BootstrapResult<()> {
    let output = run_tool("pbpaste", &[])?;
    if !output.status.success() {
        return Err(command_failure_message("pbpaste", &output));
    }
    let actual = String::from_utf8_lossy(&output.stdout);
    if actual == expected {
        Ok(())
    } else {
        Err("clipboard verification did not match copied GitHub code".to_string())
    }
}

#[cfg(target_os = "macos")]
fn write_to_macos_clipboard_with_osascript(text: &str) -> BootstrapResult<()> {
    let script = format!(
        "set the clipboard to \"{}\"",
        text.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|error| format!("Failed to copy GitHub code with osascript: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_failure_message("osascript clipboard", &output))
    }
}

fn write_to_clipboard_command(name: &str, args: &[&str], text: &str) -> BootstrapResult<()> {
    let mut command = tool_command(name);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let label = if args.is_empty() {
        name.to_string()
    } else {
        format!("{} {}", name, args.join(" "))
    };
    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to copy GitHub code with {label}: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|error| format!("Failed to write GitHub code to {label}: {error}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to wait for {label}: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_failure_message(&label, &output))
    }
}

fn emit_github_cli_oauth_prompt(window: &Window, prompt: &GitHubCliOAuthPrompt) {
    let _ = window.emit("github-cli-oauth-prompt", prompt);
}

fn extract_github_verification_uri(line: &str) -> Option<String> {
    line.split_whitespace()
        .map(|part| {
            part.trim_matches(|ch: char| {
                ch == '"'
                    || ch == '\''
                    || ch == '`'
                    || ch == '<'
                    || ch == '>'
                    || ch == ','
                    || ch == '.'
            })
        })
        .find(|part| part.starts_with("https://github.com/login/device"))
        .map(ToString::to_string)
}

fn extract_github_user_code(line: &str) -> Option<String> {
    line.split_whitespace()
        .map(|part| {
            part.trim_matches(|ch: char| {
                ch == '"' || ch == '\'' || ch == '`' || ch == ':' || ch == ',' || ch == '.'
            })
        })
        .find(|part| {
            let len = part.len();
            (8..=20).contains(&len)
                && part.contains('-')
                && part
                    .chars()
                    .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '-')
        })
        .map(ToString::to_string)
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

fn delete_bootstrap_kind_cluster() -> BootstrapResult<bool> {
    if find_tool_binary("kind").is_none() {
        tracing::info!("kind is unavailable; skipping local CTO cluster deletion during reset");
        return Ok(false);
    }

    if !kind_cluster_exists()? {
        return Ok(false);
    }

    let mut list_apps_command = kubectl_command();
    list_apps_command.args([
        "-n",
        ARGOCD_NAMESPACE,
        "get",
        "applications.argoproj.io",
        "-o",
        "name",
        "--ignore-not-found",
    ]);
    match run_command(list_apps_command, "kubectl list Argo CD Applications") {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for application in stdout
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
            {
                let mut patch_command = kubectl_command();
                patch_command.args([
                    "-n",
                    ARGOCD_NAMESPACE,
                    "patch",
                    application,
                    "--type",
                    "merge",
                    "--patch",
                    r#"{"metadata":{"finalizers":[]}}"#,
                ]);
                match run_command(
                    patch_command,
                    "kubectl patch Argo CD Application finalizers",
                ) {
                    Ok(output) if output.status.success() => {}
                    Ok(output) => tracing::warn!(
                        "{}",
                        command_failure_message(
                            "kubectl patch Argo CD Application finalizers",
                            &output
                        )
                    ),
                    Err(error) => {
                        tracing::warn!("Failed to patch Argo CD Application finalizers: {error}");
                    }
                }
            }
        }
        Ok(output) => tracing::warn!(
            "{}",
            command_failure_message("kubectl list Argo CD Applications", &output)
        ),
        Err(error) => tracing::warn!("Failed to list Argo CD Applications before reset: {error}"),
    }

    let mut delete_apps_command = kubectl_command();
    delete_apps_command.args([
        "-n",
        ARGOCD_NAMESPACE,
        "delete",
        "applications.argoproj.io",
        "--all",
        "--ignore-not-found",
        "--wait=false",
    ]);
    match run_command(delete_apps_command, "kubectl delete Argo CD Applications") {
        Ok(output) if output.status.success() => {}
        Ok(output) => tracing::warn!(
            "{}",
            command_failure_message("kubectl delete Argo CD Applications", &output)
        ),
        Err(error) => tracing::warn!("Failed to delete Argo CD Applications before reset: {error}"),
    }

    let mut command = kind_command();
    command.args(["delete", "cluster", "--name", CLUSTER_NAME]);
    let output = run_command(command, "kind delete cluster")?;
    if !output.status.success() {
        return Err(command_failure_message("kind delete cluster", &output));
    }

    Ok(true)
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

fn apply_client_cluster_baseline_apps() -> BootstrapResult<()> {
    for app in CLIENT_CLUSTER_BASELINE_APPS {
        tracing::info!(
            "Applying {} Client Cluster baseline Argo Application",
            app.name
        );
        apply_manifest(app.manifest).map_err(|error| {
            format!(
                "Failed to apply {} Client Cluster baseline Argo Application: {error}",
                app.name
            )
        })?;
    }

    Ok(())
}

#[derive(Debug, Eq, PartialEq)]
struct ArgoApplicationStatusSummary {
    sync: Option<String>,
    health: Option<String>,
    conditions: Vec<String>,
}

fn wait_for_bootstrap_apps(mode: BootstrapAppMode, timeout: Duration) -> BootstrapResult<()> {
    for app in mode.manifests() {
        wait_for_argocd_application(app.name, timeout)?;
    }

    Ok(())
}

fn wait_for_client_cluster_baseline_apps(timeout: Duration) -> BootstrapResult<()> {
    for app in CLIENT_CLUSTER_BASELINE_APPS {
        wait_for_argocd_application(app.name, timeout)?;
    }

    Ok(())
}

fn wait_for_argocd_application(name: &str, timeout: Duration) -> BootstrapResult<()> {
    let deadline = Instant::now() + timeout;

    loop {
        let value = kubectl_json(&[
            "-n",
            ARGOCD_NAMESPACE,
            "get",
            "application",
            name,
            "-o",
            "json",
        ])
        .map_err(|error| format!("Failed to read Argo Application {name}: {error}"))?;
        let summary = argo_application_status_summary(&value);

        if summary.sync.as_deref() == Some("Synced") && summary.health.as_deref() == Some("Healthy")
        {
            tracing::info!("{name} Argo Application is Synced and Healthy");
            return Ok(());
        }

        if let Some(message) = terminal_argo_application_error(name, &summary) {
            return Err(message);
        }

        if Instant::now() >= deadline {
            let status = format_argo_application_status(&summary);
            log_argocd_application_diagnostics(name);
            return Err(format!(
                "Timed out waiting for Argo Application {name} to become Synced/Healthy: {status}"
            ));
        }

        thread::sleep(Duration::from_secs(5));
    }
}

fn argo_application_status_summary(value: &Value) -> ArgoApplicationStatusSummary {
    let sync = value
        .pointer("/status/sync/status")
        .and_then(Value::as_str)
        .map(str::to_string);
    let health = value
        .pointer("/status/health/status")
        .and_then(Value::as_str)
        .map(str::to_string);
    let conditions = value
        .pointer("/status/conditions")
        .and_then(Value::as_array)
        .map(|conditions| {
            conditions
                .iter()
                .filter_map(|condition| {
                    let condition_type = condition.get("type").and_then(Value::as_str)?;
                    let message = condition
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if message.is_empty() {
                        Some(condition_type.to_string())
                    } else {
                        Some(format!("{condition_type}: {message}"))
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    ArgoApplicationStatusSummary {
        sync,
        health,
        conditions,
    }
}

fn terminal_argo_application_error(
    name: &str,
    summary: &ArgoApplicationStatusSummary,
) -> Option<String> {
    let condition = summary.conditions.iter().find(|condition| {
        condition.starts_with("ComparisonError:")
            || condition.starts_with("SyncError:")
            || condition.starts_with("InvalidSpecError:")
    })?;
    log_argocd_application_diagnostics(name);
    Some(format!(
        "Argo Application {name} failed to reconcile: {condition}"
    ))
}

fn format_argo_application_status(summary: &ArgoApplicationStatusSummary) -> String {
    let sync = summary.sync.as_deref().unwrap_or("unknown");
    let health = summary.health.as_deref().unwrap_or("unknown");
    if summary.conditions.is_empty() {
        format!("sync={sync}, health={health}")
    } else {
        format!(
            "sync={sync}, health={health}, conditions={}",
            summary.conditions.join(" | ")
        )
    }
}

fn log_argocd_application_diagnostics(name: &str) {
    append_bootstrap_log(&format!(
        "collecting diagnostics for Argo Application `{name}`"
    ));
    log_kubectl_diagnostic(&[
        "-n",
        ARGOCD_NAMESPACE,
        "get",
        "application",
        name,
        "-o",
        "json",
    ]);
    log_kubectl_diagnostic(&[
        "-n",
        ARGOCD_NAMESPACE,
        "get",
        "applications.argoproj.io",
        "-o",
        "wide",
    ]);
    log_kubectl_diagnostic(&["-n", ARGOCD_NAMESPACE, "get", "pods", "-o", "wide"]);
    log_kubectl_diagnostic(&["-n", CTO_NAMESPACE, "get", "pods", "-o", "wide"]);
    log_kubectl_diagnostic(&[
        "-n",
        CTO_NAMESPACE,
        "get",
        "events",
        "--sort-by=.lastTimestamp",
    ]);
}

fn log_kubectl_diagnostic(args: &[&str]) {
    let label = format!("kubectl {}", args.join(" "));
    match run_kubectl(args) {
        Ok(output) => {
            append_command_stream(&label, "stdout", &output.stdout);
            append_command_stream(&label, "stderr", &output.stderr);
        }
        Err(error) => append_bootstrap_log(&format!("diagnostic `{label}` failed: {error}")),
    }
}

fn apply_bootstrap_scm_secret(manifest: Option<&str>) -> BootstrapResult<()> {
    let Some(manifest) = manifest else {
        return Ok(());
    };

    tracing::info!("Applying GitHub App source-control Secret to {CTO_NAMESPACE}");
    apply_manifest(manifest)
        .map_err(|error| format!("Failed to apply GitHub App source-control Secret: {error}"))
}

fn apply_bootstrap_agent_keys(agent_keys: &[BootstrapAgentKey]) -> BootstrapResult<()> {
    if agent_keys.is_empty() {
        tracing::warn!(
            "No local API keys configured for bootstrap; cto-tools providers that require keys will stay unavailable"
        );
        return Ok(());
    }

    let github_token_present = agent_keys
        .iter()
        .any(|key| key.name == GITHUB_TOKEN_SECRET_KEY);
    let gitlab_token_present = agent_keys
        .iter()
        .any(|key| key.name == GITLAB_TOKEN_SECRET_KEY);
    tracing::info!(
        secret = CTO_AGENT_KEYS_SECRET,
        namespace = CTO_NAMESPACE,
        key_count = agent_keys.len(),
        github_token_present,
        gitlab_token_present,
        "Applying local API key Secret (secret values not logged)"
    );
    apply_manifest(&agent_keys_secret_manifest(agent_keys)?)
        .map_err(|error| format!("Failed to apply local API key Secret: {error}"))?;
    if github_token_present {
        tracing::info!(
            secret = CTO_AGENT_KEYS_SECRET,
            namespace = CTO_NAMESPACE,
            key = GITHUB_TOKEN_SECRET_KEY,
            "GitHub token key stored for local agents (token value not logged)"
        );
    } else {
        tracing::warn!(
            secret = CTO_AGENT_KEYS_SECRET,
            namespace = CTO_NAMESPACE,
            "Local API key Secret applied without a GitHub token"
        );
    }
    if gitlab_token_present {
        tracing::info!(
            secret = CTO_AGENT_KEYS_SECRET,
            namespace = CTO_NAMESPACE,
            key = GITLAB_TOKEN_SECRET_KEY,
            "GitLab token key stored for local agents (token value not logged)"
        );
    }
    Ok(())
}

fn apply_bootstrap_argocd_oci_repository(
    credentials: Option<&BootstrapGithubCredentials>,
) -> BootstrapResult<()> {
    let Some(token) = credentials.and_then(|credentials| credentials.token.as_deref()) else {
        tracing::warn!(
            "No GitHub token configured for bootstrap; Argo CD will attempt anonymous GHCR OCI chart pulls"
        );
        return Ok(());
    };
    let username = credentials
        .and_then(|credentials| credentials.owner.as_deref())
        .unwrap_or("x-access-token");

    tracing::info!(
        secret = "ghcr-helm-charts-repository",
        namespace = ARGOCD_NAMESPACE,
        username,
        "Applying Argo CD GHCR OCI repository credentials (token value not logged)"
    );
    apply_manifest(&argocd_oci_repository_secret_manifest(username, token)?)
        .map_err(|error| format!("Failed to apply Argo CD GHCR repository credentials: {error}"))?;
    tracing::info!(
        secret = "ghcr-helm-charts-repository",
        namespace = ARGOCD_NAMESPACE,
        "Argo CD GHCR OCI repository credentials applied successfully"
    );
    Ok(())
}

fn apply_bootstrap_ghcr_pull_secret(
    credentials: Option<&BootstrapGithubCredentials>,
) -> BootstrapResult<()> {
    let Some(token) = credentials.and_then(|credentials| credentials.token.as_deref()) else {
        tracing::warn!(
            "No GitHub token configured for bootstrap; Kubernetes will attempt anonymous GHCR image pulls"
        );
        return Ok(());
    };
    let username = credentials
        .and_then(|credentials| credentials.owner.as_deref())
        .unwrap_or("x-access-token");

    tracing::info!(
        secret = GHCR_PULL_SECRET,
        namespace = CTO_NAMESPACE,
        username,
        "Applying GHCR image pull Secret (token value not logged)"
    );
    apply_manifest(&ghcr_pull_secret_manifest(username, token)?)
        .map_err(|error| format!("Failed to apply GHCR image pull Secret: {error}"))?;
    tracing::info!(
        secret = GHCR_PULL_SECRET,
        namespace = CTO_NAMESPACE,
        "GHCR image pull Secret applied successfully"
    );
    Ok(())
}

fn apply_bootstrap_discord_tokens(discord_tokens: &[BootstrapAgentKey]) -> BootstrapResult<()> {
    if discord_tokens.is_empty() {
        tracing::warn!(
            "No Discord bot tokens configured for bootstrap; OpenClaw Discord agents will stay disabled until tokens are added"
        );
        return Ok(());
    }

    tracing::info!(
        "Applying {} Discord bot token(s) to {}",
        discord_tokens.len(),
        OPENCLAW_DISCORD_TOKENS_SECRET
    );
    apply_manifest(&discord_tokens_secret_manifest(discord_tokens)?)
        .map_err(|error| format!("Failed to apply Discord bot token Secret: {error}"))
}

fn patch_bootstrap_cto_agent_keys(agent_keys: &[BootstrapAgentKey]) -> BootstrapResult<()> {
    if agent_keys.is_empty() {
        return Ok(());
    }

    tracing::info!("Configuring CTO chart agentKeys from setup API keys");
    let patch = cto_agent_keys_values_patch(agent_keys);
    run_kubectl(&[
        "-n",
        ARGOCD_NAMESPACE,
        "patch",
        "application",
        CTO_ARGO_APP_NAME,
        "--type",
        "merge",
        "-p",
        &patch,
    ])
    .map(|_| ())
    .map_err(|error| format!("Failed to configure CTO API keys: {error}"))
}

fn cto_agent_keys_values_patch(agent_keys: &[BootstrapAgentKey]) -> String {
    let agent_keys = agent_keys
        .iter()
        .map(|key| (key.name.clone(), json!(key.value)))
        .collect::<serde_json::Map<_, _>>();
    json!({
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
    .to_string()
}

fn patch_bootstrap_cto_config(config: Option<&BootstrapCtoConfig>) -> BootstrapResult<()> {
    let Some(config) = config else {
        return Ok(());
    };

    tracing::info!("Configuring CTO chart CTO-config.json from setup selections");
    let patch = cto_config_values_patch(config);
    run_kubectl(&[
        "-n",
        ARGOCD_NAMESPACE,
        "patch",
        "application",
        CTO_ARGO_APP_NAME,
        "--type",
        "merge",
        "-p",
        &patch,
    ])
    .map(|_| ())
    .map_err(|error| format!("Failed to configure CTO setup config: {error}"))
}

fn cto_config_values_patch(config: &BootstrapCtoConfig) -> String {
    json!({
        "spec": {
            "source": {
                "helm": {
                    "valuesObject": {
                        "ctoConfig": config
                    }
                }
            }
        }
    })
    .to_string()
}

fn patch_bootstrap_morgan_cto_config(
    mode: BootstrapAppMode,
    config: Option<&BootstrapCtoConfig>,
) -> BootstrapResult<()> {
    if mode.skips_layered_apps() {
        return Ok(());
    }
    let Some(config) = config else {
        return Ok(());
    };

    tracing::info!("Configuring Morgan workspace CTO config from setup selections");
    let patch = morgan_cto_config_values_patch(config)?;
    run_kubectl(&[
        "-n",
        ARGOCD_NAMESPACE,
        "patch",
        "application",
        MORGAN_ARGO_APP_NAME,
        "--type",
        "merge",
        "-p",
        &patch,
    ])
    .map(|_| ())
    .map_err(|error| format!("Failed to configure Morgan CTO setup config: {error}"))
}

fn morgan_cto_config_values_patch(config: &BootstrapCtoConfig) -> BootstrapResult<String> {
    let config_json = serde_json::to_string_pretty(config)
        .map_err(|error| format!("failed to serialize Morgan CTO config: {error}"))?;
    Ok(json!({
        "spec": {
            "source": {
                "helm": {
                    "valuesObject": {
                        "extraEnv": [
                            {
                                "name": "CTO_CONFIG_PATH",
                                "value": MORGAN_CTO_CONFIG_PATH
                            }
                        ],
                        "workspace": {
                            "files": {
                                "cto-config.json": config_json
                            }
                        }
                    }
                }
            }
        }
    })
    .to_string())
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
        MORGAN_ARGO_APP_NAME,
        "--type",
        "merge",
        "-p",
        &patch,
    ])
    .map(|_| ())
    .map_err(|error| format!("Failed to configure Morgan GitHub owner: {error}"))
}

async fn ensure_bootstrap_gitops_repository(
    credentials: Option<&BootstrapGithubCredentials>,
    github_request: Option<&BootstrapGithubRequest>,
    setup: Option<&BootstrapSetupProfile>,
) -> BootstrapResult<()> {
    let required = gitops_repository_initialization_required(credentials, github_request, setup);
    let Some(token) = credentials.and_then(|credentials| credentials.token.as_deref()) else {
        if required {
            return Err(
                "GitOps repository initialization requires a GitHub token because a GitHub source/bootstrap was selected"
                    .to_string(),
            );
        }
        tracing::warn!("No GitHub token configured; skipping GitOps repository initialization");
        return Ok(());
    };
    let Some(owner) = gitops_repository_owner(credentials, setup) else {
        if required {
            return Err(format!(
                "GitOps repository initialization requires a GitHub owner/org for {CTO_GITOPS_REPO_NAME} because a GitHub source/bootstrap was selected"
            ));
        }
        tracing::warn!("No GitHub owner/org configured; skipping GitOps repository initialization");
        return Ok(());
    };

    let files = collect_gitops_repository_files()?;
    let target_repo_url = gitops_repository_html_url(&owner);
    tracing::info!(
        owner = %owner,
        repository = CTO_GITOPS_REPO_NAME,
        target_repository_url = %target_repo_url,
        file_count = files.len(),
        "Resolved GitOps repository bootstrap target (token value not logged)"
    );
    if files.is_empty() {
        if required {
            return Err(format!(
                "No GitOps files found to initialize {target_repo_url}; refusing to continue with selected GitHub source/bootstrap"
            ));
        }
        tracing::warn!(
            "No GitOps files found to commit; skipping GitOps repository initialization"
        );
        return Ok(());
    }

    let client = Client::new();
    let login = github_api_get::<GitHubUserResponse>(&client, token, "https://api.github.com/user")
        .await?
        .login;
    tracing::info!(
        github_login = %login,
        owner = %owner,
        repository = CTO_GITOPS_REPO_NAME,
        target_repository_url = %target_repo_url,
        file_count = files.len(),
        "Preparing GitOps repository (token value not logged)"
    );

    let repo_url = ensure_github_repository(&client, token, &login, &owner).await?;
    commit_gitops_files(&client, token, &owner, &files).await?;
    tracing::info!(
        repository_url = %repo_url,
        owner = %owner,
        repository = CTO_GITOPS_REPO_NAME,
        file_count = files.len(),
        "GitOps repository initialized"
    );
    Ok(())
}

fn gitops_repository_initialization_required(
    credentials: Option<&BootstrapGithubCredentials>,
    github_request: Option<&BootstrapGithubRequest>,
    setup: Option<&BootstrapSetupProfile>,
) -> bool {
    setup.is_some_and(|setup| setup.source.provider == BootstrapSourceProvider::GitHub)
        || credentials.is_some()
        || github_request.is_some_and(|github| github.enabled != Some(false))
}

fn gitops_repository_owner(
    credentials: Option<&BootstrapGithubCredentials>,
    setup: Option<&BootstrapSetupProfile>,
) -> Option<String> {
    setup
        .and_then(|setup| {
            (setup.source.provider == BootstrapSourceProvider::GitHub)
                .then(|| setup.source.owner.trim().to_string())
        })
        .filter(|owner| !owner.is_empty())
        .or_else(|| {
            credentials
                .and_then(|credentials| credentials.owner.as_deref())
                .map(str::trim)
                .filter(|owner| !owner.is_empty())
                .map(ToOwned::to_owned)
        })
}

async fn ensure_github_repository(
    client: &Client,
    token: &str,
    login: &str,
    owner: &str,
) -> BootstrapResult<String> {
    let repo_api_url = github_repo_api_url(owner);
    match github_api_get::<GitHubRepoResponse>(client, token, &repo_api_url).await {
        Ok(repo) => return Ok(repo.html_url),
        Err(error) if error.contains("404") => {}
        Err(error) => return Err(error),
    }

    let create_url = if owner.eq_ignore_ascii_case(login) {
        "https://api.github.com/user/repos".to_string()
    } else {
        format!("https://api.github.com/orgs/{owner}/repos")
    };
    let body = json!({
        "name": CTO_GITOPS_REPO_NAME,
        "description": "CTO Desktop local GitOps bootstrap repository",
        "private": true,
        "auto_init": false
    });
    let repo = github_api_send::<GitHubRepoResponse>(
        client.post(&create_url).json(&body),
        token,
        &format!("create GitHub repository {owner}/{CTO_GITOPS_REPO_NAME}"),
    )
    .await?;
    Ok(repo.html_url)
}

async fn commit_gitops_files(
    client: &Client,
    token: &str,
    owner: &str,
    files: &[GitOpsFile],
) -> BootstrapResult<()> {
    let repo_api_url = github_repo_api_url(owner);
    let get_ref_url = format!("{repo_api_url}/git/ref/heads/main");
    let update_ref_url = format!("{repo_api_url}/git/refs/heads/main");
    let mut files_to_commit = files;
    let current_ref = match github_api_get::<GitHubRefResponse>(client, token, &get_ref_url).await {
        Ok(reference) => reference,
        Err(error) if error.contains("404") || error.contains("409") => {
            let Some((first_file, remaining_files)) = files.split_first() else {
                return Ok(());
            };
            create_initial_gitops_file(client, token, owner, first_file).await?;
            files_to_commit = remaining_files;
            if files_to_commit.is_empty() {
                return Ok(());
            }
            github_api_get::<GitHubRefResponse>(client, token, &get_ref_url).await?
        }
        Err(error) => return Err(error),
    };

    let commit = github_api_get::<GitHubCommitResponse>(
        client,
        token,
        &format!("{repo_api_url}/git/commits/{}", current_ref.object.sha),
    )
    .await?;
    let base_commit_sha = commit.sha;
    let base_tree_sha = commit.tree.sha;

    let mut tree_entries = Vec::with_capacity(files_to_commit.len());
    for file in files_to_commit {
        let blob = github_api_send::<GitHubBlobResponse>(
            client
                .post(format!("{repo_api_url}/git/blobs"))
                .json(&json!({
                    "content": file.content,
                    "encoding": "utf-8"
                })),
            token,
            &format!("create GitHub blob {}", file.path),
        )
        .await?;
        tree_entries.push(json!({
            "path": file.path,
            "mode": "100644",
            "type": "blob",
            "sha": blob.sha
        }));
    }

    let tree_body = json!({
        "base_tree": base_tree_sha,
        "tree": tree_entries
    });
    let tree = github_api_send::<GitHubTreeResponse>(
        client
            .post(format!("{repo_api_url}/git/trees"))
            .json(&tree_body),
        token,
        "create GitHub GitOps tree",
    )
    .await?;

    let mut commit_body = json!({
        "message": "Initialize CTO GitOps",
        "tree": tree.sha
    });
    commit_body["parents"] = json!([base_commit_sha]);
    let commit = github_api_send::<GitHubCommitResponse>(
        client
            .post(format!("{repo_api_url}/git/commits"))
            .json(&commit_body),
        token,
        "create GitHub GitOps commit",
    )
    .await?;

    github_api_send::<Value>(
        client.patch(&update_ref_url).json(&json!({
            "sha": commit.sha,
            "force": false
        })),
        token,
        "update GitHub GitOps main branch",
    )
    .await?;

    Ok(())
}

async fn create_initial_gitops_file(
    client: &Client,
    token: &str,
    owner: &str,
    file: &GitOpsFile,
) -> BootstrapResult<()> {
    let repo_api_url = github_repo_api_url(owner);
    github_api_send::<Value>(
        client
            .put(format!("{repo_api_url}/contents/{}", file.path))
            .json(&json!({
                "message": "Initialize CTO GitOps",
                "content": base64_encode(file.content.as_bytes()),
                "branch": "main"
            })),
        token,
        &format!("create initial GitHub GitOps file {}", file.path),
    )
    .await
    .map(|_| ())
}

fn github_repo_api_url(owner: &str) -> String {
    format!("https://api.github.com/repos/{owner}/{CTO_GITOPS_REPO_NAME}")
}

fn gitops_repository_html_url(owner: &str) -> String {
    format!("https://github.com/{owner}/{CTO_GITOPS_REPO_NAME}")
}

async fn github_api_get<T: for<'de> Deserialize<'de>>(
    client: &Client,
    token: &str,
    url: &str,
) -> BootstrapResult<T> {
    github_api_send(client.get(url), token, &format!("GET {url}")).await
}

async fn github_api_send<T: for<'de> Deserialize<'de>>(
    request: reqwest::RequestBuilder,
    token: &str,
    action: &str,
) -> BootstrapResult<T> {
    let response = request
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "cto-desktop")
        .send()
        .await
        .map_err(|error| format!("{action} failed: {error}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("{action} failed to read response: {error}"))?;
    if !status.is_success() {
        return Err(format!("{action} failed with status {status}: {text}"));
    }
    serde_json::from_str(&text).map_err(|error| format!("{action} returned invalid JSON: {error}"))
}

fn collect_gitops_repository_files() -> BootstrapResult<Vec<GitOpsFile>> {
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "failed to resolve repository root".to_string())?;
    let template_dir = repo_root.join(".gitops").join("template");
    if template_dir.is_dir() {
        return collect_gitops_repository_files_from_template_root(&template_dir);
    }

    Ok(embedded_gitops_template_files())
}

fn collect_gitops_repository_files_from_template_root(
    template_root: &Path,
) -> BootstrapResult<Vec<GitOpsFile>> {
    let mut files = Vec::new();
    collect_gitops_files_from_dir(template_root, template_root, &mut files)?;
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

fn embedded_gitops_template_files() -> Vec<GitOpsFile> {
    let mut files = GITOPS_TEMPLATE_FILES
        .iter()
        .map(|(path, content)| GitOpsFile {
            path: (*path).to_string(),
            content: (*content).to_string(),
        })
        .collect::<Vec<_>>();
    files.sort_by(|left, right| left.path.cmp(&right.path));
    files
}

fn collect_gitops_files_from_dir(
    root: &Path,
    current: &Path,
    files: &mut Vec<GitOpsFile>,
) -> BootstrapResult<()> {
    for entry in fs::read_dir(current)
        .map_err(|error| format!("failed to read {}: {error}", current.display()))?
    {
        let entry = entry
            .map_err(|error| format!("failed to read {} entry: {error}", current.display()))?;
        let path = entry.path();
        if path.is_dir() {
            collect_gitops_files_from_dir(root, &path, files)?;
            continue;
        }
        if !path.is_file() {
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|error| format!("failed to relativize {}: {error}", path.display()))?;
        let relative = relative.to_string_lossy().replace('\\', "/");
        let content = fs::read_to_string(&path)
            .map_err(|error| format!("failed to read GitOps file {}: {error}", path.display()))?;
        files.push(GitOpsFile {
            path: relative,
            content,
        });
    }
    Ok(())
}

fn agent_keys_secret_manifest(agent_keys: &[BootstrapAgentKey]) -> BootstrapResult<String> {
    secret_manifest(CTO_AGENT_KEYS_SECRET, agent_keys)
}

fn argocd_oci_repository_secret_manifest(username: &str, token: &str) -> BootstrapResult<String> {
    validate_bootstrap_secret_value(username, "Argo CD GHCR username")?;
    validate_bootstrap_secret_value(token, "Argo CD GHCR token")?;
    let quoted_username = serde_json::to_string(username)
        .map_err(|error| format!("Failed to render Argo CD GHCR username: {error}"))?;
    let quoted_token = serde_json::to_string(token)
        .map_err(|error| format!("Failed to render Argo CD GHCR token: {error}"))?;

    Ok(format!(
        r#"apiVersion: v1
kind: Secret
metadata:
  name: ghcr-helm-charts-repository
  namespace: {ARGOCD_NAMESPACE}
  labels:
    argocd.argoproj.io/secret-type: repository
    app.kubernetes.io/name: cto
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: cto-desktop
type: Opaque
stringData:
  type: helm
  name: ghcr-helm-charts
  url: {GHCR_REGISTRY}/5dlabs/helm-charts
  enableOCI: "true"
  username: {quoted_username}
  password: {quoted_token}
"#
    ))
}

fn ghcr_pull_secret_manifest(username: &str, token: &str) -> BootstrapResult<String> {
    validate_bootstrap_secret_value(username, "GHCR username")?;
    validate_bootstrap_secret_value(token, "GHCR token")?;
    let auth = base64_encode(format!("{username}:{token}").as_bytes());
    let mut auths = serde_json::Map::new();
    auths.insert(
        GHCR_REGISTRY.to_string(),
        json!({
            "username": username,
            "password": token,
            "auth": auth,
        }),
    );
    let docker_config = serde_json::to_string(&json!({ "auths": auths }))
        .map_err(|error| format!("Failed to render GHCR pull Secret: {error}"))?;

    Ok(format!(
        r"apiVersion: v1
kind: Secret
metadata:
  name: {GHCR_PULL_SECRET}
  namespace: {CTO_NAMESPACE}
  labels:
    app.kubernetes.io/name: cto
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: cto-desktop
type: kubernetes.io/dockerconfigjson
stringData:
  .dockerconfigjson: |-
    {docker_config}
"
    ))
}

fn discord_tokens_secret_manifest(discord_tokens: &[BootstrapAgentKey]) -> BootstrapResult<String> {
    secret_manifest(OPENCLAW_DISCORD_TOKENS_SECRET, discord_tokens)
}

fn secret_manifest(name: &str, keys: &[BootstrapAgentKey]) -> BootstrapResult<String> {
    let mut secret_entries = String::new();
    for key in keys {
        let quoted_value = serde_json::to_string(&key.value)
            .map_err(|error| format!("Failed to render {} Secret value: {error}", key.name))?;
        writeln!(secret_entries, "  {}: {quoted_value}", key.name)
            .map_err(|error| format!("Failed to render {} Secret value: {error}", key.name))?;
    }

    Ok(format!(
        r"apiVersion: v1
kind: Secret
metadata:
  name: {name}
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

fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = *chunk.get(1).unwrap_or(&0);
        let third = *chunk.get(2).unwrap_or(&0);

        encoded.push(ALPHABET[(first >> 2) as usize] as char);
        encoded.push(ALPHABET[(((first & 0b0000_0011) << 4) | (second >> 4)) as usize] as char);
        if chunk.len() > 1 {
            encoded.push(ALPHABET[(((second & 0b0000_1111) << 2) | (third >> 6)) as usize] as char);
        } else {
            encoded.push('=');
        }
        if chunk.len() > 2 {
            encoded.push(ALPHABET[(third & 0b0011_1111) as usize] as char);
        } else {
            encoded.push('=');
        }
    }
    encoded
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
    let label = format!("kubectl {}", args.join(" "));
    append_bootstrap_log(&format!("starting `{label}` from stdin manifest"));

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
    log_command_output(&label, &output);

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

fn kubectl_json(args: &[&str]) -> BootstrapResult<Value> {
    let output = run_kubectl(args)?;
    let label = format!("kubectl {}", args.join(" "));
    if !output.status.success() {
        return Err(command_failure_message(&label, &output));
    }
    serde_json::from_slice::<Value>(&output.stdout)
        .map_err(|error| format!("Failed to parse {label} JSON: {error}"))
}

fn run_command(mut command: Command, label: &str) -> BootstrapResult<Output> {
    append_bootstrap_log(&format!("starting `{label}`"));
    let output = command
        .output()
        .map_err(|error| format!("Failed to run {label}: {error}"))?;
    log_command_output(label, &output);
    Ok(output)
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
    log_command_output("helm upgrade --install argocd", &output);

    if !output.status.success() {
        return Err(format!(
            "helm upgrade --install argocd failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

fn run_expecting_success(mut command: Command, action: &str) -> BootstrapResult<()> {
    append_bootstrap_log(&format!("starting `{action}`"));
    let output = command
        .output()
        .map_err(|error| format!("{action} failed to run: {error}"))?;
    log_command_output(action, &output);

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
        argo_application_status_summary, argocd_oci_repository_secret_manifest, base64_encode,
        bootstrap_secret_reference, build_bootstrap_cto_config, collect_gitops_repository_files,
        collect_gitops_repository_files_from_template_root, cto_agent_keys_values_patch,
        cto_config_values_patch, embedded_gitops_template_files,
        ensure_bootstrap_gitops_repository, extract_github_user_code,
        extract_github_verification_uri, format_argo_application_status, ghcr_pull_secret_manifest,
        gitops_repository_initialization_required, gitops_repository_owner,
        metrics_server_kind_patch, morgan_cto_config_values_patch,
        normalize_bootstrap_github_credentials, normalize_bootstrap_provider_credentials,
        normalize_bootstrap_scm_secret_manifest, normalize_bootstrap_tool_api_keys,
        parse_cpu_quantity_to_milli, parse_kind_node_container_states, parse_kubelet_summary_usage,
        parse_kubernetes_nodes, parse_kubernetes_pods, parse_memory_quantity_to_bytes,
        parse_runtime_stats_lines, prepare_origin_transfer_inner, terminal_argo_application_error,
        validate_bootstrap_setup, BootstrapAgentKey, BootstrapAiCli, BootstrapAppMode,
        BootstrapGithubCredentials, BootstrapGithubRequest, BootstrapHarnessMode,
        BootstrapHarnessRouting, BootstrapLocalStackRequest, BootstrapModelRoute,
        BootstrapProviderAuth, BootstrapProviderCredentialConfig,
        BootstrapProviderCredentialRequest, BootstrapProviderSelection, BootstrapProvidersRequest,
        BootstrapScmRequest, BootstrapSetupAgent, BootstrapSetupHarness, BootstrapSetupProfile,
        BootstrapSetupSource, BootstrapSourceCredentials, BootstrapSourceProvider,
        BootstrapToolApiKeyRequest, BootstrapToolsRequest, KindNodeContainerState, OriginEngine,
        OriginTransferMode, OriginTransferRequest, BOOTSTRAP_TEST_MODE_ENV, CTO_GITOPS_REPO_NAME,
        GITHUB_TOKEN_SECRET_KEY, GITLAB_TOKEN_SECRET_KEY, METRICS_SERVER_KUBELET_INSECURE_TLS_ARG,
        METRICS_SERVER_KUBELET_PREFERRED_ADDRESS_TYPES_ARG,
    };
    use serde_json::json;
    use std::collections::BTreeMap;
    use std::path::Path;

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
    fn extracts_github_device_uri_from_cli_output() {
        assert_eq!(
            extract_github_verification_uri("Open this URL: https://github.com/login/device."),
            Some("https://github.com/login/device".to_string())
        );
    }

    #[test]
    fn extracts_github_device_code_from_cli_output() {
        assert_eq!(
            extract_github_user_code("First copy your one-time code: 1234-ABCD"),
            Some("1234-ABCD".to_string())
        );
    }

    #[test]
    fn extracts_github_device_prompt_from_real_cli_stderr_shape() {
        let stderr = "\n! First copy your one-time code: ABCD-1234\nOpen this URL to continue in your web browser: https://github.com/login/device\n";
        let mut code = None;
        let mut uri = None;

        for line in stderr.lines() {
            code = code.or_else(|| extract_github_user_code(line));
            uri = uri.or_else(|| extract_github_verification_uri(line));
        }

        assert_eq!(code, Some("ABCD-1234".to_string()));
        assert_eq!(uri, Some("https://github.com/login/device".to_string()));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn copies_github_code_to_macos_clipboard_when_enabled() {
        if std::env::var("CTO_TEST_CLIPBOARD").ok().as_deref() != Some("1") {
            return;
        }

        let previous = super::run_tool("pbpaste", &[])
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .unwrap_or_default();
        let sentinel = format!("CTO-CLIP-{}", std::process::id());
        let copy_result = super::copy_text_to_clipboard(&sentinel);
        let read_result = super::run_tool("pbpaste", &[])
            .map(|output| String::from_utf8_lossy(&output.stdout).to_string());
        let _ = super::copy_text_to_clipboard(&previous);

        copy_result.expect("copy_text_to_clipboard should succeed");
        assert_eq!(read_result.expect("pbpaste should succeed"), sentinel);
    }

    #[test]
    fn argo_application_status_summary_surfaces_comparison_errors() {
        let app = json!({
            "status": {
                "sync": { "status": "Unknown" },
                "health": { "status": "Healthy" },
                "conditions": [{
                    "type": "ComparisonError",
                    "message": "failed to generate manifest: chart not found"
                }]
            }
        });

        let summary = argo_application_status_summary(&app);

        assert_eq!(summary.sync.as_deref(), Some("Unknown"));
        assert_eq!(summary.health.as_deref(), Some("Healthy"));
        assert_eq!(
            terminal_argo_application_error("cto", &summary).as_deref(),
            Some(
                "Argo Application cto failed to reconcile: ComparisonError: failed to generate manifest: chart not found"
            )
        );
    }

    #[test]
    fn argo_application_status_summary_formats_pending_state() {
        let summary = argo_application_status_summary(&json!({
            "status": {
                "sync": { "status": "OutOfSync" },
                "health": { "status": "Progressing" }
            }
        }));

        assert_eq!(
            format_argo_application_status(&summary),
            "sync=OutOfSync, health=Progressing"
        );
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
                scm: None,
                tools: None,
                providers: None,
                agents: None,
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
                scm: None,
                tools: None,
                providers: None,
                agents: None,
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
            scm: None,
            tools: None,
            providers: None,
            agents: None,
            setup: None,
        }))
        .expect_err("multiline token rejected");

        assert!(error.contains("GitHub PAT"));
    }

    fn gitops_test_setup(provider: BootstrapSourceProvider, owner: &str) -> BootstrapSetupProfile {
        BootstrapSetupProfile {
            source: BootstrapSetupSource {
                provider,
                base_url: match provider {
                    BootstrapSourceProvider::GitHub => "https://github.com".to_string(),
                    BootstrapSourceProvider::GitLab => "https://gitlab.com".to_string(),
                },
                owner: owner.to_string(),
                connection_id: owner.to_lowercase().replace('/', "-"),
            },
            harness: BootstrapSetupHarness {
                mode: BootstrapHarnessMode::OpenClaw,
                clis: vec![BootstrapAiCli::OpenClaw],
                providers: vec![BootstrapProviderSelection {
                    id: "anthropic".to_string(),
                    auth: BootstrapProviderAuth::ApiKey,
                    cli_ids: vec![BootstrapAiCli::OpenClaw],
                    model: "claude-sonnet-4".to_string(),
                    models: vec!["claude-sonnet-4".to_string()],
                }],
                routing: None,
            },
            agents: Vec::new(),
        }
    }

    #[test]
    fn requires_gitops_repository_for_github_source_or_bootstrap() {
        let github_setup = gitops_test_setup(BootstrapSourceProvider::GitHub, "5DLabsInc");
        let gitlab_setup = gitops_test_setup(BootstrapSourceProvider::GitLab, "platform/team");
        let github_request = BootstrapGithubRequest {
            enabled: Some(true),
            token: None,
            owner: None,
        };
        let disabled_github_request = BootstrapGithubRequest {
            enabled: Some(false),
            token: None,
            owner: None,
        };
        let credentials = BootstrapGithubCredentials {
            token: Some("github_pat_example".to_string()),
            owner: None,
        };

        assert!(gitops_repository_initialization_required(
            None,
            None,
            Some(&github_setup)
        ));
        assert!(gitops_repository_initialization_required(
            None,
            Some(&github_request),
            Some(&gitlab_setup)
        ));
        assert!(gitops_repository_initialization_required(
            Some(&credentials),
            Some(&disabled_github_request),
            Some(&gitlab_setup)
        ));
        assert!(!gitops_repository_initialization_required(
            None,
            Some(&disabled_github_request),
            Some(&gitlab_setup)
        ));
        assert!(!gitops_repository_initialization_required(None, None, None));
    }

    #[tokio::test]
    async fn github_source_missing_token_fails_gitops_repository_initialization() {
        let setup = gitops_test_setup(BootstrapSourceProvider::GitHub, "5DLabsInc");
        let error = ensure_bootstrap_gitops_repository(None, None, Some(&setup))
            .await
            .expect_err("missing GitHub token should fail");

        assert!(error.contains("GitHub token"));
        assert!(!error.contains("github_pat"));
    }

    #[tokio::test]
    async fn github_source_missing_owner_fails_gitops_repository_initialization() {
        let setup = gitops_test_setup(BootstrapSourceProvider::GitHub, "");
        let credentials = BootstrapGithubCredentials {
            token: Some("github_pat_example".to_string()),
            owner: None,
        };
        let error = ensure_bootstrap_gitops_repository(Some(&credentials), None, Some(&setup))
            .await
            .expect_err("missing GitHub owner should fail");

        assert!(error.contains("GitHub owner/org"));
        assert!(error.contains(CTO_GITOPS_REPO_NAME));
        assert!(!error.contains("github_pat_example"));
    }

    #[tokio::test]
    async fn non_github_without_credentials_skips_gitops_repository_initialization() {
        let setup = gitops_test_setup(BootstrapSourceProvider::GitLab, "platform/team");

        ensure_bootstrap_gitops_repository(None, None, Some(&setup))
            .await
            .expect("non-GitHub source without credentials remains optional");
    }

    #[test]
    fn gitops_repository_owner_prefers_setup_source_owner() {
        let setup = BootstrapSetupProfile {
            source: BootstrapSetupSource {
                provider: BootstrapSourceProvider::GitHub,
                base_url: "https://github.com".to_string(),
                owner: "5DLabsInc".to_string(),
                connection_id: "5dlabsinc".to_string(),
            },
            harness: BootstrapSetupHarness {
                mode: BootstrapHarnessMode::OpenClaw,
                clis: vec![BootstrapAiCli::OpenClaw],
                providers: vec![BootstrapProviderSelection {
                    id: "anthropic".to_string(),
                    auth: BootstrapProviderAuth::ApiKey,
                    cli_ids: vec![BootstrapAiCli::OpenClaw],
                    model: "claude-sonnet-4".to_string(),
                    models: vec!["claude-sonnet-4".to_string()],
                }],
                routing: None,
            },
            agents: Vec::new(),
        };
        let credentials = BootstrapGithubCredentials {
            token: Some("github_pat_example".to_string()),
            owner: Some("simon5dlabs".to_string()),
        };

        assert_eq!(
            gitops_repository_owner(Some(&credentials), Some(&setup)).as_deref(),
            Some("5DLabsInc")
        );
    }

    #[test]
    fn collect_gitops_repository_files_includes_template() {
        let files = collect_gitops_repository_files().expect("gitops files");
        let paths = files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>();

        assert!(paths.contains(&".cto/template.json"));
        assert!(paths.contains(&".github/workflows/cto-update.yml"));
        assert!(paths.contains(&".gitops/apps/README.md"));
        assert!(paths.contains(&".gitops/apps/cto.yaml"));
        assert!(paths.contains(&".gitops/apps/qdrant.yaml"));
        assert!(paths.contains(&".gitops/apps/morgan.yaml"));
        assert!(paths.contains(&".gitops/apps/voice-bridge.yaml"));
        assert!(paths.contains(&".gitops/apps/observability.yaml"));
        assert!(paths.contains(&".gitops/overrides/.gitkeep"));
        assert!(paths.contains(&".gitops/values/.gitkeep"));
        assert!(
            paths.iter().all(|path| !path.contains(".gitops/template")),
            "GitOps repository seed paths should be relative to the template root: {paths:?}"
        );
    }

    #[test]
    fn embedded_gitops_repository_template_matches_source_checkout() {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("repository root");
        let source_files = collect_gitops_repository_files_from_template_root(
            &repo_root.join(".gitops").join("template"),
        )
        .expect("source template files");
        let embedded_files = embedded_gitops_template_files();
        let source_files = source_files
            .iter()
            .map(|file| (file.path.as_str(), file.content.as_str()))
            .collect::<BTreeMap<_, _>>();
        let embedded_files = embedded_files
            .iter()
            .map(|file| (file.path.as_str(), file.content.as_str()))
            .collect::<BTreeMap<_, _>>();

        assert!(embedded_files.contains_key(".cto/template.json"));
        assert!(embedded_files.contains_key(".github/workflows/cto-update.yml"));
        assert!(embedded_files.contains_key(".gitops/apps/cto.yaml"));
        assert!(embedded_files.contains_key(".gitops/apps/qdrant.yaml"));
        assert!(embedded_files.contains_key(".gitops/apps/morgan.yaml"));
        assert!(embedded_files.contains_key(".gitops/apps/voice-bridge.yaml"));
        assert_eq!(source_files, embedded_files);
    }

    #[test]
    fn normalizes_bootstrap_scm_secret_manifest() {
        let manifest = r"
apiVersion: v1
kind: Secret
metadata:
  name: cto-scm-github-acme-dev
  namespace: cto
  labels:
    cto.5dlabs.ai/scm-provider: github
type: Opaque
stringData:
  app-id: |-
    12345
  client-id: |-
    Iv1.example
  client-secret: |-
    secret
  private-key: |-
    pem
";
        let normalized =
            normalize_bootstrap_scm_secret_manifest(Some(&BootstrapLocalStackRequest {
                github: None,
                scm: Some(BootstrapScmRequest {
                    github_app_secret_manifest: Some(manifest.to_string()),
                }),
                tools: None,
                providers: None,
                agents: None,
                setup: None,
            }))
            .expect("manifest")
            .expect("scm manifest");

        assert!(normalized.contains("name: cto-scm-github-acme-dev"));
        assert!(normalized.ends_with('\n'));
    }

    #[test]
    fn rejects_non_github_bootstrap_scm_secret_manifest() {
        let error = normalize_bootstrap_scm_secret_manifest(Some(&BootstrapLocalStackRequest {
            github: None,
            scm: Some(BootstrapScmRequest {
                github_app_secret_manifest: Some(
                    "apiVersion: v1\nkind: Secret\nmetadata:\n  namespace: cto\n".to_string(),
                ),
            }),
            tools: None,
            providers: None,
            agents: None,
            setup: None,
        }))
        .expect_err("invalid manifest rejected");

        assert!(error.contains("cto.5dlabs.ai/scm-provider: github"));
    }

    #[test]
    fn normalizes_bootstrap_tool_api_keys() {
        let keys = normalize_bootstrap_tool_api_keys(Some(&BootstrapLocalStackRequest {
            github: None,
            scm: None,
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
            providers: None,
            agents: None,
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
            scm: None,
            tools: Some(BootstrapToolsRequest {
                api_keys: vec![BootstrapToolApiKeyRequest {
                    name: "UNKNOWN_API_KEY".to_string(),
                    value: "secret".to_string(),
                }],
            }),
            providers: None,
            agents: None,
            setup: None,
        }))
        .expect_err("unknown key rejected");

        assert!(error.contains("unsupported tool API key"));
    }

    #[test]
    fn normalizes_bootstrap_provider_credentials() {
        let credentials =
            normalize_bootstrap_provider_credentials(Some(&BootstrapLocalStackRequest {
                github: None,
                scm: None,
                tools: None,
                providers: Some(BootstrapProvidersRequest {
                    credentials: vec![
                        BootstrapProviderCredentialRequest {
                            provider_id: "openrouter".to_string(),
                            auth: BootstrapProviderAuth::ApiKey,
                            secret_key: Some("OPENROUTER_API_KEY".to_string()),
                            value: Some("  sk-or-example  ".to_string()),
                            api_key_secret_key: None,
                            api_key: None,
                        },
                        BootstrapProviderCredentialRequest {
                            provider_id: "litellm".to_string(),
                            auth: BootstrapProviderAuth::Gateway,
                            secret_key: None,
                            value: Some("https://litellm.example.com".to_string()),
                            api_key_secret_key: Some("LITELLM_API_KEY".to_string()),
                            api_key: Some("  litellm-secret  ".to_string()),
                        },
                    ],
                }),
                agents: None,
                setup: None,
            }))
            .expect("provider credentials");

        assert_eq!(
            credentials.agent_keys,
            vec![
                BootstrapAgentKey {
                    name: "LITELLM_API_KEY".to_string(),
                    value: "litellm-secret".to_string(),
                },
                BootstrapAgentKey {
                    name: "OPENROUTER_API_KEY".to_string(),
                    value: "sk-or-example".to_string(),
                },
            ]
        );
        assert_eq!(
            credentials.config["openrouter"]
                .secret_ref
                .as_ref()
                .map(|secret| secret.key.as_str()),
            Some("OPENROUTER_API_KEY")
        );
        assert_eq!(
            credentials.config["litellm"].value.as_deref(),
            Some("https://litellm.example.com")
        );
        assert_eq!(
            credentials.config["litellm"]
                .api_key_secret_ref
                .as_ref()
                .map(|secret| secret.key.as_str()),
            Some("LITELLM_API_KEY")
        );
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
                    cli_ids: vec![BootstrapAiCli::ClaudeCode],
                    model: "Sonnet 4.6".to_string(),
                    models: vec!["Sonnet 4.6".to_string(), "Haiku 4.5".to_string()],
                }],
                routing: Some(BootstrapHarnessRouting {
                    primary: BootstrapModelRoute {
                        provider_id: "anthropic".to_string(),
                        model: "Sonnet 4.6".to_string(),
                    },
                    fallbacks: vec![
                        BootstrapModelRoute {
                            provider_id: "anthropic".to_string(),
                            model: "Sonnet 4.6".to_string(),
                        },
                        BootstrapModelRoute {
                            provider_id: "anthropic".to_string(),
                            model: "Haiku 4.5".to_string(),
                        },
                    ],
                }),
            },
            agents: Vec::new(),
        };

        validate_bootstrap_setup(&setup).expect("valid setup");
    }

    #[test]
    fn validates_bootstrap_setup_without_source_owner() {
        let setup = BootstrapSetupProfile {
            source: BootstrapSetupSource {
                provider: BootstrapSourceProvider::GitHub,
                base_url: "https://github.com".to_string(),
                owner: String::new(),
                connection_id: "github".to_string(),
            },
            harness: BootstrapSetupHarness {
                mode: BootstrapHarnessMode::OpenClaw,
                clis: vec![BootstrapAiCli::Codex],
                providers: vec![BootstrapProviderSelection {
                    id: "openai".to_string(),
                    auth: BootstrapProviderAuth::OAuth,
                    cli_ids: vec![BootstrapAiCli::Codex],
                    model: "GPT-5.4".to_string(),
                    models: vec!["GPT-5.4".to_string()],
                }],
                routing: Some(BootstrapHarnessRouting {
                    primary: BootstrapModelRoute {
                        provider_id: "openai".to_string(),
                        model: "GPT-5.4".to_string(),
                    },
                    fallbacks: vec![BootstrapModelRoute {
                        provider_id: "openai".to_string(),
                        model: "GPT-5.4".to_string(),
                    }],
                }),
            },
            agents: Vec::new(),
        };

        validate_bootstrap_setup(&setup).expect("source owner is optional");
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
                    cli_ids: Vec::new(),
                    model: "Auto".to_string(),
                    models: vec!["Auto".to_string()],
                }],
                routing: None,
            },
            agents: Vec::new(),
        };

        let error = validate_bootstrap_setup(&setup).expect_err("missing CLI rejected");
        assert!(error.contains("at least one selected CLI"));
    }

    #[test]
    fn rejects_setup_with_unselected_primary_harness_model() {
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
                    cli_ids: vec![BootstrapAiCli::ClaudeCode],
                    model: "Sonnet 4.6".to_string(),
                    models: vec!["Sonnet 4.6".to_string()],
                }],
                routing: Some(BootstrapHarnessRouting {
                    primary: BootstrapModelRoute {
                        provider_id: "openai".to_string(),
                        model: "gpt-5.5".to_string(),
                    },
                    fallbacks: vec![BootstrapModelRoute {
                        provider_id: "anthropic".to_string(),
                        model: "Sonnet 4.6".to_string(),
                    }],
                }),
            },
            agents: Vec::new(),
        };

        let error = validate_bootstrap_setup(&setup).expect_err("invalid primary rejected");
        assert!(error.contains("primary harness model"));
    }

    #[test]
    fn rejects_setup_with_unselected_fallback_harness_model() {
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
                    cli_ids: vec![BootstrapAiCli::ClaudeCode],
                    model: "Sonnet 4.6".to_string(),
                    models: vec!["Sonnet 4.6".to_string()],
                }],
                routing: Some(BootstrapHarnessRouting {
                    primary: BootstrapModelRoute {
                        provider_id: "anthropic".to_string(),
                        model: "Sonnet 4.6".to_string(),
                    },
                    fallbacks: vec![BootstrapModelRoute {
                        provider_id: "anthropic".to_string(),
                        model: "Haiku 4.5".to_string(),
                    }],
                }),
            },
            agents: Vec::new(),
        };

        let error = validate_bootstrap_setup(&setup).expect_err("invalid fallback rejected");
        assert!(error.contains("fallback harness model"));
    }

    #[test]
    fn renders_bootstrap_github_secret_manifest() {
        let manifest = agent_keys_secret_manifest(&[BootstrapAgentKey {
            name: GITHUB_TOKEN_SECRET_KEY.to_string(),
            value: "github_pat_example".to_string(),
        }])
        .expect("manifest");

        assert!(manifest.contains("name: cto-agent-keys"));
        assert!(manifest.contains("namespace: cto"));
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
                name: GITLAB_TOKEN_SECRET_KEY.to_string(),
                value: "glpat_example".to_string(),
            },
            BootstrapAgentKey {
                name: "FIRECRAWL_API_KEY".to_string(),
                value: "fc_example".to_string(),
            },
        ])
        .expect("manifest");

        assert!(manifest.contains("GITHUB_TOKEN: \"github_pat_example\""));
        assert!(manifest.contains("GITLAB_TOKEN: \"glpat_example\""));
        assert!(manifest.contains("FIRECRAWL_API_KEY: \"fc_example\""));
    }

    #[test]
    fn builds_agent_keys_for_github_and_gitlab_source_tokens() {
        let source_credentials = BootstrapSourceCredentials {
            github: Some(BootstrapGithubCredentials {
                token: Some("github_pat_example".to_string()),
                owner: Some("5dlabs".to_string()),
            }),
            gitlab_token: Some("glpat_example".to_string()),
        };
        let keys = super::bootstrap_agent_keys(&source_credentials, &[], &[]).expect("agent keys");
        let by_name = keys
            .into_iter()
            .map(|key| (key.name, key.value))
            .collect::<BTreeMap<_, _>>();

        assert_eq!(
            by_name.get(GITHUB_TOKEN_SECRET_KEY).map(String::as_str),
            Some("github_pat_example")
        );
        assert_eq!(
            by_name.get(GITLAB_TOKEN_SECRET_KEY).map(String::as_str),
            Some("glpat_example")
        );
    }

    #[test]
    fn renders_argocd_oci_repository_secret_manifest() {
        let manifest = argocd_oci_repository_secret_manifest("kaseonedge", "github_pat_example")
            .expect("manifest");

        assert!(manifest.contains("name: ghcr-helm-charts-repository"));
        assert!(manifest.contains("namespace: argocd"));
        assert!(manifest.contains("argocd.argoproj.io/secret-type: repository"));
        assert!(manifest.contains("type: helm"));
        assert!(manifest.contains("url: ghcr.io/5dlabs/helm-charts"));
        assert!(manifest.contains("enableOCI: \"true\""));
        assert!(manifest.contains("username: \"kaseonedge\""));
        assert!(manifest.contains("password: \"github_pat_example\""));
    }

    #[test]
    fn renders_ghcr_pull_secret_manifest() {
        let manifest =
            ghcr_pull_secret_manifest("kaseonedge", "github_pat_example").expect("manifest");

        assert!(manifest.contains("name: ghcr-pull-secret"));
        assert!(manifest.contains("namespace: cto"));
        assert!(manifest.contains("type: kubernetes.io/dockerconfigjson"));
        assert!(manifest.contains("\"ghcr.io\""));
        assert!(manifest.contains("\"username\":\"kaseonedge\""));
        assert!(manifest.contains("\"password\":\"github_pat_example\""));
        assert!(manifest.contains("\"auth\":\"a2FzZW9uZWRnZTpnaXRodWJfcGF0X2V4YW1wbGU=\""));
    }

    #[test]
    fn encodes_base64_with_padding() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"user:token"), "dXNlcjp0b2tlbg==");
        assert_eq!(base64_encode(b"ab"), "YWI=");
        assert_eq!(base64_encode(b"abc"), "YWJj");
    }

    #[test]
    fn renders_cto_agent_keys_values_patch() {
        let patch = cto_agent_keys_values_patch(&[
            BootstrapAgentKey {
                name: "EXA_API_KEY".to_string(),
                value: "exa_example".to_string(),
            },
            BootstrapAgentKey {
                name: "TAVILY_API_KEY".to_string(),
                value: "tvly_example".to_string(),
            },
        ]);
        let patch = serde_json::from_str::<serde_json::Value>(&patch).expect("patch json");

        let agent_keys = &patch["spec"]["source"]["helm"]["valuesObject"]["agentKeys"];
        assert_eq!(agent_keys["EXA_API_KEY"], "exa_example");
        assert_eq!(agent_keys["TAVILY_API_KEY"], "tvly_example");
    }

    #[test]
    fn renders_cto_config_values_patch() {
        let setup = BootstrapSetupProfile {
            source: BootstrapSetupSource {
                provider: BootstrapSourceProvider::GitHub,
                base_url: "https://github.com".to_string(),
                owner: "acme-dev".to_string(),
                connection_id: "acme-dev".to_string(),
            },
            harness: BootstrapSetupHarness {
                mode: BootstrapHarnessMode::OpenClaw,
                clis: vec![BootstrapAiCli::ClaudeCode, BootstrapAiCli::Codex],
                providers: vec![BootstrapProviderSelection {
                    id: "openai".to_string(),
                    auth: BootstrapProviderAuth::ApiKey,
                    cli_ids: vec![BootstrapAiCli::Codex],
                    model: "gpt-5.5".to_string(),
                    models: vec!["gpt-5.5".to_string(), "gpt-5.4".to_string()],
                }],
                routing: Some(BootstrapHarnessRouting {
                    primary: BootstrapModelRoute {
                        provider_id: "openai".to_string(),
                        model: "gpt-5.5".to_string(),
                    },
                    fallbacks: vec![BootstrapModelRoute {
                        provider_id: "openai".to_string(),
                        model: "gpt-5.4".to_string(),
                    }],
                }),
            },
            agents: Vec::new(),
        };
        let mut credentials = BTreeMap::new();
        credentials.insert(
            "openai".to_string(),
            BootstrapProviderCredentialConfig {
                value: None,
                secret_ref: Some(bootstrap_secret_reference("OPENAI_API_KEY".to_string())),
                api_key_secret_ref: None,
            },
        );

        let config = build_bootstrap_cto_config(Some(&setup), &credentials)
            .expect("config")
            .expect("config present");
        let patch = serde_json::from_str::<serde_json::Value>(&cto_config_values_patch(&config))
            .expect("patch json");
        let cto_config = &patch["spec"]["source"]["helm"]["valuesObject"]["ctoConfig"];

        assert_eq!(cto_config["harness"]["default"], "openclaw");
        assert!(cto_config["clis"]["claudeCode"]["providers"]
            .as_object()
            .expect("claude providers")
            .is_empty());
        assert_eq!(
            cto_config["clis"]["codex"]["providers"]["openai"]["models"][1],
            "gpt-5.4"
        );
        assert_eq!(
            cto_config["clis"]["codex"]["providers"]["openai"]["credential"]["secretRef"]["key"],
            "OPENAI_API_KEY"
        );
    }

    #[test]
    fn renders_morgan_cto_config_workspace_patch() {
        let setup = BootstrapSetupProfile {
            source: BootstrapSetupSource {
                provider: BootstrapSourceProvider::GitHub,
                base_url: "https://github.com".to_string(),
                owner: "acme-dev".to_string(),
                connection_id: "acme-dev".to_string(),
            },
            harness: BootstrapSetupHarness {
                mode: BootstrapHarnessMode::Hermes,
                clis: vec![BootstrapAiCli::ClaudeCode],
                providers: vec![BootstrapProviderSelection {
                    id: "anthropic".to_string(),
                    auth: BootstrapProviderAuth::OAuth,
                    cli_ids: vec![BootstrapAiCli::ClaudeCode],
                    model: "claude-sonnet-4.6".to_string(),
                    models: vec!["claude-sonnet-4.6".to_string()],
                }],
                routing: Some(BootstrapHarnessRouting {
                    primary: BootstrapModelRoute {
                        provider_id: "anthropic".to_string(),
                        model: "claude-sonnet-4.6".to_string(),
                    },
                    fallbacks: vec![BootstrapModelRoute {
                        provider_id: "anthropic".to_string(),
                        model: "claude-sonnet-4.6".to_string(),
                    }],
                }),
            },
            agents: vec![BootstrapSetupAgent {
                id: "morgan".to_string(),
                enabled: true,
            }],
        };
        let config = build_bootstrap_cto_config(Some(&setup), &BTreeMap::new())
            .expect("config")
            .expect("config present");
        let patch = serde_json::from_str::<serde_json::Value>(
            &morgan_cto_config_values_patch(&config).expect("patch"),
        )
        .expect("patch json");

        let values = &patch["spec"]["source"]["helm"]["valuesObject"];
        assert_eq!(values["extraEnv"][0]["name"], "CTO_CONFIG_PATH");
        assert_eq!(values["extraEnv"][0]["value"], "/workspace/cto-config.json");

        let config_file = values["workspace"]["files"]["cto-config.json"]
            .as_str()
            .expect("config file");
        let config_file =
            serde_json::from_str::<serde_json::Value>(config_file).expect("config json");
        assert_eq!(config_file["harness"]["default"], "hermes");
        assert_eq!(
            config_file["harness"]["routing"]["primary"]["model"],
            "claude-sonnet-4.6"
        );
        assert_eq!(
            config_file["clis"]["claudeCode"]["providers"]["anthropic"]["defaultModel"],
            "claude-sonnet-4.6"
        );
    }

    #[test]
    fn origin_transfer_defaults_to_mirror_and_redacts_manifest() {
        let plan = prepare_origin_transfer_inner(&OriginTransferRequest {
            engine: OriginEngine::Standard,
            source_provider: "github".to_string(),
            source_connection_id: "acme-dev".to_string(),
            repositories: vec!["acme/repo".to_string()],
            mode: None,
        })
        .expect("origin plan");
        assert_eq!(plan.mode, OriginTransferMode::Mirror);
        assert_eq!(plan.app_name, "origin-standard");
        assert_eq!(plan.redaction, "[REDACTED]");
        assert!(!plan.manifest_preview.contains("token:"));
    }

    #[test]
    fn origin_transfer_rejects_missing_hosted_source() {
        let err = prepare_origin_transfer_inner(&OriginTransferRequest {
            engine: OriginEngine::GitlabCompatible,
            source_provider: "origin".to_string(),
            source_connection_id: "acme-dev".to_string(),
            repositories: Vec::new(),
            mode: Some(OriginTransferMode::Migrate),
        })
        .expect_err("hosted source required");
        assert!(err.contains("GitHub or GitLab"));
    }
}
