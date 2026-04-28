import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  prepareScmProvisioning,
  saveScmConnection,
  slugifyConnectionId,
  type ScmProvider,
} from "../api/sourceControlProvisioning";
import { invokeTauri, isTauriCommandAvailable, listenTauri } from "../api/tauri";
import { isLocalStackBootstrapPreview, shouldSkipLocalStackBootstrap } from "../runtime";
import fiveDLabsLogo from "../assets/5d-labs-mark.png";
import {
  IconClaude,
  IconCloud,
  IconCpu,
  IconCursor,
  IconDatabase,
  IconGitHub,
  IconGitLab,
  IconGlobe,
  IconKey,
  IconOpenClaw,
  IconOpenAI,
  IconPackage,
  IconSearch,
  IconShield,
  IconSparkles,
  IconTerminal,
  type IconProps,
} from "../views/icons";

type BootstrapProgress = {
  stage: string;
  message: string;
  progress: number;
};

type BootstrapState = "credentials" | "checking" | "ready" | "failed";
type SourceHostMode = "hosted" | "self-hosted";
type SetupScreen = "intro" | "profiles" | "tools" | "harness";
type HarnessId = "openclaw" | "codex";
type AiCliId =
  | "claude"
  | "code"
  | "cursor"
  | "codex"
  | "factory"
  | "gemini"
  | "copilot"
  | "kimi";
type AiProviderId = string;
type ToolApiKeyName =
  | "EXA_API_KEY"
  | "FIRECRAWL_API_KEY"
  | "TAVILY_API_KEY"
  | "BRAVE_API_KEY"
  | "CONTEXT7_API_KEY"
  | "PERPLEXITY_API_KEY";

type BootstrapGithubDefaults = {
  token: string;
  tokenSource?: string | null;
  owner: string;
  ownerSource?: string | null;
};

type LocalStackBootstrapDefaults = {
  github: BootstrapGithubDefaults;
  toolKeys?: Partial<Record<ToolApiKeyName, BootstrapToolKeyDefault>>;
};

type BootstrapToolKeyDefault = {
  value: string;
  valueSource?: string | null;
};

type BootstrapGithubForm = {
  enabled: boolean;
  token: string;
  tokenSource?: string | null;
  owner: string;
  ownerSource?: string | null;
};

type BootstrapLocalStackRequest = {
  github?: {
    enabled: boolean;
    token?: string;
    owner?: string;
  };
  tools?: {
    apiKeys: Array<{
      name: ToolApiKeyName;
      value: string;
    }>;
  };
  setup?: BootstrapSetupProfile;
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type BootstrapSetupProfile = {
  source: {
    provider: ScmProvider;
    baseUrl: string;
    owner: string;
    connectionId: string;
  };
  harness: {
    mode: HarnessId;
    clis: AiCliId[];
    providers: BootstrapProviderSelection[];
  };
};

type BootstrapProviderSelection = {
  id: AiProviderId;
  auth: AiProviderOption["auth"];
  model: string;
  models: string[];
};

type AiCliOption = {
  id: AiCliId;
  name: string;
  icon: ComponentType<IconProps>;
  summary: string;
  sourceControlOnly?: boolean;
};

type AiProviderOption = {
  id: AiProviderId;
  name: string;
  icon: ComponentType<IconProps>;
  summary: string;
  auth: "oauth" | "api-key" | "cloud" | "local";
  cliIds: AiCliId[];
  models: string[];
};

type ToolApiKeyOption = {
  name: ToolApiKeyName;
  label: string;
  icon: ChoiceIcon;
  summary: string;
  placeholder: string;
};

type RuntimeAllocation = {
  cpuCores?: number | null;
  memoryBytes?: number | null;
};

type MetricsRuntimeReport = {
  label?: string;
  available?: boolean;
  allocation?: RuntimeAllocation | null;
};

type MetricsClusterReport = {
  kindClusterExists?: boolean;
  apiReachable?: boolean;
};

type LiveResourceUsage = {
  cpuNanoCores?: number | null;
  memoryBytes?: number | null;
};

type ResourceMetricTotals = {
  nodes?: number;
  pods?: number;
  liveUsage?: LiveResourceUsage;
};

type LocalStackResourceMetricsReport = {
  cluster?: MetricsClusterReport;
  runtime?: MetricsRuntimeReport;
  nodes?: unknown[];
  pods?: unknown[];
  totals?: ResourceMetricTotals;
};

type MetricsState = {
  status: "idle" | "checking" | "ready" | "unavailable";
  report: LocalStackResourceMetricsReport | null;
};

type MetricsItem = {
  label: string;
  value: string;
};

type ChoiceIcon = ComponentType<IconProps>;

const SOURCE_LABELS: Record<ScmProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
};

const SOURCE_DEFAULT_URLS: Record<ScmProvider, string> = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
};

const SOURCE_OPTIONS: Array<{
  id: ScmProvider;
  name: string;
  icon: ChoiceIcon;
  summary: string;
}> = [
  {
    id: "github",
    name: "GitHub",
    icon: IconGitHub,
    summary: "GitHub repository namespace.",
  },
  {
    id: "gitlab",
    name: "GitLab",
    icon: IconGitLab,
    summary: "GitLab group or namespace.",
  },
];

