import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  prepareScmProvisioning,
  saveScmConnection,
  slugifyConnectionId,
  type ScmProvider,
} from "../api/sourceControlProvisioning";
import { shouldSkipLocalStackBootstrap } from "../runtime";
import {
  IconBolt,
  IconBracket,
  IconCloud,
  IconCommand,
  IconCpu,
  IconDatabase,
  IconGit,
  IconGlobe,
  IconPackage,
  IconPuzzle,
  IconRadio,
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
type SetupScreen = "intro" | "profiles" | "harness";
type HarnessId = "openclaw" | "hermes";
type AiCliId =
  | "openclaw"
  | "codex"
  | "claudeCode"
  | "geminiCli"
  | "opencode"
  | "qwenCode"
  | "githubCli"
  | "gitlabCli";
type AiProviderId = string;

type BootstrapGithubDefaults = {
  token: string;
  tokenSource?: string | null;
  owner: string;
  ownerSource?: string | null;
};

type LocalStackBootstrapDefaults = {
  github: BootstrapGithubDefaults;
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
  setup?: BootstrapSetupProfile;
};

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
    icon: IconGit,
    summary: "GitHub repository namespace.",
  },
  {
    id: "gitlab",
    name: "GitLab",
    icon: IconGit,
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
    name: "OpenCLAW",
    icon: IconPuzzle,
    summary: "ACP harness agent for the selected CLI/provider profiles.",
  },
  {
    id: "hermes",
    name: "Hermes",
    icon: IconRadio,
    summary: "Hermes harness agent for the selected CLI/provider profiles.",
  },
];

