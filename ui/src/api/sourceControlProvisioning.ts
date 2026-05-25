import { invokeTauri } from "./tauri";

export type ScmProvider = "github" | "gitlab" | "gitea";

export type ScmAuthStrategy =
  | "github-app-manifest"
  | "gitlab-instance-oauth-app"
  | "manual-token";

export type ScmConnectionStatus =
  | "draft"
  | "pending-install"
  | "manual-token-required"
  | "ready";

export type RepositorySelection = "all" | "selected";

export type SecretSourceProvider = "onepassword" | "bitwarden";
export type SecretSourceQuickConnectProvider = "onepassword" | "bitwarden";

export type OriginEngine = "standard" | "gitlab-compatible";
export type OriginTransferMode = "mirror" | "migrate";

export interface OriginTransferRequest {
  engine: OriginEngine;
  sourceProvider: "github" | "gitlab";
  sourceConnectionId: string;
  repositories?: string[];
  mode?: OriginTransferMode;
}

export interface OriginTransferPlan {
  engine: OriginEngine;
  mode: OriginTransferMode;
  appName: "origin-standard" | "origin-gitlab-compatible" | string;
  appLabel: string;
  sourceProvider: "github" | "gitlab" | string;
  sourceConnectionId: string;
  repositories: string[];
  actionPlan: string[];
  manifestPreview: string;
  redaction: "[REDACTED]" | string;
  warnings: string[];
}

export interface OriginProvisionRequest {
  engine: OriginEngine;
  approved: boolean;
  dryRun?: boolean;
}

export interface OriginProvisionResult {
  engine: OriginEngine;
  appName: string;
  applied: boolean;
  dryRun: boolean;
  manifestPreview: string;
  message: string;
}

export interface SecretSourceProviderStatus {
  provider: SecretSourceProvider;
  label: string;
  desktopInstalled?: boolean;
  cliInstalled?: boolean;
  cliAccessReady?: boolean;
  desktopAppIntegrationEnabled?: boolean;
  accountConfigured?: boolean;
  pendingUserPermission?: boolean;
  detected: boolean;
  available: boolean;
  status?: string | null;
  docsUrl?: string | null;
  secondary?: boolean;
  version: string | null;
  reason: string | null;
  primaryAction: string;
}

export interface SecretSourceDetectionResult {
  providers: SecretSourceProviderStatus[];
  manualFallbackAvailable: boolean;
  message: string;
}

export interface SecretSourcePreviewRequest {
  provider: SecretSourceQuickConnectProvider;
  targets?: string[];
}

export interface SecretSourceMatchPreview {
  provider: SecretSourceQuickConnectProvider;
  purpose: string;
  targetSecretName: string;
  targetSecretKey: string;
  providerRef: string;
  label: string;
  confidence: string;
  redactedValuePreview: "[REDACTED]" | string;
  approvalRequired: boolean;
}

export interface SecretSourcePreviewResult {
  provider: SecretSourceQuickConnectProvider;
  discovery: "metadata-only";
  matches: SecretSourceMatchPreview[];
  warnings: string[];
}

export interface SecretSourceApplyRequest {
  provider: SecretSourceQuickConnectProvider;
  approved: boolean;
  matches: Array<{
    purpose: string;
    targetSecretKey: string;
    providerRef: string;
  }>;
}

export interface SecretSourceApplyResult {
  provider: SecretSourceQuickConnectProvider;
  applied: Array<{
    purpose: string;
    targetSecretName: string;
    targetSecretKey: string;
    providerRef: string;
    status: string;
  }>;
  rawValuesPersisted: false;
  message: string;
}

