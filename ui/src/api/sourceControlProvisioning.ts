import { invokeTauri } from "./tauri";

export type ScmProvider = "github" | "gitlab";

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
