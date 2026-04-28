import { isLocalStackBootstrapPreview, isTauriRuntime } from "../runtime";

type TauriInvokeArgs = Record<string, unknown> | undefined;
type TauriUnlisten = () => void;

let coreModulePromise: Promise<typeof import("@tauri-apps/api/core")> | null = null;
let eventModulePromise: Promise<typeof import("@tauri-apps/api/event")> | null = null;

const MOCK_BOOTSTRAP_DEFAULTS = {
  github: {
    token: "",
    tokenSource: "Browser preview",
    owner: "5dlabs",
    ownerSource: "Browser preview",
  },
  toolKeys: {
    EXA_API_KEY: { value: "", valueSource: "Browser preview" },
    FIRECRAWL_API_KEY: { value: "", valueSource: "Browser preview" },
    TAVILY_API_KEY: { value: "", valueSource: "Browser preview" },
    BRAVE_API_KEY: { value: "", valueSource: "Browser preview" },
    CONTEXT7_API_KEY: { value: "", valueSource: "Browser preview" },
    PERPLEXITY_API_KEY: { value: "", valueSource: "Browser preview" },
  },
};

const MOCK_LOCAL_STACK_RESOURCE_METRICS = {
  cluster: {
    kindClusterExists: true,
    apiReachable: true,
  },
  runtime: {
    label: "Browser preview",
    available: true,
    allocation: {
      cpuCores: 8,
      memoryBytes: 16 * 1024 * 1024 * 1024,
    },
  },
  nodes: [{ name: "cto-app-control-plane" }],
  pods: [
    { namespace: "cto-system", name: "cto-controller-0" },
    { namespace: "cto-system", name: "morgan-0" },
    { namespace: "argocd", name: "argocd-server-0" },
  ],
  totals: {
    nodes: 1,
    pods: 3,
    liveUsage: {
      cpuNanoCores: 1_800_000_000,
      memoryBytes: 3_200_000_000,
    },
  },
};

function buildMockScmConnection(
  args: TauriInvokeArgs,
): {
  provider: string;
  connectionId: string;
  displayName: string;
  owner: string;
  baseUrl: string;
  secretName: string;
  secretKeys: string[];
  authStrategy: "manual-token";
  callbackUrl: string;
  webhookUrl: null;
  webhookEnabled: false;
  status: "draft";
  installationIds: number[];
  createdAt: string;
  updatedAt: string;
} {
  const request = (args?.request ?? args?.connection ?? {}) as Record<string, unknown>;
  const provider = String(request.provider ?? "github");
  const connectionId = String(request.connectionId ?? "preview");
  const owner = String(request.owner ?? "5dlabs");
  const baseUrl = String(
    request.baseUrl ?? (provider === "gitlab" ? "https://gitlab.com" : "https://github.com"),
  );
  const now = new Date().toISOString();

  return {
    provider,
    connectionId,
    displayName: String(request.displayName ?? `${provider} ${owner}`),
    owner,
    baseUrl,
    secretName: `cto-scm-${provider}-${connectionId}`,
    secretKeys: ["token"],
    authStrategy: "manual-token",
    callbackUrl: "http://localhost:8080/morgan/source-control/preview/callback",
    webhookUrl: null,
    webhookEnabled: false,
    status: "draft",
    installationIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function tauriUnavailableError(command: string): Error {
  return new Error(
    `Tauri command "${command}" is unavailable in browser mode. Launch the desktop app or enable the web bypass flow.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function invokeBootstrapPreview<T>(command: string, args?: TauriInvokeArgs): Promise<T> {
  switch (command) {
    case "local_stack_bootstrap_defaults":
      return MOCK_BOOTSTRAP_DEFAULTS as T;
    case "local_stack_resource_metrics":
      return MOCK_LOCAL_STACK_RESOURCE_METRICS as T;
    case "bootstrap_local_stack":
      await sleep(900);
      return undefined as T;
    case "prepare_scm_provisioning": {
      const connection = buildMockScmConnection(args);
      return {
        connection,
        setupUrls: [],
        githubManifest: null,
        gitlabApplicationApiEndpoint: null,
        kubernetesSecretName: connection.secretName,
        kubernetesSecretKeys: connection.secretKeys,
        localCallbackUrl: connection.callbackUrl,
        webhookBehavior: "disabled in browser preview",
        steps: ["Browser preview does not create a real provider app."],
        warnings: ["Source control provisioning is mocked in browser preview mode."],
      } as T;
    }
    case "save_scm_connection":
      return [buildMockScmConnection(args)] as T;
    case "list_scm_connections":
      return [] as T;
    default:
      throw tauriUnavailableError(command);
  }
}

async function loadCoreModule() {
  coreModulePromise ??= import("@tauri-apps/api/core");
  return coreModulePromise;
}

async function loadEventModule() {
  eventModulePromise ??= import("@tauri-apps/api/event");
  return eventModulePromise;
}

export async function invokeTauri<T>(
  command: string,
  args?: TauriInvokeArgs,
): Promise<T> {
  if (isLocalStackBootstrapPreview()) {
    return invokeBootstrapPreview<T>(command, args);
  }

  if (!isTauriRuntime()) {
    throw tauriUnavailableError(command);
  }

  const { invoke } = await loadCoreModule();
  return invoke<T>(command, args);
}

export async function listenTauri<T>(
  event: string,
  handler: Parameters<typeof import("@tauri-apps/api/event").listen<T>>[1],
): Promise<TauriUnlisten> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  const { listen } = await loadEventModule();
  return listen<T>(event, handler);
}

export function isTauriCommandAvailable(): boolean {
  return isTauriRuntime() || isLocalStackBootstrapPreview();
}
