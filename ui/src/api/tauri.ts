import { isLocalStackBootstrapPreview, isTauriRuntime } from "../runtime";

type TauriInvokeArgs = Record<string, unknown> | undefined;
type TauriUnlisten = () => void;

let coreModulePromise: Promise<typeof import("@tauri-apps/api/core")> | null = null;
let eventModulePromise: Promise<typeof import("@tauri-apps/api/event")> | null = null;
let shellModulePromise: Promise<typeof import("@tauri-apps/plugin-shell")> | null = null;

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
    { namespace: "cto", name: "cto-controller-0" },
    { namespace: "cto", name: "morgan-0" },
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
    case "reset_local_stack_bootstrap":
      return {
        removedSetupProfile: true,
        deletedKindCluster: true,
      } as T;
    case "audio_output_status":
      return {
        hasOutputDevice: true,
        outputDeviceName: "Browser preview",
        outputVolumePercent: null,
        outputMuted: null,
        warning: null,
      } as T;
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
    case "detect_secret_sources":
      return {
        providers: [
          {
            provider: "onepassword",
            label: "1Password",
            detected: false,
            available: false,
            version: null,
            reason: "Browser preview",
            primaryAction: "Paste instead",
          },
        ],
        manualFallbackAvailable: true,
        message: "Browser preview keeps saved access optional; paste instead remains available.",
      } as T;
    case "preview_secret_source_matches":
      return {
        provider: "onepassword",
        discovery: "metadata-only",
        matches: [],
        warnings: ["Browser preview does not read vault metadata."],
      } as T;
    case "apply_secret_source_matches":
      return {
        provider: "onepassword",
        applied: [],
        rawValuesPersisted: false,
        message: "Access connected",
      } as T;
    case "probe_gitlab_coderun_auth":
      return {
        provider: "gitlab",
        baseUrl: "https://gitlab.com",
        apiEndpoint: "https://gitlab.com/api/v4/user",
        ok: false,
        status: 0,
        username: null,
        userId: null,
        selectedAgents: ["rex", "blaze", "pass", "cipher"],
        requiredScopes: ["api", "read_api", "read_repository", "write_repository"],
        secretName: "cto-agent-keys",
        secretKey: "GITLAB_TOKEN",
        redactedTokenPreview: "[REDACTED]",
        redaction: "[REDACTED]",
        nextSteps: [],
      } as T;
    case "prepare_origin_transfer":
      return {
        engine: "standard",
        mode: "mirror",
        appName: "origin-standard",
        appLabel: "5D Origin Gitea",
        sourceProvider: "github",
        sourceConnectionId: "preview",
        repositories: [],
        actionPlan: [],
        manifestPreview: "[REDACTED] browser preview",
        redaction: "[REDACTED]",
        warnings: [],
      } as T;
    case "provision_origin_application":
      return {
        engine: "standard",
        appName: "origin-standard",
        applied: false,
        dryRun: true,
        manifestPreview: "[REDACTED] browser preview",
        message: "Origin application dry-run is ready for approval",
      } as T;
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

async function loadShellModule() {
  shellModulePromise ??= import("@tauri-apps/plugin-shell");
  return shellModulePromise;
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

export async function openExternalUrl(url: string): Promise<void> {
  const target = url.trim();
  if (!target) {
    throw new Error("Cannot open an empty setup URL.");
  }

  if (isTauriRuntime()) {
    const { open } = await loadShellModule();
    await open(target);
    return;
  }

  const opened = window.open(target, "_blank", "noopener,noreferrer");
  if (!opened) {
    throw new Error("The browser blocked the setup window. Allow popups or copy the setup URL.");
  }
}
