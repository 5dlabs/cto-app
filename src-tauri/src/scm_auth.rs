use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

type ScmResult<T> = Result<T, String>;

const CONNECTION_ID_MAX_LEN: usize = 48;
const LOCAL_CALLBACK_BASE_URL: &str = "http://localhost:8080";
const DEFAULT_SCM_SECRET_NAMESPACE: &str = "bots";
const GITHUB_API_VERSION: &str = "2022-11-28";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ScmProvider {
    #[serde(rename = "github")]
    GitHub,
    #[serde(rename = "gitlab")]
    GitLab,
}

impl ScmProvider {
    const fn slug(self) -> &'static str {
        match self {
            Self::GitHub => "github",
            Self::GitLab => "gitlab",
        }
    }

    const fn default_base_url(self) -> &'static str {
        match self {
            Self::GitHub => "https://github.com",
            Self::GitLab => "https://gitlab.com",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ScmAuthStrategy {
    #[serde(rename = "github-app-manifest")]
    GitHubAppManifest,
    #[serde(rename = "gitlab-instance-oauth-app")]
    GitLabInstanceOAuthApp,
    #[serde(rename = "manual-token")]
    ManualToken,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ScmConnectionStatus {
    #[serde(rename = "draft")]
    Draft,
    #[serde(rename = "pending-install")]
    PendingInstall,
    #[serde(rename = "manual-token-required")]
    ManualTokenRequired,
    #[serde(rename = "ready")]
    Ready,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub enum RepositorySelection {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "selected")]
    #[default]
    Selected,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScmConnection {
    pub provider: ScmProvider,
    pub connection_id: String,
    pub display_name: String,
    pub owner: String,
    pub base_url: String,
    pub secret_name: String,
    pub secret_keys: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_app_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_app_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_app_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credentials_updated_at: Option<String>,
    pub auth_strategy: ScmAuthStrategy,
    pub callback_url: String,
    pub webhook_url: Option<String>,
    pub webhook_enabled: bool,
    pub status: ScmConnectionStatus,
    pub installation_ids: Vec<u64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScmProvisioningRequest {
    pub provider: ScmProvider,
    pub connection_id: String,
    pub display_name: Option<String>,
    pub owner: String,
    pub base_url: Option<String>,
    pub callback_base_url: Option<String>,
    pub repository_selection: Option<RepositorySelection>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScmSetupUrl {
    pub label: String,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScmProvisioningPlan {
    pub connection: ScmConnection,
    pub setup_urls: Vec<ScmSetupUrl>,
    pub github_manifest: Option<Value>,
    pub gitlab_application_api_endpoint: Option<String>,
    pub kubernetes_secret_name: String,
    pub kubernetes_secret_keys: Vec<String>,
    pub local_callback_url: String,
    pub webhook_behavior: String,
    pub steps: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubManifestExchangeRequest {
    pub connection: ScmConnection,
    pub code: String,
    pub secret_namespace: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubManifestExchangeResult {
    pub connection: ScmConnection,
    pub app_id: u64,
    pub app_slug: Option<String>,
    pub app_url: Option<String>,
    pub kubernetes_secret_name: String,
    pub kubernetes_secret_namespace: String,
    pub kubernetes_secret_manifest: String,
    pub credential_keys: Vec<String>,
    pub next_steps: Vec<String>,
    pub local_metadata_saved: bool,
    pub local_metadata_error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubManifestConversion {
    id: u64,
    slug: Option<String>,
    html_url: Option<String>,
    client_id: String,
    client_secret: String,
    webhook_secret: String,
    pem: String,
}

struct ScmPlanBase {
    connection_id: String,
    display_name: String,
    owner: String,
    base_url: String,
    local_callback_url: String,
    webhook_url: Option<String>,
    webhook_behavior: String,
    now: String,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScmConnectionStore {
    connections: Vec<ScmConnection>,
}

#[tauri::command]
pub fn list_scm_connections(app: AppHandle) -> ScmResult<Vec<ScmConnection>> {
    let app = app;
    Ok(read_store(&app)?.connections)
}

#[tauri::command]
pub fn prepare_scm_provisioning(request: ScmProvisioningRequest) -> ScmResult<ScmProvisioningPlan> {
    build_provisioning_plan(request)
}

#[tauri::command]
pub fn save_scm_connection(
    app: AppHandle,
    connection: ScmConnection,
) -> ScmResult<Vec<ScmConnection>> {
    let app = app;
    upsert_connection(&app, connection)
}

#[tauri::command]
pub async fn exchange_github_manifest_code(
    app: AppHandle,
    request: GitHubManifestExchangeRequest,
) -> ScmResult<GitHubManifestExchangeResult> {
    validate_github_manifest_exchange_connection(&request.connection)?;
    let conversion =
        exchange_github_manifest_code_http(&request.connection.base_url, &request.code).await?;
    let mut result = build_github_manifest_exchange_result(
        request.connection,
        conversion,
        request.secret_namespace.as_deref(),
    )?;
    match upsert_connection(&app, result.connection.clone()) {
        Ok(_) => {
            result.local_metadata_saved = true;
            result.local_metadata_error = None;
        }
        Err(error) => {
            result.local_metadata_saved = false;
            result.local_metadata_error = Some(error);
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_scm_connection(
    app: AppHandle,
    provider: ScmProvider,
    connection_id: String,
) -> ScmResult<Vec<ScmConnection>> {
    let app = app;
    validate_connection_id(&connection_id)?;

    let mut store = read_store(&app)?;
    store.connections.retain(move |connection| {
        !(connection.provider == provider && connection.connection_id == connection_id)
    });
    write_store(&app, &store)?;
    Ok(store.connections)
}

fn build_provisioning_plan(request: ScmProvisioningRequest) -> ScmResult<ScmProvisioningPlan> {
    let ScmProvisioningRequest {
        provider,
        connection_id,
        display_name,
        owner,
        base_url,
        callback_base_url,
        repository_selection,
    } = request;

    let connection_id = connection_id.trim().to_string();
    validate_connection_id(&connection_id)?;

    let owner = owner.trim().to_string();
    if owner.is_empty() {
        return Err("owner is required".to_string());
    }

    let base_url = normalize_url(
        base_url
            .as_deref()
            .unwrap_or_else(|| provider.default_base_url()),
    )?;
    let callback_base_url = normalize_url(
        callback_base_url
            .as_deref()
            .unwrap_or(LOCAL_CALLBACK_BASE_URL),
    )?;
    let local_callback_url = format!(
        "{}/morgan/source-control/{}/callback",
        callback_base_url,
        provider.slug()
    );
    let public_callback = !is_local_url(&callback_base_url)?;
    let webhook_url = public_callback.then(|| {
        format!(
            "{}/morgan/source-control/{}/webhook",
            callback_base_url,
            provider.slug()
        )
    });
    let webhook_behavior = if public_callback {
        "Webhook URL is derived from the callback base, but webhooks remain \
         disabled until the user explicitly enables them."
            .to_string()
    } else {
        "Local desktop provisioning keeps provider webhooks disabled; configure \
         a tunnel or hosted URL before enabling webhook delivery."
            .to_string()
    };
    let now = now_stamp();
    let display_name = display_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&owner)
        .to_string();

    let plan_base = ScmPlanBase {
        connection_id,
        display_name,
        owner,
        base_url,
        local_callback_url,
        webhook_url,
        webhook_behavior,
        now,
    };

    Ok(match provider {
        ScmProvider::GitHub => github_plan(plan_base, repository_selection.unwrap_or_default()),
        ScmProvider::GitLab => gitlab_plan(plan_base),
    })
}

fn github_plan(
    plan_base: ScmPlanBase,
    repository_selection: RepositorySelection,
) -> ScmProvisioningPlan {
    let ScmPlanBase {
        connection_id,
        display_name,
        owner,
        base_url,
        local_callback_url,
        webhook_url,
        webhook_behavior,
        now,
    } = plan_base;
    let secret_name = secret_name(ScmProvider::GitHub, &connection_id);
    let secret_keys = github_secret_keys();
    let app_name = format!("CTO {display_name} {connection_id}");
    let setup_urls = github_setup_urls(&base_url, &owner);
    let repository_selection_label = match repository_selection {
        RepositorySelection::All => "all",
        RepositorySelection::Selected => "selected",
    };
    let callback_urls = vec![local_callback_url.clone()];
    let github_manifest = json!({
        "name": app_name,
        "url": "http://localhost:8080/morgan",
        "redirect_url": local_callback_url,
        "callback_urls": callback_urls,
        "hook_attributes": {
            "active": false
        },
        "public": false,
        "request_oauth_on_install": false,
        "default_permissions": {
            "actions": "read",
            "checks": "read",
            "contents": "write",
            "issues": "write",
            "metadata": "read",
            "pull_requests": "write"
        },
        "default_events": [],
        "repository_selection": repository_selection_label
    });

    let connection = ScmConnection {
        provider: ScmProvider::GitHub,
        connection_id,
        display_name,
        owner,
        base_url,
        secret_name: secret_name.clone(),
        secret_keys: secret_keys.clone(),
        provider_app_id: None,
        provider_app_slug: None,
        provider_app_url: None,
        credentials_updated_at: None,
        auth_strategy: ScmAuthStrategy::GitHubAppManifest,
        callback_url: github_manifest["redirect_url"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        webhook_url,
        webhook_enabled: false,
        status: ScmConnectionStatus::PendingInstall,
        installation_ids: Vec::new(),
        created_at: now.clone(),
        updated_at: now,
    };

    ScmProvisioningPlan {
        kubernetes_secret_name: secret_name,
        kubernetes_secret_keys: secret_keys,
        local_callback_url: connection.callback_url.clone(),
        webhook_behavior,
        connection,
        setup_urls,
        github_manifest: Some(github_manifest),
        gitlab_application_api_endpoint: None,
        steps: github_steps(),
        warnings: github_warnings(),
    }
}

fn github_secret_keys() -> Vec<String> {
    strings(&[
        "app-id",
        "client-id",
        "client-secret",
        "private-key",
        "webhook-secret",
        "installation-ids",
    ])
}

fn github_setup_urls(base_url: &str, owner: &str) -> Vec<ScmSetupUrl> {
    vec![
        ScmSetupUrl {
            label: "User-owned app".to_string(),
            url: format!("{base_url}/settings/apps/new"),
        },
        ScmSetupUrl {
            label: format!("Org-owned app ({owner})"),
            url: format!("{base_url}/organizations/{owner}/settings/apps/new"),
        },
    ]
}

fn github_steps() -> Vec<String> {
    strings(&[
        "Copy the generated manifest JSON and create the GitHub App from \
         the matching user/org setup URL.",
        "Install the private app only on the repositories this CTO tenant should manage.",
        "After GitHub redirects back with a manifest code, exchange it \
         locally and store only this tenant's app credentials in the \
         generated Kubernetes Secret.",
    ])
}

fn github_warnings() -> Vec<String> {
    strings(&[
        "No shared 5dlabs GitHub App or PAT is used by this plan.",
        "Provider webhooks are disabled by default for localhost callbacks.",
    ])
}

fn gitlab_plan(plan_base: ScmPlanBase) -> ScmProvisioningPlan {
    let ScmPlanBase {
        connection_id,
        display_name,
        owner,
        base_url,
        local_callback_url,
        webhook_url,
        webhook_behavior,
        now,
    } = plan_base;
    let is_gitlab_dot_com = Url::parse(&base_url)
        .ok()
        .and_then(|url| {
            url.host_str()
                .map(|host| host.eq_ignore_ascii_case("gitlab.com"))
        })
        .unwrap_or(false);
    let auth_strategy = if is_gitlab_dot_com {
        ScmAuthStrategy::ManualToken
    } else {
        ScmAuthStrategy::GitLabInstanceOAuthApp
    };
    let status = if is_gitlab_dot_com {
        ScmConnectionStatus::ManualTokenRequired
    } else {
        ScmConnectionStatus::PendingInstall
    };
    let secret_name = secret_name(ScmProvider::GitLab, &connection_id);
    let secret_keys = gitlab_secret_keys(is_gitlab_dot_com);
    let api_endpoint = (!is_gitlab_dot_com).then(|| format!("{base_url}/api/v4/applications"));
    let setup_urls = gitlab_setup_urls(&base_url);
    let connection = ScmConnection {
        provider: ScmProvider::GitLab,
        connection_id,
        display_name,
        owner,
        base_url,
        secret_name: secret_name.clone(),
        secret_keys: secret_keys.clone(),
        provider_app_id: None,
        provider_app_slug: None,
        provider_app_url: None,
        credentials_updated_at: None,
        auth_strategy,
        callback_url: local_callback_url.clone(),
        webhook_url,
        webhook_enabled: false,
        status,
        installation_ids: Vec::new(),
        created_at: now.clone(),
        updated_at: now,
    };

    ScmProvisioningPlan {
        kubernetes_secret_name: secret_name,
        kubernetes_secret_keys: secret_keys,
        local_callback_url,
        webhook_behavior,
        connection,
        setup_urls,
        github_manifest: None,
        gitlab_application_api_endpoint: api_endpoint,
        steps: gitlab_steps(is_gitlab_dot_com),
        warnings: gitlab_warnings(is_gitlab_dot_com),
    }
}

fn gitlab_secret_keys(is_gitlab_dot_com: bool) -> Vec<String> {
    if is_gitlab_dot_com {
        strings(&["token"])
    } else {
        strings(&[
            "application-id",
            "application-secret",
            "redirect-uri",
            "access-token",
            "refresh-token",
        ])
    }
}

fn gitlab_setup_urls(base_url: &str) -> Vec<ScmSetupUrl> {
    vec![ScmSetupUrl {
        label: "GitLab applications".to_string(),
        url: format!("{base_url}/admin/applications"),
    }]
}

fn gitlab_steps(is_gitlab_dot_com: bool) -> Vec<String> {
    let mut steps = if is_gitlab_dot_com {
        strings(&[
            "Create a project or group access token in GitLab.com for the \
             selected repositories/groups.",
            "Store the token in the generated tenant-owned Kubernetes Secret.",
        ])
    } else {
        strings(&[
            "If the authenticated user is an administrator, create the instance \
             OAuth application via /api/v4/applications.",
            "Otherwise create the GitLab application manually in Admin > Applications.",
            "Prefer project/group access tokens for unattended agents that only \
             need selected repository access.",
        ])
    };
    steps.push("Do not reuse 5dlabs global app credentials for this connection.".to_string());
    steps
}

fn gitlab_warnings(is_gitlab_dot_com: bool) -> Vec<String> {
    let mut warnings =
        strings(&["Provider webhooks are disabled by default for localhost callbacks."]);
    if is_gitlab_dot_com {
        warnings.push(
            "GitLab.com does not allow CTO to create an instance OAuth app; \
             manual token provisioning is expected."
                .to_string(),
        );
    }
    warnings
}

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().copied().map(str::to_string).collect()
}

fn validate_connection(connection: &ScmConnection) -> ScmResult<()> {
    validate_connection_id(&connection.connection_id)?;
    let expected_secret_name = secret_name(connection.provider, &connection.connection_id);
    if connection.secret_name != expected_secret_name {
        return Err(format!(
            "secretName must be tenant-owned and equal to {expected_secret_name}"
        ));
    }
    if connection.webhook_enabled && connection.webhook_url.is_none() {
        return Err("webhookEnabled requires a webhookUrl".to_string());
    }
    Ok(())
}

fn upsert_connection(app: &AppHandle, connection: ScmConnection) -> ScmResult<Vec<ScmConnection>> {
    validate_connection(&connection)?;

    let mut store = read_store(app)?;
    let now = now_stamp();
    let mut next = connection;
    next.updated_at.clone_from(&now);

    if let Some(existing) = store.connections.iter_mut().find(|candidate| {
        candidate.provider == next.provider && candidate.connection_id == next.connection_id
    }) {
        next.created_at.clone_from(&existing.created_at);
        *existing = next;
    } else {
        if next.created_at.trim().is_empty() {
            next.created_at = now;
        }
        store.connections.push(next);
    }

    store.connections.sort_by(|a, b| {
        a.provider
            .slug()
            .cmp(b.provider.slug())
            .then(a.connection_id.cmp(&b.connection_id))
    });
    write_store(app, &store)?;
    Ok(store.connections)
}

async fn exchange_github_manifest_code_http(
    base_url: &str,
    code: &str,
) -> ScmResult<GitHubManifestConversion> {
    let url = github_manifest_conversion_url(base_url, code)?;
    let response = Client::new()
        .post(url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "cto-app")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .send()
        .await
        .map_err(|error| format!("GitHub manifest exchange request failed: {error}"))?;

    let status = response.status();
    let body = response
        .bytes()
        .await
        .map_err(|error| format!("failed to read GitHub manifest exchange response: {error}"))?;

    if !status.is_success() {
        return Err(format_github_manifest_exchange_error(status, &body));
    }

    parse_github_manifest_conversion(&body)
}

fn build_github_manifest_exchange_result(
    mut connection: ScmConnection,
    conversion: GitHubManifestConversion,
    secret_namespace: Option<&str>,
) -> ScmResult<GitHubManifestExchangeResult> {
    validate_github_manifest_exchange_connection(&connection)?;

    let namespace = normalize_secret_namespace(secret_namespace)?;
    let credential_data = github_manifest_secret_data(&conversion);
    let credential_keys = connection.secret_keys.clone();
    let secret_manifest = render_kubernetes_secret_manifest(
        ScmProvider::GitHub,
        &connection.connection_id,
        &connection.secret_name,
        &namespace,
        &credential_data,
    );
    let now = now_stamp();

    connection.provider_app_id = Some(conversion.id.to_string());
    connection.provider_app_slug.clone_from(&conversion.slug);
    connection.provider_app_url.clone_from(&conversion.html_url);
    connection.credentials_updated_at = Some(now.clone());
    connection.status = ScmConnectionStatus::PendingInstall;
    connection.updated_at = now;

    Ok(GitHubManifestExchangeResult {
        app_id: conversion.id,
        app_slug: conversion.slug,
        app_url: conversion.html_url,
        kubernetes_secret_name: connection.secret_name.clone(),
        kubernetes_secret_namespace: namespace,
        kubernetes_secret_manifest: secret_manifest,
        credential_keys,
        next_steps: strings(&[
            "Apply the generated Secret manifest to the local CTO cluster.",
            "Install the GitHub App on selected repositories.",
            "Run installation discovery once available to populate installation-ids.",
        ]),
        local_metadata_saved: false,
        local_metadata_error: None,
        connection,
    })
}

fn validate_github_manifest_exchange_connection(connection: &ScmConnection) -> ScmResult<()> {
    if connection.provider != ScmProvider::GitHub {
        return Err("GitHub manifest exchange requires a GitHub connection".to_string());
    }
    if connection.auth_strategy != ScmAuthStrategy::GitHubAppManifest {
        return Err(
            "GitHub manifest exchange requires a github-app-manifest connection".to_string(),
        );
    }
    validate_connection(connection)
}

fn github_manifest_secret_data(conversion: &GitHubManifestConversion) -> BTreeMap<String, String> {
    BTreeMap::from([
        ("app-id".to_string(), conversion.id.to_string()),
        ("client-id".to_string(), conversion.client_id.clone()),
        (
            "client-secret".to_string(),
            conversion.client_secret.clone(),
        ),
        ("installation-ids".to_string(), String::new()),
        ("private-key".to_string(), conversion.pem.clone()),
        (
            "webhook-secret".to_string(),
            conversion.webhook_secret.clone(),
        ),
    ])
}

fn render_kubernetes_secret_manifest(
    provider: ScmProvider,
    connection_id: &str,
    secret_name: &str,
    namespace: &str,
    data: &BTreeMap<String, String>,
) -> String {
    let mut manifest = format!(
        "apiVersion: v1\nkind: Secret\nmetadata:\n  name: {secret_name}\n  namespace: \
         {namespace}\n  labels:\n    app.kubernetes.io/managed-by: cto-app\n    \
         cto.5dlabs.ai/scm-provider: {}\n    cto.5dlabs.ai/scm-connection-id: \
         {connection_id}\ntype: Opaque\nstringData:\n",
        provider.slug()
    );

    for (key, value) in data {
        if value.is_empty() {
            let _ = writeln!(manifest, "  {key}: \"\"");
            continue;
        }

        let _ = writeln!(manifest, "  {key}: |-");
        let normalized = value.replace("\r\n", "\n").replace('\r', "\n");
        for line in normalized.lines() {
            manifest.push_str("    ");
            manifest.push_str(line);
            manifest.push('\n');
        }
    }

    manifest
}

fn parse_github_manifest_conversion(body: &[u8]) -> ScmResult<GitHubManifestConversion> {
    serde_json::from_slice(body)
        .map_err(|error| format!("failed to parse GitHub manifest conversion response: {error}"))
}

fn github_manifest_conversion_url(base_url: &str, code: &str) -> ScmResult<Url> {
    let code = code.trim();
    if code.is_empty() {
        return Err("manifest code is required".to_string());
    }

    let api_base = github_api_base_url(base_url)?;
    let mut url =
        Url::parse(&api_base).map_err(|error| format!("invalid GitHub API URL: {error}"))?;
    url.path_segments_mut()
        .map_err(|()| "GitHub API URL cannot be a base".to_string())?
        .pop_if_empty()
        .extend(["app-manifests", code, "conversions"]);
    Ok(url)
}

fn github_api_base_url(base_url: &str) -> ScmResult<String> {
    let base_url = normalize_url(base_url)?;
    let url = Url::parse(&base_url).map_err(|error| format!("invalid GitHub base URL: {error}"))?;
    if url
        .host_str()
        .is_some_and(|host| host.eq_ignore_ascii_case("github.com"))
    {
        Ok("https://api.github.com".to_string())
    } else {
        Ok(format!("{base_url}/api/v3"))
    }
}

fn normalize_secret_namespace(secret_namespace: Option<&str>) -> ScmResult<String> {
    let namespace = secret_namespace
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_SCM_SECRET_NAMESPACE);
    validate_kubernetes_name(namespace, "secret namespace")?;
    Ok(namespace.to_string())
}

fn validate_kubernetes_name(value: &str, label: &str) -> ScmResult<()> {
    if value.is_empty() || value.len() > 63 {
        return Err(format!("{label} must be 1-63 characters"));
    }
    if value.starts_with('-') || value.ends_with('-') {
        return Err(format!("{label} cannot start or end with '-'"));
    }
    if !value
        .bytes()
        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(format!(
            "{label} must contain only lowercase letters, numbers, and '-'"
        ));
    }
    Ok(())
}

fn format_github_manifest_exchange_error(status: StatusCode, body: &[u8]) -> String {
    let detail = serde_json::from_slice::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| String::from_utf8_lossy(body).trim().to_string());
    let detail = detail.trim();
    if detail.is_empty() {
        format!("GitHub manifest exchange failed: HTTP {status}")
    } else {
        format!(
            "GitHub manifest exchange failed: HTTP {status} — {}",
            truncate_for_error(detail)
        )
    }
}

fn truncate_for_error(value: &str) -> String {
    const MAX_LEN: usize = 240;
    let mut chars = value.chars();
    let truncated = chars.by_ref().take(MAX_LEN).collect::<String>();
    if chars.next().is_none() {
        value.to_string()
    } else {
        format!("{truncated}…")
    }
}

fn validate_connection_id(connection_id: &str) -> ScmResult<()> {
    let len = connection_id.len();
    if len == 0 || len > CONNECTION_ID_MAX_LEN {
        return Err(format!(
            "connectionId must be 1-{CONNECTION_ID_MAX_LEN} characters"
        ));
    }
    if connection_id.starts_with('-') || connection_id.ends_with('-') {
        return Err("connectionId cannot start or end with '-'".to_string());
    }
    if !connection_id
        .bytes()
        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(
            "connectionId must contain only lowercase letters, numbers, and '-'".to_string(),
        );
    }
    Ok(())
}

fn secret_name(provider: ScmProvider, connection_id: &str) -> String {
    format!("cto-scm-{}-{connection_id}", provider.slug())
}

fn normalize_url(raw: &str) -> ScmResult<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    let url = Url::parse(trimmed).map_err(|error| format!("invalid URL '{trimmed}': {error}"))?;
    match url.scheme() {
        "http" | "https" => Ok(trimmed.to_string()),
        scheme => Err(format!("URL scheme '{scheme}' is not supported")),
    }
}

fn is_local_url(raw: &str) -> ScmResult<bool> {
    let url = Url::parse(raw).map_err(|error| format!("invalid URL '{raw}': {error}"))?;
    Ok(matches!(
        url.host_str(),
        Some("localhost" | "127.0.0.1" | "::1")
    ))
}

fn store_path(app: &AppHandle) -> ScmResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("failed to resolve app config dir: {error}"))?
        .join("source-control");
    Ok(dir.join("connections.json"))
}

fn read_store(app: &AppHandle) -> ScmResult<ScmConnectionStore> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(ScmConnectionStore::default());
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("failed to parse {}: {error}", path.display()))
}

fn write_store(app: &AppHandle, store: &ScmConnectionStore) -> ScmResult<()> {
    let path = store_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    let json = serde_json::to_vec_pretty(store)
        .map_err(|error| format!("failed to serialize SCM connections: {error}"))?;
    fs::write(&path, json).map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn now_stamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn github_request() -> ScmProvisioningRequest {
        ScmProvisioningRequest {
            provider: ScmProvider::GitHub,
            connection_id: "acme-dev".to_string(),
            display_name: Some("Acme Dev".to_string()),
            owner: "acme".to_string(),
            base_url: None,
            callback_base_url: None,
            repository_selection: Some(RepositorySelection::Selected),
        }
    }

    fn github_conversion() -> GitHubManifestConversion {
        GitHubManifestConversion {
            id: 12_345,
            slug: Some("cto-acme-dev".to_string()),
            html_url: Some("https://github.com/apps/cto-acme-dev".to_string()),
            client_id: "Iv1.fakeclient".to_string(),
            client_secret: "client-value".to_string(),
            webhook_secret: "webhook-value".to_string(),
            pem: "pem-value-line-1\npem-value-line-2\n".to_string(),
        }
    }

    #[test]
    fn github_manifest_uses_private_tenant_secret_and_local_callback() {
        let plan = build_provisioning_plan(github_request()).expect("plan");

        assert_eq!(plan.kubernetes_secret_name, "cto-scm-github-acme-dev");
        assert_eq!(plan.connection.secret_name, "cto-scm-github-acme-dev");
        assert_eq!(
            plan.local_callback_url,
            "http://localhost:8080/morgan/source-control/github/callback"
        );
        assert!(!plan.connection.webhook_enabled);
        assert_eq!(plan.connection.webhook_url, None);

        let manifest = plan.github_manifest.expect("manifest");
        assert_eq!(manifest["public"], false);
        assert_eq!(manifest["hook_attributes"]["active"], false);
        assert_eq!(
            manifest["default_permissions"]["contents"],
            Value::String("write".to_string())
        );
        assert!(!manifest.to_string().contains("5dlabs"));
    }

    #[test]
    fn github_manifest_exchange_url_uses_public_or_enterprise_api() {
        let public = github_manifest_conversion_url("https://github.com", " abc ").expect("url");
        assert_eq!(
            public.as_str(),
            "https://api.github.com/app-manifests/abc/conversions"
        );

        let enterprise =
            github_manifest_conversion_url("https://github.example.test/", "abc/123").expect("url");
        assert_eq!(
            enterprise.as_str(),
            "https://github.example.test/api/v3/app-manifests/abc%2F123/conversions"
        );
    }

    #[test]
    fn github_enterprise_plan_uses_enterprise_setup_urls() {
        let mut request = github_request();
        request.base_url = Some("https://github.example.test/".to_string());

        let plan = build_provisioning_plan(request).expect("plan");

        assert_eq!(
            plan.setup_urls[0].url,
            "https://github.example.test/settings/apps/new"
        );
        assert_eq!(
            plan.setup_urls[1].url,
            "https://github.example.test/organizations/acme/settings/apps/new"
        );
    }

    #[test]
    fn github_manifest_exchange_updates_metadata_and_renders_secret() {
        let plan = build_provisioning_plan(github_request()).expect("plan");
        let result = build_github_manifest_exchange_result(
            plan.connection,
            github_conversion(),
            Some("bots-dev"),
        )
        .expect("exchange result");

        assert_eq!(result.app_id, 12_345);
        assert_eq!(result.app_slug.as_deref(), Some("cto-acme-dev"));
        assert_eq!(result.connection.provider_app_id.as_deref(), Some("12345"));
        assert_eq!(
            result.connection.provider_app_url.as_deref(),
            Some("https://github.com/apps/cto-acme-dev")
        );
        assert_eq!(
            result.connection.status,
            ScmConnectionStatus::PendingInstall
        );
        assert_eq!(result.kubernetes_secret_namespace, "bots-dev");
        assert_eq!(result.credential_keys, github_secret_keys());
        assert!(result
            .kubernetes_secret_manifest
            .contains("name: cto-scm-github-acme-dev"));
        assert!(result
            .kubernetes_secret_manifest
            .contains("namespace: bots-dev"));
        assert!(result
            .kubernetes_secret_manifest
            .contains("installation-ids: \"\""));
        assert!(result
            .kubernetes_secret_manifest
            .contains("private-key: |-\n    pem-value-line-1\n    pem-value-line-2"));

        let stored_connection = serde_json::to_string(&result.connection).expect("json");
        assert!(!stored_connection.contains("client-value"));
        assert!(!stored_connection.contains("pem-value-line"));
        assert!(!stored_connection.contains("webhook-value"));
    }

    #[test]
    fn github_manifest_exchange_rejects_non_github_connections() {
        let plan = build_provisioning_plan(ScmProvisioningRequest {
            provider: ScmProvider::GitLab,
            connection_id: "acme-gitlab".to_string(),
            display_name: None,
            owner: "acme".to_string(),
            base_url: Some("https://gitlab.com".to_string()),
            callback_base_url: None,
            repository_selection: None,
        })
        .expect("plan");

        let err = build_github_manifest_exchange_result(plan.connection, github_conversion(), None)
            .expect_err("gitlab connection should fail");
        assert!(err.contains("GitHub connection"));
    }

    #[test]
    fn rejects_invalid_connection_ids_before_secret_generation() {
        for bad_id in ["Upper", "bad_id", "-bad", "bad-", "bad.id"] {
            let mut req = github_request();
            req.connection_id = bad_id.to_string();
            assert!(build_provisioning_plan(req).is_err(), "{bad_id}");
        }
    }

    #[test]
    fn gitlab_dot_com_requires_manual_token_secret() {
        let plan = build_provisioning_plan(ScmProvisioningRequest {
            provider: ScmProvider::GitLab,
            connection_id: "acme-gitlab".to_string(),
            display_name: None,
            owner: "acme".to_string(),
            base_url: Some("https://gitlab.com".to_string()),
            callback_base_url: None,
            repository_selection: None,
        })
        .expect("plan");

        assert_eq!(plan.connection.auth_strategy, ScmAuthStrategy::ManualToken);
        assert_eq!(
            plan.connection.status,
            ScmConnectionStatus::ManualTokenRequired
        );
        assert_eq!(plan.kubernetes_secret_name, "cto-scm-gitlab-acme-gitlab");
        assert_eq!(plan.kubernetes_secret_keys, vec!["token"]);
        assert!(plan.gitlab_application_api_endpoint.is_none());
    }

    #[test]
    fn self_managed_gitlab_exposes_admin_application_endpoint() {
        let plan = build_provisioning_plan(ScmProvisioningRequest {
            provider: ScmProvider::GitLab,
            connection_id: "forge".to_string(),
            display_name: None,
            owner: "platform".to_string(),
            base_url: Some("https://gitlab.example.test/".to_string()),
            callback_base_url: Some("https://cto.example.test".to_string()),
            repository_selection: None,
        })
        .expect("plan");

        assert_eq!(
            plan.connection.auth_strategy,
            ScmAuthStrategy::GitLabInstanceOAuthApp
        );
        assert_eq!(
            plan.gitlab_application_api_endpoint.as_deref(),
            Some("https://gitlab.example.test/api/v4/applications")
        );
        assert_eq!(
            plan.connection.webhook_url.as_deref(),
            Some("https://cto.example.test/morgan/source-control/gitlab/webhook")
        );
        assert!(!plan.connection.webhook_enabled);
    }
}