const HARNESSES: Array<{
  id: HarnessId;
  name: string;
  icon: ChoiceIcon;
  summary: string;
}> = [
  {
    id: "openclaw",
    name: "OpenClaw",
    icon: IconOpenClaw,
    summary: "OpenClaw harness for provider-backed agent sessions.",
  },
  {
    id: "codex",
    name: "Codex",
    icon: IconOpenAI,
    summary: "Codex harness for OpenAI-backed coding sessions.",
  },
];

const TOOL_API_KEYS: ToolApiKeyOption[] = [
  {
    name: "EXA_API_KEY",
    label: "Exa",
    icon: IconSearch,
    summary: "Neural web search and fetch tools exposed through cto-tools.",
    placeholder: "exa_...",
  },
  {
    name: "FIRECRAWL_API_KEY",
    label: "Firecrawl",
    icon: IconGlobe,
    summary: "Scrape, crawl, map, and search fallback for blocked or JS-heavy pages.",
    placeholder: "fc-...",
  },
  {
    name: "TAVILY_API_KEY",
    label: "Tavily",
    icon: IconSearch,
    summary: "Search, extract, map, crawl, and research MCP tools.",
    placeholder: "tvly-...",
  },
  {
    name: "BRAVE_API_KEY",
    label: "Brave Search",
    icon: IconGlobe,
    summary: "OpenCLAW web search provider key for grounded search.",
    placeholder: "BSA...",
  },
  {
    name: "PERPLEXITY_API_KEY",
    label: "Perplexity",
    icon: IconSparkles,
    summary: "OpenCLAW Perplexity/Sonar search provider key.",
    placeholder: "pplx-...",
  },
  {
    name: "CONTEXT7_API_KEY",
    label: "Context7",
    icon: IconKey,
    summary: "Documentation lookup provider key for library research.",
    placeholder: "ctx7-...",
  },
];

const AI_CLIS: AiCliOption[] = [
  {
    id: "claude",
    name: "Claude",
    icon: IconClaude,
    summary: "Claude CLI surface for Anthropic and cloud-provider routes.",
  },
  {
    id: "code",
    name: "OpenCode",
    icon: IconTerminal,
    summary: "OpenCode CLI profile.",
  },
  {
    id: "cursor",
    name: "Cursor",
    icon: IconCursor,
    summary: "Cursor agent profile.",
  },
  {
    id: "codex",
    name: "Codex",
    icon: IconOpenAI,
    summary: "ChatGPT sign-in or OpenAI Responses profiles.",
  },
  {
    id: "factory",
    name: "Factory",
    icon: IconPackage,
    summary: "Factory agent CLI profile.",
  },
  {
    id: "gemini",
    name: "Gemini",
    icon: IconSparkles,
    summary: "Google login, Gemini API key, or Vertex ADC.",
  },
  {
    id: "copilot",
    name: "Copilot",
    icon: IconGitHub,
    summary: "GitHub Copilot coding-agent profile.",
  },
  {
    id: "kimi",
    name: "Kimi",
    icon: IconShield,
    summary: "Kimi coding-agent profile.",
  },
];

const OPENROUTER_MODELS = [
  "openrouter/auto",
  "anthropic/claude-opus-4.7",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5.5",
  "openai/gpt-5.4",
  "openai/gpt-5.3-codex",
  "google/gemini-3-pro",
  "google/gemini-2.5-pro",
  "google/gemini-flash",
  "x-ai/grok-4.20",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-flash",
  "moonshotai/kimi-k2.6",
  "z-ai/glm-5.1",
  "qwen/qwen3.6",
  "qwen/qwen3-coder",
  "meta-llama/llama-4",
  "mistralai/mistral-large",
  "mistralai/codestral",
  "minimax/minimax-m2.7",
  "cohere/command-a",
  "perplexity/sonar",
  "nousresearch/hermes",
  "nvidia/nemotron",
  "amazon/nova",
  "openrouter/cypher-alpha",
  "openrouter/optimus-alpha",
];

const AI_PROVIDERS: AiProviderOption[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    icon: IconSparkles,
    summary: "Claude API and Claude Code subscription auth.",
    auth: "oauth",
    cliIds: ["claude", "code", "cursor", "factory", "copilot", "kimi"],
    models: ["Opus 4.7", "Sonnet 4.6", "Haiku 4.5"],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: IconOpenAI,
    summary: "Responses-capable OpenAI and Codex routes.",
    auth: "oauth",
    cliIds: ["code", "cursor", "codex", "factory", "copilot"],
    models: ["GPT-5.5", "GPT-5.4", "GPT-5.3 Codex"],
  },
  {
    id: "google-gemini",
    name: "Google Gemini",
    icon: IconSparkles,
    summary: "Gemini API and Google account auth.",
    auth: "oauth",
    cliIds: ["code", "cursor", "factory", "gemini", "copilot"],
    models: ["Gemini 3", "Gemini 2.5 Pro", "Gemini Flash"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: IconGlobe,
    summary: "Brokered model catalog with API key routing.",
    auth: "api-key",
    cliIds: ["claude", "code", "cursor", "codex", "factory", "gemini", "copilot", "kimi"],
    models: OPENROUTER_MODELS,
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    icon: IconCloud,
    summary: "AWS IAM/SigV4 for Claude and other Bedrock models.",
    auth: "cloud",
    cliIds: ["claude", "code", "cursor", "codex", "factory"],
    models: ["Claude", "Nova", "Llama", "Cohere"],
  },
  {
    id: "vertex-ai",
    name: "Vertex AI",
    icon: IconPackage,
    summary: "Google cloud credentials, Gemini, and partner Model Garden.",
    auth: "cloud",
    cliIds: ["claude", "code", "cursor", "factory", "gemini"],
    models: ["Gemini", "Claude", "Imagen", "Veo"],
  },
  {
    id: "ollama",
    name: "Ollama",
    icon: IconCpu,
    summary: "Local model runtime with optional OpenAI-compatible endpoint.",
    auth: "local",
    cliIds: ["code", "cursor", "codex", "factory", "kimi"],
    models: ["Local tags", "Qwen", "Llama", "DeepSeek"],
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    icon: IconDatabase,
    summary: "Local OpenAI/Anthropic-compatible runtime.",
    auth: "local",
    cliIds: ["claude", "code", "cursor", "codex", "factory", "kimi"],
    models: ["Loaded model", "GGUF", "MLX", "OpenAI compat"],
  },
];

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function formatCpu(cores: number): string {
  if (cores === 0) return "0 CPU";
  if (cores > 0 && cores < 0.01) return "<0.01 CPU";

  const value =
    cores >= 10 ? cores.toFixed(0) : cores >= 1 ? cores.toFixed(1) : cores.toFixed(2);
  return `${value.replace(/\.0$/, "")} CPU`;
}

function formatCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function formatRuntimeFootprint(report: LocalStackResourceMetricsReport): string | undefined {
  const label = report.runtime?.label?.trim();
  const allocation = report.runtime?.allocation;
  const allocationParts = [
    isFiniteNumber(allocation?.cpuCores) ? `${allocation.cpuCores} CPU` : null,
    isFiniteNumber(allocation?.memoryBytes) ? `${formatBytes(allocation.memoryBytes)} RAM` : null,
  ].filter(Boolean);

  if (label && allocationParts.length > 0) {
    return `${label} · ${allocationParts.join(" / ")}`;
  }

  if (allocationParts.length > 0) {
    return allocationParts.join(" / ");
  }

  if (report.runtime?.available === false) {
    return label && label.toLowerCase() !== "unavailable" ? `${label} unavailable` : "unavailable";
  }

  return label || undefined;
}

function formatKindFootprint(report: LocalStackResourceMetricsReport): string | undefined {
  if (report.cluster?.kindClusterExists === false) return "not created";
  if (report.cluster?.apiReachable === false) return "API unavailable";

  const nodeCount = report.totals?.nodes ?? report.nodes?.length;
  const podCount = report.totals?.pods ?? report.pods?.length;
  const parts = [
    isFiniteNumber(nodeCount) ? formatCount(nodeCount, "node") : null,
    isFiniteNumber(podCount) ? formatCount(podCount, "pod") : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function formatLiveFootprint(report: LocalStackResourceMetricsReport): string | undefined {
  const liveUsage = report.totals?.liveUsage;
  const parts = [
    isFiniteNumber(liveUsage?.cpuNanoCores)
      ? formatCpu(liveUsage.cpuNanoCores / 1_000_000_000)
      : null,
    isFiniteNumber(liveUsage?.memoryBytes) ? `${formatBytes(liveUsage.memoryBytes)} RAM` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function buildMetricsItems(metrics: MetricsState): MetricsItem[] {
  if (!metrics.report) {
    return [
      {
        label: "Footprint",
        value: metrics.status === "unavailable" ? "unavailable" : "checking",
      },
    ];
  }

  const items = [
    { label: "Runtime", value: formatRuntimeFootprint(metrics.report) },
    { label: "Kind", value: formatKindFootprint(metrics.report) },
    { label: "Live", value: formatLiveFootprint(metrics.report) },
  ]
    .filter((item): item is MetricsItem => Boolean(item.value))
    .slice(0, 3);

  return items.length > 0 ? items : [{ label: "Footprint", value: "unavailable" }];
}

function buildBootstrapRequest(
  sourceProvider: ScmProvider,
  sourceOwner: string,
  githubToken: string,
  toolApiKeys: Partial<Record<ToolApiKeyName, string>>,
  setup: BootstrapSetupProfile,
): BootstrapLocalStackRequest {
  const tools = {
    apiKeys: TOOL_API_KEYS.map((tool) => ({
      name: tool.name,
      value: toolApiKeys[tool.name]?.trim() ?? "",
    })).filter((key) => key.value.length > 0),
  };

  if (sourceProvider !== "github") {
    return { github: { enabled: false }, tools, setup };
  }

  return {
    github: {
      enabled: true,
      token: githubToken.trim() || undefined,
      owner: sourceOwner.trim() || undefined,
    },
    tools,
    setup,
  };
}

function providerAuthLabel(auth: AiProviderOption["auth"]): string {
  return {
    oauth: "OAuth",
    "api-key": "API key",
    cloud: "Cloud creds",
    local: "Local",
  }[auth];
}

function sourceConnectionId(provider: ScmProvider, owner: string): string {
  return slugifyConnectionId(owner) || provider;
}

function buildSetupProfile({
  sourceProvider,
  sourceHostMode,
  sourceHostUrl,
  sourceOwner,
  harness,
  selectedAiCliIds,
  selectedProviders,
  selectedModels,
}: {
  sourceProvider: ScmProvider;
  sourceHostMode: SourceHostMode;
  sourceHostUrl: string;
  sourceOwner: string;
  harness: HarnessId;
  selectedAiCliIds: AiCliId[];
  selectedProviders: AiProviderOption[];
  selectedModels: Partial<Record<AiProviderId, string[]>>;
}): BootstrapSetupProfile {
  const owner = sourceOwner.trim();
  return {
    source: {
      provider: sourceProvider,
      baseUrl:
        sourceHostMode === "hosted"
          ? SOURCE_DEFAULT_URLS[sourceProvider]
          : sourceHostUrl.trim(),
      owner,
      connectionId: sourceConnectionId(sourceProvider, owner),
    },
    harness: {
      mode: harness,
      clis: selectedAiCliIds,
      providers: selectedProviders.map((provider) => ({
        id: provider.id,
        auth: provider.auth,
        model: (selectedModels[provider.id] ?? [provider.models[0]])[0],
        models: selectedModels[provider.id] ?? [provider.models[0]],
      })),
    },
  };
}

export function LocalStackBootstrap({ children }: { children: ReactNode }) {
  if (shouldSkipLocalStackBootstrap()) {
    return <>{children}</>;
  }

  return <LocalStackBootstrapGate>{children}</LocalStackBootstrapGate>;
}

function LocalStackBootstrapGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootstrapState>("credentials");
  const [setupScreen, setSetupScreen] = useState<SetupScreen>("intro");
  const [sourceProvider, setSourceProvider] = useState<ScmProvider>("github");
  const [sourceHostMode, setSourceHostMode] = useState<SourceHostMode>("hosted");
  const [sourceHostUrl, setSourceHostUrl] = useState(SOURCE_DEFAULT_URLS.github);
  const [sourceHostEditing, setSourceHostEditing] = useState(false);
  const [sourceOwner, setSourceOwner] = useState("5dlabs");
  const [harness, setHarness] = useState<HarnessId | null>(null);
  const [selectedCliIds, setSelectedCliIds] = useState<Partial<Record<AiCliId, true>>>({});
  const [selectedProviderIds, setSelectedProviderIds] =
    useState<Partial<Record<AiProviderId, true>>>({});
  const [selectedModels, setSelectedModels] = useState<Partial<Record<AiProviderId, string[]>>>({});
  const [toolApiKeys, setToolApiKeys] = useState<Partial<Record<ToolApiKeyName, string>>>({});
  const [progress, setProgress] = useState<BootstrapProgress>({
    stage: "credentials",
    message: "Preparing setup...",
    progress: 4,
  });
  const [error, setError] = useState<string | null>(null);
  const [previewBanner, setPreviewBanner] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsState>({ status: "idle", report: null });
  const [githubForm, setGithubForm] = useState<BootstrapGithubForm>({
    enabled: true,
    token: "",
    tokenSource: null,
    owner: "5dlabs",
    ownerSource: null,
  });
  const loadedDefaults = useRef(false);
  const toolKeyTouched = useRef<Partial<Record<ToolApiKeyName, true>>>({});
  const metricsInFlight = useRef(false);
  const lastMetricsProgress = useRef(0);
  const selectedAiCliIds = useMemo(
    () => AI_CLIS.filter((cli) => selectedCliIds[cli.id]).map((cli) => cli.id),
    [selectedCliIds],
  );
  const selectedProviderFilterCliIds = useMemo(
    () =>
      AI_CLIS.filter((cli) => selectedCliIds[cli.id] && !cli.sourceControlOnly).map(
        (cli) => cli.id,
      ),
    [selectedCliIds],
  );
  const providerOptions = useMemo(
    () =>
      AI_PROVIDERS.filter((provider) =>
        selectedProviderFilterCliIds.some((cliId) => provider.cliIds.includes(cliId)),
      ),
    [selectedProviderFilterCliIds],
  );
  const selectedProviders = useMemo(
    () => providerOptions.filter((provider) => selectedProviderIds[provider.id]),
    [providerOptions, selectedProviderIds],
  );
  const setupProfile = useMemo(
    () =>
      buildSetupProfile({
        sourceProvider,
        sourceHostMode,
        sourceHostUrl,
        sourceOwner,
        harness: harness ?? "openclaw",
        selectedAiCliIds,
        selectedProviders,
        selectedModels,
      }),
    [
      harness,
      selectedAiCliIds,
      selectedModels,
      selectedProviders,
      sourceHostMode,
      sourceHostUrl,
      sourceOwner,
      sourceProvider,
    ],
  );
  const selectedProviderCount = selectedProviders.length;
  const sourceReady = sourceHostMode === "hosted" || sourceHostUrl.trim().length > 0;
  const clisReady = selectedProviderFilterCliIds.length > 0;
  const providersReady = selectedProviderCount > 0;
  const harnessReady = harness !== null;
  const canContinue = sourceReady && clisReady && harnessReady && providersReady;
  const canStart = canContinue;
  const selectedCliNames = useMemo(
    () => AI_CLIS.filter((cli) => selectedCliIds[cli.id]).map((cli) => cli.name),
    [selectedCliIds],
  );
  const selectedProviderSummaries = useMemo(
    () =>
      selectedProviders.map((provider) => ({
        id: provider.id,
        label: `${provider.name} / ${(selectedModels[provider.id] ?? [provider.models[0]]).length} models`,
      })),
    [selectedModels, selectedProviders],
  );
  const configuredToolKeyCount = useMemo(
    () =>
      TOOL_API_KEYS.filter((tool) => (toolApiKeys[tool.name] ?? "").trim().length > 0).length,
    [toolApiKeys],
  );

  const refreshMetrics = useCallback(async () => {
    if (isLocalStackBootstrapPreview()) {
      setMetrics({ status: "unavailable", report: null });
      return;
    }
    if (metricsInFlight.current) return;

    metricsInFlight.current = true;
    setMetrics((current) =>
      current.report ? current : { status: "checking", report: current.report },
    );

    try {
      const report = await invokeTauri<LocalStackResourceMetricsReport>(
        "local_stack_resource_metrics",
      );
      setMetrics({ status: "ready", report });
    } catch {
      setMetrics((current) =>
        current.report ? current : { status: "unavailable", report: null },
      );
    } finally {
      metricsInFlight.current = false;
    }
  }, []);

  const persistSourceConnection = useCallback(async () => {
    if (!isTauriCommandAvailable()) return;

    const owner = setupProfile.source.owner;
    if (!owner) return;

    const plan = await prepareScmProvisioning({
      provider: setupProfile.source.provider,
      owner,
      displayName: `${SOURCE_LABELS[sourceProvider]} ${owner}`,
      connectionId: setupProfile.source.connectionId,
      baseUrl: setupProfile.source.baseUrl,
      repositorySelection: "selected",
    });

    await saveScmConnection(plan.connection);
  }, [setupProfile.source, sourceProvider]);

  const runBootstrap = useCallback(async () => {
    setState("checking");
    setError(null);
    setPreviewBanner(null);
    setMetrics({ status: "idle", report: null });
    lastMetricsProgress.current = 0;
    setProgress({
      stage: "credentials",
      message: "Saving setup choices...",
      progress: 4,
    });
    void refreshMetrics();

    if (isLocalStackBootstrapPreview()) {
      try {
        setProgress({
          stage: "credentials",
          message: "[Preview] Saving choices (skipped on web)",
          progress: 10,
        });
        await delay(240);
        setProgress({
          stage: "runtime",
          message: "[Preview] Skipping Rust / Kind bootstrap",
          progress: 55,
        });
        await delay(280);
        setProgress({
          stage: "ready",
          message: "[Preview] Would launch from desktop shell",
          progress: 100,
        });
        await delay(220);
        setPreviewBanner(
          "Preview mode only — no provisioning ran. Use the desktop app for a real bootstrap; use npm run web:dev for the main shell.",
        );
        setState("credentials");
        setSetupScreen("harness");
      } catch (err) {
        setError(String(err));
        setState("failed");
      }
      return;
    }

    try {
      await persistSourceConnection();
      setProgress({
        stage: "runtime",
        message: "Installing dependencies...",
        progress: 8,
      });
      await invokeTauri("bootstrap_local_stack", {
        request: buildBootstrapRequest(
          sourceProvider,
          sourceOwner,
          githubForm.token,
          toolApiKeys,
          setupProfile,
        ),
      });
      void refreshMetrics();
      setProgress({
        stage: "ready",
        message: "Launching Codex App...",
        progress: 100,
      });
      setState("ready");
    } catch (err) {
      setError(String(err));
      setState("failed");
    }
  }, [
    githubForm.token,
    persistSourceConnection,
    refreshMetrics,
    setupProfile,
    sourceOwner,
    sourceProvider,
    toolApiKeys,
  ]);

  useEffect(() => {
    if (isLocalStackBootstrapPreview()) return;

    let unlisten: (() => void) | undefined;

    listenTauri<BootstrapProgress>("local-stack-progress", (event) => {
      setProgress(event.payload);
    })
      .then((handler) => {
        unlisten = handler;
      })
      .catch(() => undefined);

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (loadedDefaults.current) return;
    loadedDefaults.current = true;
    let cancelled = false;

    void invokeTauri<LocalStackBootstrapDefaults>("local_stack_bootstrap_defaults")
      .then((defaults) => {
        if (cancelled) return;
        setGithubForm({
          enabled: true,
          token: defaults.github.token,
          tokenSource: defaults.github.tokenSource,
          owner: defaults.github.owner || "5dlabs",
          ownerSource: defaults.github.ownerSource,
        });
        setSourceOwner(defaults.github.owner || "5dlabs");
        setToolApiKeys((current) => {
          const next = { ...current };
          for (const tool of TOOL_API_KEYS) {
            if (toolKeyTouched.current[tool.name]) continue;
            next[tool.name] = defaults.toolKeys?.[tool.name]?.value ?? "";
          }
          return next;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`Could not read bootstrap defaults: ${String(err)}`);
        }
      })
      .finally(() => {
        if (cancelled) return;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const allowed = new Set(providerOptions.map((provider) => provider.id));
    setSelectedProviderIds((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => allowed.has(id as AiProviderId)),
      ) as Partial<Record<AiProviderId, true>>;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    setSelectedModels((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => allowed.has(id as AiProviderId)),
      ) as Partial<Record<AiProviderId, string[]>>;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [providerOptions]);

  useEffect(() => {
    if (state !== "checking" || progress.progress < 30) return;
    if (progress.progress - lastMetricsProgress.current < 25) return;

    lastMetricsProgress.current = progress.progress;
    void refreshMetrics();
  }, [progress.progress, refreshMetrics, state]);

  if (state === "ready" && !isLocalStackBootstrapPreview()) {
    return <>{children}</>;
  }

  const metricItems = buildMetricsItems(metrics);
  const isIntro = state === "credentials" && setupScreen === "intro";
  const isCredentialSetup = state === "credentials" && setupScreen !== "intro";
  const bars = (
    <div className="local-bootstrap__bars" aria-hidden="true">
      {Array.from({ length: 20 }).map((_, index) => (
        <span key={index} style={{ animationDelay: `${index * 70}ms` }} />
      ))}
    </div>
  );

  return (
    <div className="local-bootstrap" role="status" aria-live="polite">
      <div className="local-bootstrap__grid" />
      <div className="local-bootstrap__scan" />
      <div className="local-bootstrap__field" />

      <main
        className={`local-bootstrap__content${
          isIntro ? " local-bootstrap__content--intro" : " local-bootstrap__content--setup"
        }`}
      >
        <section
          className={`local-bootstrap__machine${
            isIntro ? " local-bootstrap__machine--hero" : " local-bootstrap__machine--ambient"
          }`}
          role={isIntro ? "button" : undefined}
          tabIndex={isIntro ? 0 : undefined}
          title={isIntro ? "Start setup" : undefined}
          aria-hidden={isIntro ? undefined : true}
          aria-label={isIntro ? "Start setup" : undefined}
          onClick={
            isIntro
              ? () => {
                  setPreviewBanner(null);
                  setSetupScreen("profiles");
                }
              : undefined
          }
          onKeyDown={
            isIntro
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setPreviewBanner(null);
                    setSetupScreen("profiles");
                  }
                }
              : undefined
          }
        >
          <div className="local-bootstrap__ring local-bootstrap__ring--outer" />
          <div className="local-bootstrap__ring local-bootstrap__ring--mid" />
          <div className="local-bootstrap__ring local-bootstrap__ring--inner" />
          <div className="local-bootstrap__core local-bootstrap__core--logo">
            <img
              className="local-bootstrap__logo"
              src={fiveDLabsLogo}
              alt="5D Labs"
              draggable={false}
            />
          </div>
        </section>

        {isIntro ? bars : null}

        <section
          className={`local-bootstrap__copy${
            isIntro ? " local-bootstrap__copy--intro" : " local-bootstrap__copy--wizard"
          }`}
        >
          <div className="local-bootstrap__eyebrow">5D Labs local stack</div>
          {previewBanner ? (
            <div className="local-bootstrap__preview-banner" role="status">
              {previewBanner}
            </div>
          ) : null}
          <h1>
            {state === "credentials"
              ? setupScreen === "intro"
                ? "Local stack"
                : setupScreen === "profiles"
                  ? "Setup"
                  : setupScreen === "tools"
                    ? "Tool keys"
                    : "Harness"
              : "Installing"}
          </h1>

          {isIntro ? (
            <div key="intro" className="local-bootstrap__stage local-bootstrap__stage--intro">
              <div className="local-bootstrap__actions local-bootstrap__actions--intro">
                <button
                  className="primary-btn"
                  type="button"
                  title="Configure source, CLI agents, providers, and harness"
                  onClick={() => {
                    setPreviewBanner(null);
                    setSetupScreen("profiles");
                  }}
                >
                  Start setup
                </button>
              </div>
              {error ? <div className="local-bootstrap__inline-error">{error}</div> : null}
            </div>
          ) : isCredentialSetup ? (
            <div
              key={setupScreen}
              className={`local-bootstrap__stage local-bootstrap__stage--${setupScreen}`}
            >
              {setupScreen === "profiles" ? (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--profiles">
                  <section className="local-bootstrap__panel" title="Repository host and namespace">
                    <div className="local-bootstrap__panel-title">Source</div>
                    <div className="local-bootstrap__choice-grid local-bootstrap__choice-grid--two">
                      {SOURCE_OPTIONS.map((source) => {
                        const SourceIcon = source.icon;
                        return (
                          <button
                            key={source.id}
                            type="button"
                            title={source.summary}
                            className={`local-bootstrap__choice${
                              sourceProvider === source.id ? " is-selected" : ""
                            }`}
                            onClick={() => {
                              setSourceProvider(source.id);
                              setSourceHostUrl(SOURCE_DEFAULT_URLS[source.id]);
                            }}
                          >
                            <span className="local-bootstrap__brand-mark">
                              <SourceIcon size={16} />
                            </span>
                            <strong>{source.name}</strong>
                          </button>
                        );
                      })}
                    </div>
                    <div className="field">
                      <span className="field__label">Host</span>
                      <div className="local-bootstrap__host-toggle">
                        <button
                          type="button"
                          className={`local-bootstrap__host-choice${
                            sourceHostMode === "hosted" ? " is-selected" : ""
                          }`}
                          onClick={() => {
                            setSourceHostMode("hosted");
                            setSourceHostEditing(false);
                          }}
                        >
                          <span className="local-bootstrap__host-dot" />
                          <span>Hosted</span>
                        </button>
                        {sourceHostEditing ? (
                          <input
                            className="local-bootstrap__host-input"
                            title="Enterprise base URL"
                            autoFocus
                            value={sourceHostUrl}
                            onBlur={() => setSourceHostEditing(false)}
                            onChange={(event) => setSourceHostUrl(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                setSourceHostEditing(false);
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className={`local-bootstrap__host-choice local-bootstrap__host-choice--self${
                              sourceHostMode === "self-hosted" ? " is-selected" : ""
                            }`}
                            title={
                              sourceHostMode === "self-hosted"
                                ? sourceHostUrl
                                : "Configure self-hosted source"
                            }
                            onClick={() => {
                              setSourceHostMode("self-hosted");
                              setSourceHostEditing(true);
                            }}
                          >
                            <span className="local-bootstrap__host-dot" />
                            <span>
                              {sourceHostMode === "self-hosted"
                                ? sourceHostUrl || "Self-hosted URL"
                                : "Self-hosted"}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="local-bootstrap__panel" title="ACP CLIs">
                    <div className="local-bootstrap__panel-title">ACP CLIs</div>
                    <div className="local-bootstrap__choice-grid local-bootstrap__choice-grid--two">
                      {AI_CLIS.map((cli) => {
                        const CliIcon = cli.icon;
                        return (
                          <button
                            key={cli.id}
                            type="button"
                            title={cli.summary}
                            className={`local-bootstrap__choice${
                              selectedCliIds[cli.id] ? " is-selected" : ""
                            }`}
                            onClick={() =>
                              setSelectedCliIds((current) => {
                                const next = { ...current };
                                if (next[cli.id]) {
                                  delete next[cli.id];
                                } else {
                                  next[cli.id] = true;
                                }
                                return next;
                              })
                            }
                          >
                            <span className="local-bootstrap__brand-mark">
                              <CliIcon size={16} />
                            </span>
                            <strong>{cli.name}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="local-bootstrap__panel" title="Harness agent">
                    <div className="local-bootstrap__panel-title">Harnesses</div>
                    <div className="local-bootstrap__choice-grid local-bootstrap__choice-grid--two">
                      {HARNESSES.map((item) => {
                        const HarnessIcon = item.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            title={item.summary}
                            className={`local-bootstrap__choice${
                              harness === item.id ? " is-selected" : ""
                            }`}
                            onClick={() => setHarness(item.id)}
                          >
                            <span className="local-bootstrap__brand-mark">
                              <HarnessIcon size={16} />
                            </span>
                            <strong>{item.name}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="local-bootstrap__panel" title="Provider and model profiles">
                    <div className="local-bootstrap__panel-title">Providers</div>
                    <div className="local-bootstrap__provider-list">
                      {providerOptions.length === 0 ? (
                        <div
                          className="local-bootstrap__empty-state"
                          title="Select one or more CLI agents first"
                        >
                          Pick a CLI
                        </div>
                      ) : null}
                      {providerOptions.map((provider) => {
                        const ProviderIcon = provider.icon;
                        const selected = Boolean(selectedProviderIds[provider.id]);
                        const selectedModelList = selectedModels[provider.id] ?? [
                          provider.models[0],
                        ];
                        return (
                          <article
                            className={`local-bootstrap__provider-card${
                              selected ? " is-selected" : ""
                            }`}
                            key={provider.id}
                          >
                            <button
                              type="button"
                              title={provider.summary}
                              className="local-bootstrap__provider-main"
                              onClick={() => {
                                setSelectedProviderIds((current) => {
                                  const next = { ...current };
                                  if (next[provider.id]) {
                                    delete next[provider.id];
                                  } else {
                                    next[provider.id] = true;
                                  }
                                  return next;
                                });
                                 if (!selected) {
                                   setSelectedModels((models) => ({
                                     ...models,
                                     [provider.id]: selectedModelList,
                                   }));
                                 }
                               }}
                            >
                              <span className="local-bootstrap__brand-mark">
                                <ProviderIcon size={16} />
                              </span>
                              <strong>{provider.name}</strong>
                              <em>{providerAuthLabel(provider.auth)}</em>
                            </button>
                            {selected ? (
                              <div className="local-bootstrap__model-row">
                                 {provider.models.map((model) => (
                                   <button
                                     key={model}
                                     type="button"
                                     className={
                                       selectedModelList.includes(model) ? "is-selected" : ""
                                     }
                                     onClick={() =>
                                       setSelectedModels((current) => {
                                         const currentModels = current[provider.id] ?? [
                                           provider.models[0],
                                         ];
                                         if (currentModels.includes(model)) {
                                           if (currentModels.length === 1) return current;
                                           return {
                                             ...current,
                                             [provider.id]: currentModels.filter(
                                               (selectedModel) => selectedModel !== model,
                                             ),
                                           };
                                         }

                                         return {
                                           ...current,
                                           [provider.id]: [...currentModels, model],
                                         };
                                       })
                                     }
                                   >
                                     {model}
                                   </button>
                                ))}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  {error ? <div className="local-bootstrap__inline-error">{error}</div> : null}

                  <div className="local-bootstrap__actions local-bootstrap__actions--onepage">
                    <button
                      className="ghost-btn"
                      type="button"
                      title="Back to intro"
                      onClick={() => setSetupScreen("intro")}
                    >
                      Back
                    </button>
                    <button
                      className="primary-btn"
                      type="button"
                      title="Configure tool API keys"
                      disabled={!canContinue}
                      onClick={() => setSetupScreen("tools")}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : setupScreen === "tools" ? (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--tools">
                  <section className="local-bootstrap__panel" title="Common MCP tool API keys">
                    <div className="local-bootstrap__panel-title">Tool API keys</div>
                    <div className="local-bootstrap__tool-key-list">
                      {TOOL_API_KEYS.map((tool) => {
                        const ToolIcon = tool.icon;
                        const value = toolApiKeys[tool.name] ?? "";
                        return (
                          <label
                            key={tool.name}
                            className="local-bootstrap__tool-key"
                            title={tool.summary}
                          >
                            <span className="local-bootstrap__tool-key-heading">
                              <span className="local-bootstrap__brand-mark">
                                <ToolIcon size={16} />
                              </span>
                              <span>
                                <strong>{tool.label}</strong>
                                <em>{tool.name}</em>
                              </span>
                            </span>
                            <input
                              className="field__input"
                              type="password"
                              autoComplete="off"
                              placeholder={tool.placeholder}
                              value={value}
                              onChange={(event) => {
                                toolKeyTouched.current[tool.name] = true;
                                setToolApiKeys((current) => ({
                                  ...current,
                                  [tool.name]: event.target.value,
                                }));
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>

                  <section className="local-bootstrap__panel" title="Kind secret routing">
                    <div className="local-bootstrap__panel-title">Kind routing</div>
                    <div className="local-bootstrap__summary-list">
                      <div>
                        <span>Secret</span>
                        <strong>cto-system/cto-agent-keys</strong>
                      </div>
                      <div>
                        <span>MCP route</span>
                        <strong>cto-tools /mcp</strong>
                      </div>
                      <div>
                        <span>Configured</span>
                        <strong>
                          {configuredToolKeyCount} of {TOOL_API_KEYS.length}
                        </strong>
                      </div>
                    </div>
                    <div className="local-bootstrap__hint-row">
                      These stay in the local Kind cluster and feed cto-tools plus OpenCLAW web
                      research providers. Leave a key blank to add it later.
                    </div>
                  </section>

                  {error ? <div className="local-bootstrap__inline-error">{error}</div> : null}

                  <div className="local-bootstrap__actions local-bootstrap__actions--onepage">
                    <button
                      className="ghost-btn"
                      type="button"
                      title="Back to profiles"
                      onClick={() => setSetupScreen("profiles")}
                    >
                      Back
                    </button>
                    <button
                      className="primary-btn"
                      type="button"
                      title="Start local stack"
                      disabled={!canContinue}
                      onClick={() => void runBootstrap()}
                    >
                      Start
                    </button>
                  </div>
                </div>
              ) : (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--harness">
                  <section className="local-bootstrap__panel" title="Selected profiles">
                    <div className="local-bootstrap__panel-title">Profiles</div>
                    <div className="local-bootstrap__summary-list">
                      <div>
                        <span>CLI agents</span>
                        <strong>{selectedCliNames.join(", ")}</strong>
                      </div>
                      <div>
                        <span>Providers</span>
                        <strong>
                          {selectedProviderSummaries.map((item) => item.label).join(", ")}
                        </strong>
                      </div>
                      <div>
                        <span>Tool keys</span>
                        <strong>
                          {configuredToolKeyCount} of {TOOL_API_KEYS.length}
                        </strong>
                      </div>
                    </div>
                  </section>

                  <section className="local-bootstrap__panel" title="ACP harness agent">
                    <div className="local-bootstrap__panel-title">Harness</div>
                    <div className="local-bootstrap__choice-grid local-bootstrap__choice-grid--two">
                      {HARNESSES.map((item) => {
                        const HarnessIcon = item.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            title={item.summary}
                            className={`local-bootstrap__choice local-bootstrap__choice--large${
                              harness === item.id ? " is-selected" : ""
                            }`}
                            onClick={() => setHarness(item.id)}
                          >
                            <span className="local-bootstrap__brand-mark local-bootstrap__brand-mark--large">
                              <HarnessIcon size={22} />
                            </span>
                            <strong>{item.name}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {error ? <div className="local-bootstrap__inline-error">{error}</div> : null}

                  <div className="local-bootstrap__actions local-bootstrap__actions--onepage">
                    <button
                      className="ghost-btn"
                      type="button"
                      title="Back to tool keys"
                      onClick={() => setSetupScreen("tools")}
                    >
                      Back
                    </button>
                    <button
                      className="primary-btn"
                      type="button"
                      title="Start local stack"
                      disabled={!canStart}
                      onClick={() => void runBootstrap()}
                    >
                      Start
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <p>
                {state === "failed"
                  ? "Setup needs attention before the app can launch."
                  : progress.message}
              </p>
              <div className="local-bootstrap__progress">
                <div className="local-bootstrap__progress-track">
                  <span
                    style={{ width: `${Math.max(4, Math.min(100, progress.progress))}%` }}
                  />
                </div>
                <div className="local-bootstrap__progress-meta">
                  <span>{progress.stage}</span>
                  <span>{progress.progress}%</span>
                </div>
              </div>
            </>
          )}

          {state === "failed" ? (
            <div className="local-bootstrap__error">
              <pre>{error}</pre>
              <button type="button" onClick={() => void runBootstrap()}>
                Retry setup
              </button>
            </div>
          ) : state !== "credentials" ? (
            <div className="local-bootstrap__steps">
              {metricItems.map((item) => (
                <span key={item.label}>
                  {item.label}: {item.value}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
