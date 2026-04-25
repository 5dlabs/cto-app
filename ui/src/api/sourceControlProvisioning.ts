import { invoke } from "@tauri-apps/api/core";

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

export function listScmConnections(): Promise<ScmConnection[]> {
  return invoke<ScmConnection[]>("list_scm_connections");
}

export function prepareScmProvisioning(
  request: ScmProvisioningRequest,
): Promise<ScmProvisioningPlan> {
  return invoke<ScmProvisioningPlan>("prepare_scm_provisioning", { request });
}

export function saveScmConnection(
  connection: ScmConnection,
): Promise<ScmConnection[]> {
  return invoke<ScmConnection[]>("save_scm_connection", { connection });
}

export function deleteScmConnection(
  provider: ScmProvider,
  connectionId: string,
): Promise<ScmConnection[]> {
  return invoke<ScmConnection[]>("delete_scm_connection", {
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