export interface ScmConnection {
  provider: ScmProvider;
  connectionId: string;
  displayName: string;
  owner: string;
  baseUrl: string;
  secretName: string;
  secretKeys: string[];
  providerAppId?: string;
  providerAppSlug?: string;
  providerAppUrl?: string;
  credentialsUpdatedAt?: string;
  authStrategy: ScmAuthStrategy;
  callbackUrl: string;
  webhookUrl: string | null;
  webhookEnabled: boolean;
  status: ScmConnectionStatus;
  installationIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface ScmProvisioningRequest {
  provider: ScmProvider;
  connectionId: string;
  displayName?: string;
  owner: string;
  baseUrl?: string;
  callbackBaseUrl?: string;
  repositorySelection?: RepositorySelection;
}

export interface ScmSetupUrl {
  label: string;
  url: string;
}

export interface ScmProvisioningPlan {
  connection: ScmConnection;
  setupUrls: ScmSetupUrl[];
  githubManifest: Record<string, unknown> | null;
  gitlabApplicationApiEndpoint: string | null;
  kubernetesSecretName: string;
  kubernetesSecretKeys: string[];
  localCallbackUrl: string;
  webhookBehavior: string;
  steps: string[];
  warnings: string[];
}

export interface GitHubManifestExchangeRequest {
  connection: ScmConnection;
  code: string;
  secretNamespace?: string;
}


export interface GitLabCodeRunAuthProbeRequest {
  baseUrl?: string;
  token: string;
  agents?: Array<"rex" | "blaze" | "pass" | "cipher">;
}

export interface GitLabCodeRunAuthProbeResult {
  provider: "gitlab";
  baseUrl: string;
  apiEndpoint: string;
  ok: boolean;
  status: number;
  username: string | null;
  userId: number | null;
  selectedAgents: string[];
  requiredScopes: string[];
  secretName: string;
  secretKey: "GITLAB_TOKEN";
  redactedTokenPreview: string;
  redaction: "[REDACTED]" | string;
  nextSteps: string[];
}

export interface GitHubManifestExchangeResult {
  connection: ScmConnection;
  appId: number;
  appSlug: string | null;
  appUrl: string | null;
  kubernetesSecretName: string;
  kubernetesSecretNamespace: string;
  kubernetesSecretManifest: string;
  credentialKeys: string[];
  nextSteps: string[];
  localMetadataSaved: boolean;
  localMetadataError: string | null;
}

export function listScmConnections(): Promise<ScmConnection[]> {
  return invokeTauri<ScmConnection[]>("list_scm_connections");
}

export function prepareScmProvisioning(
  request: ScmProvisioningRequest,
): Promise<ScmProvisioningPlan> {
  return invokeTauri<ScmProvisioningPlan>("prepare_scm_provisioning", { request });
}

export function saveScmConnection(
  connection: ScmConnection,
): Promise<ScmConnection[]> {
  return invokeTauri<ScmConnection[]>("save_scm_connection", { connection });
}

export function exchangeGithubManifestCode(
  request: GitHubManifestExchangeRequest,
): Promise<GitHubManifestExchangeResult> {
  return invokeTauri<GitHubManifestExchangeResult>("exchange_github_manifest_code", {
    request,
  });
}

export function deleteScmConnection(
  provider: ScmProvider,
  connectionId: string,
): Promise<ScmConnection[]> {
  return invokeTauri<ScmConnection[]>("delete_scm_connection", {
    provider,
    connectionId,
  });
}

export function slugifyConnectionId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function detectSecretSources(): Promise<SecretSourceDetectionResult> {
  return invokeTauri<SecretSourceDetectionResult>("detect_secret_sources");
}

export function installOnePasswordCli(): Promise<SecretSourceDetectionResult> {
  return invokeTauri<SecretSourceDetectionResult>("install_onepassword_cli");
}

export function previewSecretSourceMatches(
  request: SecretSourcePreviewRequest,
): Promise<SecretSourcePreviewResult> {
  return invokeTauri<SecretSourcePreviewResult>("preview_secret_source_matches", { request });
}

export function applySecretSourceMatches(
  request: SecretSourceApplyRequest,
): Promise<SecretSourceApplyResult> {
  return invokeTauri<SecretSourceApplyResult>("apply_secret_source_matches", { request });
}

export function probeGitlabCodeRunAuth(
  request: GitLabCodeRunAuthProbeRequest,
): Promise<GitLabCodeRunAuthProbeResult> {
  return invokeTauri<GitLabCodeRunAuthProbeResult>("probe_gitlab_coderun_auth", { request });
}

export function prepareOriginTransfer(
  request: OriginTransferRequest,
): Promise<OriginTransferPlan> {
  return invokeTauri<OriginTransferPlan>("prepare_origin_transfer", { request });
}

export function provisionOriginApplication(
  request: OriginProvisionRequest,
): Promise<OriginProvisionResult> {
  return invokeTauri<OriginProvisionResult>("provision_origin_application", { request });
}
