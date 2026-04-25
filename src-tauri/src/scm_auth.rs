use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

type ScmResult<T> = Result<T, String>;

const CONNECTION_ID_MAX_LEN: usize = 48;
const LOCAL_CALLBACK_BASE_URL: &str = "http://localhost:8080";

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
    validate_connection(&connection)?;

    let mut store = read_store(&app)?;
    let now = now_stamp();
    let mut next = connection;
    next.updated_at = now;

    if let Some(existing) = store.connections.iter_mut().find(|candidate| {
        candidate.provider == next.provider && candidate.connection_id == next.connection_id
    }) {
        next.created_at.clone_from(&existing.created_at);
        *existing = next;
    } else {
        if next.created_at.trim().is_empty() {
            next.created_at = now_stamp();
        }
        store.connections.push(next);
    }

    store.connections.sort_by(|a, b| {
        a.provider
            .slug()
            .cmp(b.provider.slug())
            .then(a.connection_id.cmp(&b.connection_id))
    });
    write_store(&app, &store)?;
    Ok(store.connections)
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
    let setup_urls = github_setup_urls(&owner);
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

fn github_setup_urls(owner: &str) -> Vec<ScmSetupUrl> {
    vec![
        ScmSetupUrl {
            label: "User-owned app".to_string(),
            url: "https://github.com/settings/apps/new".to_string(),
        },
        ScmSetupUrl {
            label: format!("Org-owned app ({owner})"),
            url: format!("https://github.com/organizations/{owner}/settings/apps/new"),
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