const AI_CLIS: AiCliOption[] = [
  {
    id: "openclaw",
    name: "OpenCLAW",
    icon: IconPuzzle,
    summary: "Reference provider vocabulary and broad ACP profile import.",
  },
  {
    id: "codex",
    name: "Codex",
    icon: IconCommand,
    summary: "ChatGPT sign-in or OpenAI Responses profiles.",
  },
  {
    id: "claudeCode",
    name: "Claude Code",
    icon: IconTerminal,
    summary: "Claude subscription, Console key, Bedrock, or Vertex.",
  },
  {
    id: "geminiCli",
    name: "Gemini CLI",
    icon: IconSparkles,
    summary: "Google login, Gemini API key, or Vertex ADC.",
  },
  {
    id: "opencode",
    name: "OpenCode",
    icon: IconBracket,
    summary: "Models.dev broker and provider connections.",
  },
  {
    id: "qwenCode",
    name: "Qwen Code",
    icon: IconBolt,
    summary: "Qwen plus OpenAI, Anthropic, Gemini, and local profiles.",
  },
  {
    id: "githubCli",
    name: "GitHub CLI",
    icon: IconGit,
    summary: "Source-control helper; does not filter AI providers.",
    sourceControlOnly: true,
  },
  {
    id: "gitlabCli",
    name: "GitLab CLI",
    icon: IconShield,
    summary: "Source-control helper; does not filter AI providers.",
    sourceControlOnly: true,
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
    cliIds: ["openclaw", "claudeCode", "opencode", "qwenCode"],
    models: ["Opus 4.7", "Sonnet 4.6", "Haiku 4.5"],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: IconCommand,
    summary: "Responses-capable OpenAI and Codex routes.",
    auth: "oauth",
    cliIds: ["openclaw", "codex", "opencode", "qwenCode"],
    models: ["GPT-5.5", "GPT-5.4", "GPT-5.3 Codex"],
  },
  {
    id: "google-gemini",
    name: "Google Gemini",
    icon: IconSparkles,
    summary: "Gemini API and Google account auth.",
    auth: "oauth",
    cliIds: ["openclaw", "geminiCli", "opencode", "qwenCode"],
    models: ["Gemini 3", "Gemini 2.5 Pro", "Gemini Flash"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: IconGlobe,
    summary: "Brokered model catalog with API key routing.",
    auth: "api-key",
    cliIds: ["openclaw", "opencode", "qwenCode"],
    models: OPENROUTER_MODELS,
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    icon: IconCloud,
    summary: "AWS IAM/SigV4 for Claude and other Bedrock models.",
    auth: "cloud",
    cliIds: ["openclaw", "claudeCode", "codex", "opencode"],
    models: ["Claude", "Nova", "Llama", "Cohere"],
  },
  {
    id: "vertex-ai",
    name: "Vertex AI",
    icon: IconPackage,
    summary: "Google cloud credentials, Gemini, and partner Model Garden.",
    auth: "cloud",
    cliIds: ["openclaw", "claudeCode", "geminiCli", "opencode"],
    models: ["Gemini", "Claude", "Imagen", "Veo"],
  },
  {
    id: "ollama",
    name: "Ollama",
    icon: IconCpu,
    summary: "Local model runtime with optional OpenAI-compatible endpoint.",
    auth: "local",
    cliIds: ["openclaw", "codex", "opencode", "qwenCode"],
    models: ["Local tags", "Qwen", "Llama", "DeepSeek"],
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    icon: IconDatabase,
    summary: "Local OpenAI/Anthropic-compatible runtime.",
    auth: "local",
    cliIds: ["openclaw", "codex", "claudeCode", "opencode", "qwenCode"],
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
  setup: BootstrapSetupProfile,
): BootstrapLocalStackRequest {
  if (sourceProvider !== "github") {
    return { github: { enabled: false }, setup };
  }

  return {
    github: {
      enabled: true,
      token: githubToken.trim() || undefined,
      owner: sourceOwner.trim() || undefined,
    },
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
  const [sourceOwner, setSourceOwner] = useState("5dlabs");
  const [harness, setHarness] = useState<HarnessId | null>(null);
  const [selectedCliIds, setSelectedCliIds] = useState<Partial<Record<AiCliId, true>>>({});
  const [selectedProviderIds, setSelectedProviderIds] =
    useState<Partial<Record<AiProviderId, true>>>({});
  const [selectedModels, setSelectedModels] = useState<Partial<Record<AiProviderId, string[]>>>({});
  const [progress, setProgress] = useState<BootstrapProgress>({
    stage: "credentials",
    message: "Preparing setup...",
    progress: 4,
  });
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsState>({ status: "idle", report: null });
  const [githubForm, setGithubForm] = useState<BootstrapGithubForm>({
    enabled: true,
    token: "",
    tokenSource: null,
    owner: "5dlabs",
    ownerSource: null,
  });
  const loadedDefaults = useRef(false);
  const sourceOwnerTouched = useRef(false);
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
  const sourceReady =
    sourceOwner.trim().length > 0 &&
    (sourceHostMode === "hosted" || sourceHostUrl.trim().length > 0);
  const clisReady = selectedProviderFilterCliIds.length > 0;
  const providersReady = selectedProviderCount > 0;
  const canContinue = sourceReady && clisReady && providersReady;
  const canStart = canContinue && harness !== null;
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

  const refreshMetrics = useCallback(async () => {
    if (metricsInFlight.current) return;

    metricsInFlight.current = true;
    setMetrics((current) =>
      current.report ? current : { status: "checking", report: current.report },
    );

    try {
      const report = await invoke<LocalStackResourceMetricsReport>("local_stack_resource_metrics");
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
    setMetrics({ status: "idle", report: null });
    lastMetricsProgress.current = 0;
    setProgress({
      stage: "credentials",
      message: "Saving setup choices...",
      progress: 4,
    });
    void refreshMetrics();

    try {
      await persistSourceConnection();
      setProgress({
        stage: "runtime",
        message: "Installing dependencies...",
        progress: 8,
      });
      await invoke("bootstrap_local_stack", {
        request: buildBootstrapRequest(sourceProvider, sourceOwner, githubForm.token, setupProfile),
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
  ]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<BootstrapProgress>("local-stack-progress", (event) => {
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

    void invoke<LocalStackBootstrapDefaults>("local_stack_bootstrap_defaults")
      .then((defaults) => {
        if (cancelled) return;
        setGithubForm({
          enabled: true,
          token: defaults.github.token,
          tokenSource: defaults.github.tokenSource,
          owner: defaults.github.owner || "5dlabs",
          ownerSource: defaults.github.ownerSource,
        });
        if (!sourceOwnerTouched.current) {
          setSourceOwner(defaults.github.owner || "5dlabs");
        }
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

  if (state === "ready") {
    return <>{children}</>;
  }

  const metricItems = buildMetricsItems(metrics);
  const isIntro = state === "credentials" && setupScreen === "intro";
  const isCredentialSetup = state === "credentials" && setupScreen !== "intro";

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
          onClick={isIntro ? () => setSetupScreen("profiles") : undefined}
          onKeyDown={
            isIntro
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSetupScreen("profiles");
                  }
                }
              : undefined
          }
        >
          <div className="local-bootstrap__ring local-bootstrap__ring--outer" />
          <div className="local-bootstrap__ring local-bootstrap__ring--mid" />
          <div className="local-bootstrap__ring local-bootstrap__ring--inner" />
          <div className="local-bootstrap__core">5D</div>
          <div className="local-bootstrap__bars">
            {Array.from({ length: 20 }).map((_, index) => (
              <span key={index} style={{ animationDelay: `${index * 70}ms` }} />
            ))}
          </div>
        </section>

        <section
          className={`local-bootstrap__copy${
            isIntro ? " local-bootstrap__copy--intro" : " local-bootstrap__copy--wizard"
          }`}
        >
          <div className="local-bootstrap__eyebrow">5D Labs local stack</div>
          <h1>
            {state === "credentials"
              ? setupScreen === "intro"
                ? "Local stack"
                : setupScreen === "profiles"
                  ? "Setup"
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
                  onClick={() => setSetupScreen("profiles")}
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
                    <label className="field">
                      <span className="field__label">Host</span>
                      <select
                        className="field__input"
                        title="Hosted or self-hosted"
                        value={sourceHostMode}
                        onChange={(event) =>
                          setSourceHostMode(event.target.value as SourceHostMode)
                        }
                      >
                        <option value="hosted">Hosted</option>
                        <option value="self-hosted">Self-hosted</option>
                      </select>
                    </label>
                    <label className="field">
                      <span className="field__label">
                        {sourceProvider === "github" ? "Owner" : "Group"}
                      </span>
                      <input
                        className="field__input"
                        title="Repository namespace"
                        autoComplete="organization"
                        value={sourceOwner}
                        onChange={(event) => {
                          sourceOwnerTouched.current = true;
                          setSourceOwner(event.target.value);
                          setGithubForm((current) => ({
                            ...current,
                            owner: event.target.value,
                            ownerSource: null,
                          }));
                        }}
                      />
                    </label>
                    {sourceHostMode === "self-hosted" ? (
                      <label className="field">
                        <span className="field__label">URL</span>
                        <input
                          className="field__input"
                          title="Enterprise base URL"
                          value={sourceHostUrl}
                          onChange={(event) => setSourceHostUrl(event.target.value)}
                        />
                      </label>
                    ) : null}
                  </section>

                  <section className="local-bootstrap__panel" title="CLI agents launched by ACP">
                    <div className="local-bootstrap__panel-title">CLI agents</div>
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
                      title="Choose harness"
                      disabled={!canContinue}
                      onClick={() => setSetupScreen("harness")}
                    >
                      Continue
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
                      title="Back to profiles"
                      onClick={() => setSetupScreen("profiles")}
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
