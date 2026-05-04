import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactNode,
} from "react";
import fiveDLabsLogo from "../assets/5d-labs-mark.png";
import {
  prepareOriginTransfer,
  prepareScmProvisioning,
  provisionOriginApplication,
  saveScmConnection,
  slugifyConnectionId,
  type OriginTransferPlan,
  type ScmProvider,
} from "../api/sourceControlProvisioning";
import { invokeTauri, isTauriCommandAvailable, listenTauri, openExternalUrl } from "../api/tauri";
import { isLocalStackBootstrapPreview, shouldSkipLocalStackBootstrap } from "../runtime";
import { VoiceClient } from "./VoiceClient";
import {
  IconClaude,
  IconChevLeft,
  IconChevRight,
  IconCloud,
  IconCpu,
  IconCursor,
  IconDatabase,
  Icon5DOriginMono,
  IconGitHub,
  IconGiteaMono,
  IconGitLab,
  IconGlobe,
  IconKey,
  IconOpenClaw,
  IconOpenAI,
  IconPackage,
  IconRefresh,
  IconSearch,
  IconShield,
  IconSparkles,
  IconTerminal,
  IconVolume,
  IconVolumeOff,
  type IconProps,
} from "../views/icons";

type BootstrapProgress = {
  stage: string;
  message: string;
  progress: number;
};

type AudioOutputStatus = {
  hasOutputDevice: boolean;
  outputDeviceName: string | null;
  outputVolumePercent: number | null;
  outputMuted: boolean | null;
  warning: string | null;
};

type CaptionCue = {
  start: number;
  end: number;
  text: string;
};

type BootstrapState = "credentials" | "checking" | "ready" | "failed";
type DependencyPrepState = "idle" | "running" | "ready" | "failed";
type SourceHostMode = "hosted" | "self-hosted";
type SourceOriginEngine = "standard" | "gitlab-compatible";
type SourceAuthMode =
  | "github-oauth"
  | "github-pat"
  | "github-enterprise-app"
  | "gitlab-token"
  | "gitlab-instance-oauth-app";
type SetupScreen =
  | "intro"
  | "source"
  | "harness"
  | "clis"
  | "profiles"
  | "provider-models"
  | "harness-routing"
  | "provider-auth"
  | "tools"
  | "agent-tokens";
const MORGAN_PORTRAIT_SRC = "/uploads/morgan-portrait.jpg";
const MORGAN_VIDEO_SCREENS: ReadonlySet<SetupScreen> = new Set([
  "intro",
  "source",
  "harness",
  "clis",
  "profiles",
  "provider-models",
  "harness-routing",
  "provider-auth",
  "tools",
  "agent-tokens",
]);
const MORGAN_MEDIA_SCREEN_SLUG: Record<SetupScreen, string> = {
  intro: "01_intro",
  source: "02_source",
  harness: "03_harness",
  clis: "04_clis",
  profiles: "05_providers",
  "provider-models": "06_provider-models",
  "harness-routing": "07_harness-routing",
  "provider-auth": "07_provider-auth",
  tools: "08_tools",
  "agent-tokens": "09_agent-tokens",
};
const MORGAN_INSTALL_MEDIA_SLUG = "10_install-start";
const INTRO_ADVANCE_FALLBACK_MS = 18_000;
const GITHUB_OAUTH_UI_TIMEOUT_MS = 120_000;
type HarnessId = "openclaw" | "hermes";
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
type DiscordAgentId =
  | "morgan"
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
  | "glitch";

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

type ResetLocalStackBootstrapReport = {
  removedSetupProfile: boolean;
  deletedKindCluster: boolean;
};

type BootstrapToolKeyDefault = {
  value: string;
  valueSource?: string | null;
};

type GitHubCliOAuthResult = {
  token: string;
  username?: string | null;
  accounts?: GitHubCliAccount[];
};

type GitHubCliAccount = {
  login: string;
  kind: "user" | "organization";
};

type GitHubCliOAuthPrompt = {
  message: string;
  verificationUri?: string | null;
  userCode?: string | null;
  copiedToClipboard: boolean;
  clipboardError?: string | null;
};

type BootstrapGithubForm = {
  enabled: boolean;
  token: string;
  tokenSource?: string | null;
  owner: string;
  ownerSource?: string | null;
};

type SourceCredentialForm = {
  token: string;
};

type BootstrapLocalStackRequest = {
  github?: {
    enabled: boolean;
    token?: string;
    owner?: string;
  };
  scm?: {
    provider?: ScmProvider;
    token?: string;
    githubAppSecretManifest?: string;
  };
  tools?: {
    apiKeys: Array<{
      name: ToolApiKeyName;
      value: string;
    }>;
  };
  providers?: {
    credentials: BootstrapProviderCredential[];
  };
  agents?: {
    discordTokens: Array<{
      id: DiscordAgentId;
      enabled: boolean;
      token?: string;
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
    routing?: BootstrapHarnessRouting;
  };
  agents: Array<{
    id: DiscordAgentId;
    enabled: boolean;
  }>;
};

type BootstrapHarnessRouting = {
  primary: BootstrapModelRoute;
  fallbacks: BootstrapModelRoute[];
};

type BootstrapModelRoute = {
  providerId: AiProviderId;
  model: string;
};

type BootstrapProviderSelection = {
  id: AiProviderId;
  auth: AiProviderOption["auth"];
  cliIds: AiCliId[];
  model: string;
  models: string[];
};

type BootstrapProviderCredential = {
  providerId: AiProviderId;
  auth: AiProviderOption["auth"];
  secretKey?: string;
  value?: string;
  apiKeySecretKey?: string;
  apiKey?: string;
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
  auth: "oauth" | "api-key" | "cloud" | "gateway" | "local";
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

type NamespaceResourceTotals = {
  namespace?: string;
  pods?: number;
  containers?: number;
  restarts?: number;
};

type ResourceMetricTotals = {
  nodes?: number;
  pods?: number;
  containers?: number;
  restarts?: number;
  byNamespace?: NamespaceResourceTotals[];
  liveUsage?: LiveResourceUsage;
};

type KubernetesPodMetrics = {
  namespace?: string;
  name?: string;
  phase?: string;
  readyContainers?: number;
  totalContainers?: number;
  restarts?: number;
};

type LocalStackResourceMetricsReport = {
  cluster?: MetricsClusterReport;
  runtime?: MetricsRuntimeReport;
  nodes?: unknown[];
  pods?: KubernetesPodMetrics[];
  totals?: ResourceMetricTotals;
};

type MetricsState = {
  status: "idle" | "checking" | "ready" | "unavailable";
  report: LocalStackResourceMetricsReport | null;
};

function nextSetupScreen(screen: SetupScreen): SetupScreen {
  switch (screen) {
    case "intro":
      return "source";
    case "source":
      return "harness";
    case "harness":
      return "clis";
    case "clis":
      return "profiles";
    case "profiles":
      return "provider-models";
    case "provider-models":
      return "harness-routing";
    case "harness-routing":
      return "provider-auth";
    case "provider-auth":
      return "tools";
    case "tools":
      return "agent-tokens";
    case "agent-tokens":
      return "agent-tokens";
  }
}

function previousSetupScreen(screen: SetupScreen): SetupScreen {
  switch (screen) {
    case "intro":
      return "intro";
    case "source":
      return "intro";
    case "harness":
      return "source";
    case "clis":
      return "harness";
    case "profiles":
      return "clis";
    case "provider-models":
      return "profiles";
    case "harness-routing":
      return "provider-models";
    case "provider-auth":
      return "harness-routing";
    case "tools":
      return "provider-auth";
    case "agent-tokens":
      return "tools";
  }
}

function parseTimestampSeconds(raw: string): number | null {
  const match = raw.match(/^(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  const [, hours = "00", minutes, seconds, millis] = match;


  return (
    Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000
  );
}

function parseWebVtt(vtt: string): CaptionCue[] {
  return vtt
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex === -1) return [];

      const [startRaw, endRaw] = lines[timingIndex].split("-->").map((value) => value.trim());
      const start = parseTimestampSeconds(startRaw);
      const end = parseTimestampSeconds(endRaw.split(/\s+/)[0]);
      const text = lines.slice(timingIndex + 1).join(" ");
      if (start === null || end === null || !text) return [];
      return [{ start, end, text }];
    });
}

type MetricsItem = {
  label: string;
  value: string;
};

type ChoiceIcon = ComponentType<IconProps>;

const SOURCE_LABELS: Record<ScmProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "5D Origin",
};

const SOURCE_DEFAULT_URLS: Record<ScmProvider, string> = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
  gitea: "",
};

function defaultAuthModeForSource(provider: ScmProvider, hostMode: SourceHostMode): SourceAuthMode {
  if (provider === "github") {
    return hostMode === "hosted" ? "github-oauth" : "github-enterprise-app";
  }
  if (provider === "gitea") {
    return "gitlab-token";
  }
  return hostMode === "hosted" ? "gitlab-token" : "gitlab-instance-oauth-app";
}

function sourcePrimaryActionLabel(provider: ScmProvider, hostMode: SourceHostMode): string {
  if (provider === "github") {
    return hostMode === "hosted" ? "Install Morgan on GitHub" : "Install Morgan on GitHub Enterprise";
  }
  if (provider === "gitea") {
    return "Prepare 5D Origin";
  }
  return hostMode === "hosted" ? "Install Morgan on GitLab" : "Install Morgan on self-managed GitLab";
}

function sourcePrimaryHelp(provider: ScmProvider, hostMode: SourceHostMode): string {
  if (provider === "github") {
    return hostMode === "hosted"
      ? "Morgan opens the GitHub app install flow, then detects your user, orgs, and repos."
      : "Morgan opens the GitHub Enterprise app flow after confirming the server URL.";
  }
  if (provider === "gitea") {
    return "Morgan prepares 5D Origin for mirrors, private agent jobs, and optional migration.";
  }
  return hostMode === "hosted"
    ? "Morgan opens the GitLab app flow, then detects your groups and projects."
    : "Morgan opens the self-managed GitLab app flow after confirming the server URL.";
}

function sourceAdvancedFallbackLabel(provider: ScmProvider): string {
  return provider === "github" ? "Use a personal access token instead" : "Use a manual token instead";
}

function isManualSourceTokenMode(mode: SourceAuthMode): boolean {
  return mode === "github-pat" || mode === "gitlab-token";
}

function isGitHubManifestMode(mode: SourceAuthMode): boolean {
  return mode === "github-oauth" || mode === "github-enterprise-app";
}

function sourceNamespaceLabel(provider: ScmProvider): string {
  if (provider === "github") return "GitHub owner or org";
  if (provider === "gitea") return "5D Origin namespace";
  return "GitLab namespace, group, or project";
}

function sourceNamespacePlaceholder(provider: ScmProvider): string {
  if (provider === "github") return "5DLabsInc";
  if (provider === "gitea") return "platform";
  return "platform/team";
}

function sourceTokenLabel(provider: ScmProvider): string {
  if (provider === "github") return "GitHub PAT";
  if (provider === "gitea") return "5D Origin bootstrap token";
  return "GitLab access token";
}

function sourceTokenPlaceholder(provider: ScmProvider): string {
  if (provider === "github") return "github_pat_...";
  if (provider === "gitea") return "managed by CTO";
  return "glpat-...";
}

function sourceTokenHelp(provider: ScmProvider): string {
  if (provider === "github") {
    return "The token is written only to the local Kind secret. Use a token with repo creation and contents access for this namespace.";
  }
  if (provider === "gitea") {
    return "Morgan creates the CTO-managed app first; no existing 5D Origin token is required for mirror-first setup.";
  }
  return "The token is written only to the local Kind secret. Use a GitLab project or group access token scoped to the selected namespace.";
}

function sourceConnectionIdForProvider(provider: ScmProvider, owner: string): string {
  return sourceConnectionId(provider, owner);
}

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
    summary: "Agent harness for CTO-managed sessions.",
  },
  {
    id: "hermes",
    name: "Hermes",
    icon: IconSparkles,
    summary: "Agent harness for CTO-managed sessions.",
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

const CODING_DISCORD_AGENTS: Array<{
  id: DiscordAgentId;
  name: string;
  role: string;
  hue: number;
  avatarSrc?: string;
  defaultEnabled: boolean;
}> = [
  {
    id: "morgan",
    name: "Morgan",
    role: "Technical Program Manager",
    hue: 200,
    avatarSrc: "/agents/morgan-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "rex",
    name: "Rex",
    role: "Rust Architect",
    hue: 32,
    avatarSrc: "/agents/rex-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "grizz",
    name: "Grizz",
    role: "Go Specialist",
    hue: 42,
    avatarSrc: "/agents/grizz-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "nova",
    name: "Nova",
    role: "Node.js Engineer",
    hue: 230,
    avatarSrc: "/agents/nova-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "viper",
    name: "Viper",
    role: "Python Specialist",
    hue: 122,
    avatarSrc: "/agents/viper-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "blaze",
    name: "Blaze",
    role: "Web App Developer",
    hue: 18,
    avatarSrc: "/agents/blaze-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "tap",
    name: "Tap",
    role: "Mobile Developer",
    hue: 264,
    avatarSrc: "/agents/tap-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "spark",
    name: "Spark",
    role: "Desktop Developer",
    hue: 48,
    avatarSrc: "/agents/spark-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "cleo",
    name: "Cleo",
    role: "Quality Guardian",
    hue: 172,
    avatarSrc: "/agents/cleo-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "cipher",
    name: "Cipher",
    role: "Security Sentinel",
    hue: 22,
    avatarSrc: "/agents/cipher-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "tess",
    name: "Tess",
    role: "Testing Genius",
    hue: 315,
    avatarSrc: "/agents/tess-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "stitch",
    name: "Stitch",
    role: "Code Reviewer",
    hue: 188,
    avatarSrc: "/agents/stitch-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "atlas",
    name: "Atlas",
    role: "Integration Master",
    hue: 150,
    avatarSrc: "/agents/atlas-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "bolt",
    name: "Bolt",
    role: "Infrastructure & SRE",
    hue: 58,
    avatarSrc: "/agents/bolt-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "block",
    name: "Block",
    role: "Blockchain Specialist",
    hue: 282,
    avatarSrc: "/agents/block-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "vex",
    name: "Vex",
    role: "VR/Unity Developer",
    hue: 340,
    avatarSrc: "/agents/vex-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "angie",
    name: "Angie",
    role: "Agent Builder",
    hue: 195,
    avatarSrc: "/agents/angie-avatar-512.png",
    defaultEnabled: true,
  },
  {
    id: "glitch",
    name: "Glitch",
    role: "Game Developer",
    hue: 102,
    avatarSrc: "/agents/glitch-avatar-512.png",
    defaultEnabled: true,
  },
];

const getAgentFallbackLabel = (name: string) => name.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();

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

const ALL_PROVIDER_CLI_IDS: AiCliId[] = [
  "claude",
  "code",
  "cursor",
  "codex",
  "factory",
  "gemini",
  "copilot",
  "kimi",
];

const LOCAL_PROVIDER_CLI_IDS: AiCliId[] = ["claude", "code", "cursor", "codex", "factory", "kimi"];

const OPENROUTER_MODELS = [
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

const VERCEL_AI_GATEWAY_MODELS = [
  "openai/gpt-5.5",
  "openai/gpt-5.5-pro",
  "openai/gpt-5-codex",
  "anthropic/claude-opus-4.7",
  "anthropic/claude-sonnet-4.6",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-flash",
  "moonshotai/kimi-k2.6",
  "alibaba/qwen-3.6-max-preview",
  "alibaba/qwen3.6-plus",
  "xai/grok-4.20-reasoning-beta",
  "xai/grok-4.20-non-reasoning-beta",
  "zai/glm-5.1",
  "minimax/minimax-m2.7-highspeed",
  "mistralai/mistral-large",
  "perplexity/sonar",
  "amazon/nova-pro",
  "cohere/command-a",
];

const AI_PROVIDERS: AiProviderOption[] = [
  {
    id: "alibaba-model-studio",
    name: "Alibaba Model Studio",
    icon: IconCloud,
    summary: "Alibaba Cloud Model Studio provider routes.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-coder-plus"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    icon: IconSparkles,
    summary: "Claude API and Claude Code subscription auth.",
    auth: "oauth",
    cliIds: ["claude", "code", "cursor", "factory", "copilot", "kimi"],
    models: ["claude-opus-4.7", "claude-sonnet-4.6", "claude-haiku-4.5"],
  },
  {
    id: "arcee-ai",
    name: "Arcee AI",
    icon: IconSparkles,
    summary: "Arcee Trinity and hosted model routes.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["trinity-large-thinking", "caller-large", "spotlight"],
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    icon: IconCloud,
    summary: "Azure OpenAI and Azure AI Foundry deployment routes.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex", "gpt-4.1"],
  },
  {
    id: "azure-speech",
    name: "Azure Speech",
    icon: IconCloud,
    summary: "Azure speech provider for voice and audio workflows.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["gpt-4o-mini-tts", "tts-1", "whisper-1"],
  },
  {
    id: "byteplus",
    name: "BytePlus",
    icon: IconCloud,
    summary: "BytePlus international provider routes.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["doubao-seed-1.6", "doubao-1.5-pro", "doubao-1.5-lite"],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    icon: IconCpu,
    summary: "Cerebras high-speed inference provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["llama-4-scout-17b-16e-instruct", "llama-3.3-70b", "qwen-3-coder-480b"],
  },
  {
    id: "chutes",
    name: "Chutes",
    icon: IconPackage,
    summary: "Chutes hosted inference provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["deepseek-ai/DeepSeek-V3.2", "Qwen/Qwen3-Coder", "meta-llama/Llama-3.3-70B-Instruct"],
  },
  {
    id: "cloudflare-ai-gateway",
    name: "Cloudflare AI Gateway",
    icon: IconCloud,
    summary: "Cloudflare AI Gateway proxy and provider routing.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/qwen/qwen1.5-14b-chat-awq", "@cf/mistral/mistral-7b-instruct-v0.2-lora"],
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    icon: IconDatabase,
    summary: "ComfyUI workflow/runtime provider.",
    auth: "local",
    cliIds: LOCAL_PROVIDER_CLI_IDS,
    models: ["sdxl", "flux-dev", "wan-video"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: IconSparkles,
    summary: "DeepSeek API provider routes.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-coder"],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    icon: IconSparkles,
    summary: "ElevenLabs voice and audio model provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_turbo_v2_5"],
  },
  {
    id: "fal",
    name: "fal",
    icon: IconPackage,
    summary: "fal serverless media and model provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["fal-ai/flux-pro/v1.1", "fal-ai/wan/v2.2-a14b/text-to-video", "fal-ai/hunyuan3d/v2.1"],
  },
  {
    id: "fireworks",
    name: "Fireworks",
    icon: IconSparkles,
    summary: "Fireworks hosted inference provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["accounts/fireworks/models/llama-v3p1-405b-instruct", "accounts/fireworks/models/deepseek-v3", "accounts/fireworks/models/qwen3-coder-480b-a35b-instruct"],
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    icon: IconGitHub,
    summary: "GitHub Copilot provider and coding-agent route.",
    auth: "oauth",
    cliIds: ["copilot", "code", "cursor"],
    models: ["gpt-5.5", "claude-sonnet-4.6", "gemini-3-pro"],
  },
  {
    id: "glm",
    name: "GLM models",
    icon: IconSparkles,
    summary: "Zhipu/GLM model provider routes.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["glm-5.1", "glm-4.6", "glm-4.5-air"],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: IconOpenAI,
    summary: "Responses-capable OpenAI and Codex routes.",
    auth: "oauth",
    cliIds: ["code", "cursor", "codex", "factory", "copilot"],
    models: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5-codex"],
  },
  {
    id: "google-gemini",
    name: "Google Gemini",
    icon: IconSparkles,
    summary: "Gemini API and Google account auth.",
    auth: "oauth",
    cliIds: ["code", "cursor", "factory", "gemini", "copilot"],
    models: ["gemini-3-pro", "gemini-2.5-pro", "gemini-2.5-flash"],
  },
  {
    id: "gradium",
    name: "Gradium",
    icon: IconSparkles,
    summary: "Gradium provider routes.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["gradium-pro", "gradium-flash", "gradium-realtime"],
  },
  {
    id: "groq",
    name: "Groq",
    icon: IconCpu,
    summary: "Groq LPU inference provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["llama-3.3-70b-versatile", "moonshotai/kimi-k2-instruct", "deepseek-r1-distill-llama-70b"],
  },
  {
    id: "hugging-face",
    name: "Hugging Face",
    icon: IconPackage,
    summary: "Hugging Face inference provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen3-Coder-480B-A35B-Instruct", "mistralai/Mistral-Large-Instruct-2411"],
  },
  {
    id: "inferrs",
    name: "inferrs",
    icon: IconDatabase,
    summary: "inferrs local model provider.",
    auth: "local",
    cliIds: LOCAL_PROVIDER_CLI_IDS,
    models: ["qwen3-coder", "llama-3.3-70b", "deepseek-coder"],
  },
  {
    id: "kilocode",
    name: "Kilocode",
    icon: IconTerminal,
    summary: "Kilocode provider route.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["claude-sonnet-4.6", "gpt-5-codex", "gemini-2.5-pro"],
  },
  {
    id: "litellm",
    name: "LiteLLM",
    icon: IconGlobe,
    summary: "LiteLLM unified gateway or proxy endpoint.",
    auth: "gateway",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["claude-sonnet-4.6", "gpt-5.5", "gemini-2.5-pro", "deepseek-v4-pro"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: IconGlobe,
    summary: "Brokered model access with API key routing.",
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
    models: ["anthropic.claude-opus-4-7", "anthropic.claude-sonnet-4-6", "amazon.nova-pro", "meta.llama4"],
  },
  {
    id: "amazon-bedrock-mantle",
    name: "Amazon Bedrock Mantle",
    icon: IconCloud,
    summary: "Mantle routes for Amazon Bedrock-backed models.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["anthropic.claude-sonnet-4-6", "amazon.nova-pro", "meta.llama4"],
  },
  {
    id: "minimax",
    name: "MiniMax",
    icon: IconSparkles,
    summary: "MiniMax model provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["minimax-m2.7", "minimax-m2.7-highspeed", "abab6.5s-chat"],
  },
  {
    id: "mistral",
    name: "Mistral",
    icon: IconSparkles,
    summary: "Mistral API provider routes.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["mistral-large-latest", "codestral-latest", "magistral-medium-latest"],
  },
  {
    id: "moonshot-kimi",
    name: "Moonshot AI",
    icon: IconShield,
    summary: "Moonshot AI, Kimi, and Kimi Coding provider routes.",
    auth: "api-key",
    cliIds: ["kimi", "claude", "code", "cursor", "codex", "factory"],
    models: ["kimi-k2.6", "kimi-k2-turbo-preview", "kimi-k2-0905-preview"],
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    icon: IconCpu,
    summary: "NVIDIA hosted inference provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["nvidia/llama-3.1-nemotron-ultra-253b-v1", "nvidia/llama-3.3-nemotron-super-49b-v1", "meta/llama-3.3-70b-instruct"],
  },
  {
    id: "self-hosted-openai",
    name: "Self-hosted",
    icon: IconDatabase,
    summary: "Generic self-hosted OpenAI-compatible endpoint.",
    auth: "local",
    cliIds: LOCAL_PROVIDER_CLI_IDS,
    models: ["llama-3.3-70b", "qwen3-coder", "deepseek-coder"],
  },
  {
    id: "ollama",
    name: "Ollama",
    icon: IconCpu,
    summary: "Local model runtime with optional OpenAI-compatible endpoint.",
    auth: "local",
    cliIds: LOCAL_PROVIDER_CLI_IDS,
    models: ["qwen3-coder", "llama3.3", "deepseek-coder-v2"],
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    icon: IconDatabase,
    summary: "Local OpenAI/Anthropic-compatible runtime.",
    auth: "local",
    cliIds: LOCAL_PROVIDER_CLI_IDS,
    models: ["qwen3-coder", "llama-3.3-70b-instruct", "deepseek-coder-v2"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    icon: IconTerminal,
    summary: "OpenCode provider route.",
    auth: "local",
    cliIds: ["code", "cursor", "factory"],
    models: ["claude-sonnet-4.6", "gpt-5-codex", "kimi-k2.6"],
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    icon: IconTerminal,
    summary: "OpenCode Go provider route.",
    auth: "local",
    cliIds: ["code", "cursor", "factory"],
    models: ["claude-sonnet-4.6", "gpt-5-codex", "kimi-k2.6"],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    icon: IconSearch,
    summary: "Perplexity and Sonar web-search model provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["sonar", "sonar-pro", "sonar-deep-research"],
  },
  {
    id: "qianfan",
    name: "Qianfan",
    icon: IconCloud,
    summary: "Baidu Qianfan cloud model provider.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["ernie-4.5-turbo", "ernie-4.0-turbo", "ernie-speed-128k"],
  },
  {
    id: "qwen-cloud",
    name: "Qwen Cloud",
    icon: IconCloud,
    summary: "Qwen cloud model provider.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["qwen3.6-plus", "qwen3-coder-plus", "qwen-max"],
  },
  {
    id: "runway",
    name: "Runway",
    icon: IconPackage,
    summary: "Runway media generation provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["gen-4", "gen-3-alpha", "act-two"],
  },
  {
    id: "senseaudio",
    name: "SenseAudio",
    icon: IconSparkles,
    summary: "SenseAudio speech/audio provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["sensevoice-small", "sensevoice-large", "senseaudio-tts"],
  },
  {
    id: "sglang",
    name: "SGLang",
    icon: IconDatabase,
    summary: "SGLang local model runtime.",
    auth: "local",
    cliIds: LOCAL_PROVIDER_CLI_IDS,
    models: ["qwen3-coder", "llama-3.3-70b", "deepseek-v3"],
  },
  {
    id: "stepfun",
    name: "StepFun",
    icon: IconSparkles,
    summary: "StepFun model provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["step-2-16k", "step-1o-turbo-vision", "step-1-flash"],
  },
  {
    id: "synthetic",
    name: "Synthetic",
    icon: IconPackage,
    summary: "Synthetic provider routes.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["synthetic-gpt-oss-120b", "synthetic-deepseek-v3", "synthetic-qwen3-coder"],
  },
  {
    id: "tencent-tokenhub",
    name: "Tencent Cloud TokenHub",
    icon: IconCloud,
    summary: "Tencent Cloud TokenHub provider routing.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["hunyuan-turbos-latest", "hunyuan-large", "hunyuan-a13b"],
  },
  {
    id: "together-ai",
    name: "Together AI",
    icon: IconSparkles,
    summary: "Together AI hosted inference provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen3-Coder-480B-A35B-Instruct"],
  },
  {
    id: "venice",
    name: "Venice",
    icon: IconShield,
    summary: "Venice AI privacy-focused provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["llama-3.3-70b", "qwen3-235b", "deepseek-r1"],
  },
  {
    id: "vercel-ai-gateway",
    name: "Vercel AI Gateway",
    icon: IconGlobe,
    summary: "Vercel AI Gateway provider routing.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: VERCEL_AI_GATEWAY_MODELS,
  },
  {
    id: "vllm",
    name: "vLLM",
    icon: IconDatabase,
    summary: "vLLM local or hosted model runtime.",
    auth: "local",
    cliIds: LOCAL_PROVIDER_CLI_IDS,
    models: ["qwen3-coder", "llama-3.3-70b", "deepseek-v3"],
  },
  {
    id: "volcengine",
    name: "Volcengine",
    icon: IconCloud,
    summary: "Volcengine Doubao model provider.",
    auth: "cloud",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["doubao-seed-1.6", "doubao-1.5-pro-32k", "doubao-1.5-lite-32k"],
  },
  {
    id: "vydra",
    name: "Vydra",
    icon: IconPackage,
    summary: "Vydra provider routes.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["vydra-1.5-pro", "vydra-1.5-flash", "vydra-coder"],
  },
  {
    id: "xai",
    name: "xAI",
    icon: IconSparkles,
    summary: "xAI Grok model provider.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["grok-4.20", "grok-4.20-reasoning", "grok-4.20-fast"],
  },
  {
    id: "xiaomi",
    name: "Xiaomi",
    icon: IconCloud,
    summary: "Xiaomi model provider routes.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["mimo-v2-pro", "mimo-v2", "mimo-embedding"],
  },
  {
    id: "z-ai",
    name: "Z.AI",
    icon: IconSparkles,
    summary: "Z.AI/GLM provider routes.",
    auth: "api-key",
    cliIds: ALL_PROVIDER_CLI_IDS,
    models: ["glm-5.1", "glm-5.1-turbo", "glm-4.6"],
  },
];

const PROVIDER_ICON_SRC: Record<AiProviderId, string> = {
  "alibaba-model-studio": "/icons/alibaba.svg",
  "amazon-bedrock": "/icons/bedrock.svg",
  "amazon-bedrock-mantle": "/icons/bedrock-mantle.svg",
  anthropic: "/icons/anthropic.svg",
  "arcee-ai": "/icons/arcee.svg",
  "azure-openai": "/icons/azure-speech.svg",
  "azure-speech": "/icons/azure-speech.svg",
  byteplus: "/icons/byteplus.svg",
  cerebras: "/icons/cerebras.svg",
  chutes: "/icons/chutes.svg",
  "cloudflare-ai-gateway": "/icons/cloudflare-ai-gateway.svg",
  comfyui: "/icons/comfy.svg",
  deepseek: "/icons/deepseek.svg",
  elevenlabs: "/icons/elevenlabs.svg",
  fal: "/icons/fal.svg",
  fireworks: "/icons/fireworks.svg",
  "github-copilot": "/icons/github-copilot.svg",
  glm: "/icons/glm.svg",
  "google-gemini": "/icons/google.svg",
  gradium: "/icons/gradium.svg",
  groq: "/icons/groq.svg",
  "hugging-face": "/icons/huggingface.svg",
  inferrs: "/icons/inferrs.svg",
  kilocode: "/icons/kilocode.svg",
  litellm: "/icons/litellm.svg",
  "lm-studio": "/icons/lmstudio.svg",
  minimax: "/icons/minimax.svg",
  mistral: "/icons/mistral.svg",
  "moonshot-kimi": "/icons/moonshot.svg",
  nvidia: "/icons/nvidia.svg",
  ollama: "/icons/ollama.svg",
  openai: "/icons/openai.svg",
  opencode: "/icons/opencode.svg",
  "opencode-go": "/icons/opencode-go.svg",
  openrouter: "/icons/openrouter.svg",
  perplexity: "/icons/perplexity-provider.svg",
  qianfan: "/icons/qianfan.svg",
  "qwen-cloud": "/icons/qwen.svg",
  runway: "/icons/runway.svg",
  senseaudio: "/icons/senseaudio.svg",
  sglang: "/icons/sglang.svg",
  stepfun: "/icons/stepfun.svg",
  synthetic: "/icons/synthetic.svg",
  "tencent-tokenhub": "/icons/tencent.svg",
  "together-ai": "/icons/together.svg",
  venice: "/icons/venice.svg",
  "vercel-ai-gateway": "/icons/vercel-ai-gateway.svg",
  vllm: "/icons/vllm.svg",
  volcengine: "/icons/volcengine.svg",
  vydra: "/icons/vydra.svg",
  xai: "/icons/xai.svg",
  xiaomi: "/icons/xiaomi.svg",
  "z-ai": "/icons/zai.svg",
};

const PROVIDER_DISPLAY_ORDER: AiProviderId[] = [
  "openai",
  "anthropic",
  "google-gemini",
  "openrouter",
  "github-copilot",
  "mistral",
  "deepseek",
  "groq",
  "xai",
  "perplexity",
  "hugging-face",
  "amazon-bedrock",
  "amazon-bedrock-mantle",
  "cloudflare-ai-gateway",
  "vercel-ai-gateway",
  "alibaba-model-studio",
  "qwen-cloud",
  "qianfan",
  "tencent-tokenhub",
  "volcengine",
  "byteplus",
  "azure-openai",
  "azure-speech",
  "self-hosted-openai",
  "litellm",
  "ollama",
  "lm-studio",
  "vllm",
  "sglang",
  "comfyui",
  "opencode",
  "opencode-go",
  "inferrs",
  "together-ai",
  "fireworks",
  "cerebras",
  "nvidia",
  "fal",
  "runway",
  "elevenlabs",
  "moonshot-kimi",
  "glm",
  "z-ai",
  "venice",
  "minimax",
  "stepfun",
  "arcee-ai",
  "chutes",
  "gradium",
  "kilocode",
  "senseaudio",
  "synthetic",
  "vydra",
  "xiaomi",
];

const PROVIDER_VISIBLE_LIMIT = 12;

const PROVIDER_DISPLAY_RANK = new Map<AiProviderId, number>(
  PROVIDER_DISPLAY_ORDER.map((id, index) => [id, index]),
);

const PROVIDER_API_KEY_NAMES: Partial<Record<AiProviderId, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  "azure-openai": "AZURE_OPENAI_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  chutes: "CHUTES_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  fal: "FAL_KEY",
  fireworks: "FIREWORKS_API_KEY",
  "github-copilot": "GITHUB_TOKEN",
  "google-gemini": "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  "hugging-face": "HUGGINGFACE_API_KEY",
  minimax: "MINIMAX_API_KEY",
  mistral: "MISTRAL_API_KEY",
  "moonshot-kimi": "MOONSHOT_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  "qwen-cloud": "DASHSCOPE_API_KEY",
  runway: "RUNWAYML_API_SECRET",
  stepfun: "STEPFUN_API_KEY",
  "together-ai": "TOGETHER_API_KEY",
  venice: "VENICE_API_KEY",
  "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
  xai: "XAI_API_KEY",
};

function providerApiKeyName(providerId: AiProviderId): string {
  return (
    PROVIDER_API_KEY_NAMES[providerId] ??
    `${providerId.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase()}_API_KEY`
  );
}

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

function countPodsInNamespace(report: LocalStackResourceMetricsReport, namespace: string): number | undefined {
  const namespaceTotal = report.totals?.byNamespace?.find((item) => item.namespace === namespace);
  if (isFiniteNumber(namespaceTotal?.pods)) return namespaceTotal.pods;
  const pods = report.pods?.filter((pod) => pod.namespace === namespace);
  return pods && pods.length > 0 ? pods.length : undefined;
}

function summarizePodsInNamespace(report: LocalStackResourceMetricsReport, namespace: string): string | undefined {
  const total = countPodsInNamespace(report, namespace);
  const pods = report.pods?.filter((pod) => pod.namespace === namespace) ?? [];
  if (!isFiniteNumber(total) && pods.length === 0) return undefined;
  const running = pods.filter((pod) => pod.phase === "Running").length;
  const denominator = isFiniteNumber(total) ? total : pods.length;
  return `${running}/${denominator} running`;
}

function baselineStatusValue(report: LocalStackResourceMetricsReport, namespace: string, fallback: string): string {
  return summarizePodsInNamespace(report, namespace) ?? fallback;
}

function buildClientClusterBaselineItems(metrics: MetricsState): MetricsItem[] {
  if (!metrics.report) {
    return [
      { label: "Ingress", value: metrics.status === "unavailable" ? "unknown" : "checking" },
      { label: "Argo CD", value: metrics.status === "unavailable" ? "unknown" : "checking" },
      { label: "CTO", value: metrics.status === "unavailable" ? "unknown" : "checking" },
    ];
  }

  const report = metrics.report;
  const totalPods = report.totals?.pods ?? report.pods?.length;
  const kindValue = formatKindFootprint(report) ?? (report.cluster?.apiReachable ? "API ready" : "waiting");
  return [
    { label: "Kind", value: kindValue },
    { label: "Ingress", value: baselineStatusValue(report, "ingress-nginx", "waiting") },
    { label: "Argo CD", value: baselineStatusValue(report, "argocd", "waiting") },
    { label: "CTO", value: baselineStatusValue(report, "cto", "waiting") },
    { label: "Pods", value: isFiniteNumber(totalPods) ? formatCount(totalPods, "pod") : "checking" },
  ];
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
  sourceCredentialToken: string,
  sourceAuthMode: SourceAuthMode,
  githubAppSecretManifest: string | null,
  selectedProviders: AiProviderOption[],
  providerAuthInputs: Partial<Record<AiProviderId, string>>,
  providerAuthApiKeys: Partial<Record<AiProviderId, string>>,
  toolApiKeys: Partial<Record<ToolApiKeyName, string>>,
  enabledDiscordAgents: Partial<Record<DiscordAgentId, true>>,
  discordAgentTokens: Partial<Record<DiscordAgentId, string>>,
  setup: BootstrapSetupProfile,
): BootstrapLocalStackRequest {
  const tools = {
    apiKeys: TOOL_API_KEYS.map((tool) => ({
      name: tool.name,
      value: toolApiKeys[tool.name]?.trim() ?? "",
    })).filter((key) => key.value.length > 0),
  };
  const providers = {
    credentials: selectedProviders
      .map((provider): BootstrapProviderCredential => {
        const value = providerAuthInputs[provider.id]?.trim();
        const apiKey = providerAuthApiKeys[provider.id]?.trim();
        const secretKey = providerApiKeyName(provider.id);

        if (provider.auth === "api-key") {
          return {
            providerId: provider.id,
            auth: provider.auth,
            secretKey,
            value: value || undefined,
          };
        }

        if (provider.auth === "gateway" || provider.auth === "local") {
          return {
            providerId: provider.id,
            auth: provider.auth,
            value: value || undefined,
            apiKeySecretKey: secretKey,
            apiKey: apiKey || undefined,
          };
        }

        return {
          providerId: provider.id,
          auth: provider.auth,
          value: value || undefined,
        };
      })
      .filter((credential) =>
        Boolean(credential.value || credential.apiKey || credential.auth === "oauth"),
      ),
  };
  const agents = {
    discordTokens: CODING_DISCORD_AGENTS.map((agent) => ({
      id: agent.id,
      enabled: enabledDiscordAgents[agent.id] === true,
      token: discordAgentTokens[agent.id]?.trim() || undefined,
    })),
  };

  if (sourceProvider !== "github") {
    const sourceToken = sourceCredentialToken.trim();
    return {
      github: { enabled: false },
      scm: sourceToken
        ? {
            provider: sourceProvider,
            token: sourceToken,
          }
        : {
            provider: sourceProvider,
          },
      tools,
      providers,
      agents,
      setup,
    };
  }

  const githubRequest = {
    enabled: true,
    token: githubToken.trim() || sourceCredentialToken.trim() || undefined,
    owner: sourceOwner.trim() || undefined,
  };
  const githubScmRequest = githubAppSecretManifest
    ? {
        provider: sourceProvider,
        githubAppSecretManifest,
      }
    : sourceAuthMode === "github-enterprise-app"
      ? {
          provider: sourceProvider,
        }
      : undefined;

  return {
    github: githubRequest,
    scm: githubScmRequest,
    tools,
    providers,
    agents,
    setup,
  };
}

function providerAuthLabel(auth: AiProviderOption["auth"]): string {
  return {
    oauth: "OAuth",
    "api-key": "API key",
    cloud: "Cloud creds",
    gateway: "Gateway",
    local: "Local",
  }[auth];
}

function providerAuthPlaceholder(auth: AiProviderOption["auth"], providerName: string): string {
  return {
    oauth: `${providerName} account connection`,
    "api-key": `${providerName} API key`,
    cloud: `${providerName} credential profile or project`,
    gateway: `${providerName} gateway base URL`,
    local: `${providerName} local endpoint`,
  }[auth];
}

function providerApiKeyPlaceholder(auth: AiProviderOption["auth"], providerName: string): string {
  return auth === "gateway" ? `${providerName} API key` : `${providerName} API key, if enabled`;
}

function sourceConnectionId(provider: ScmProvider, owner: string): string {
  return slugifyConnectionId(owner) || provider;
}

type HarnessModelRouteOption = {
  key: string;
  providerId: AiProviderId;
  providerName: string;
  providerSummary: string;
  model: string;
  icon: ComponentType<IconProps>;
  iconSrc?: string;
};

function harnessModelRouteKey(providerId: AiProviderId, model: string): string {
  return `${providerId}::${model}`;
}

function buildHarnessModelRoutes(
  selectedProviders: AiProviderOption[],
  selectedModels: Partial<Record<AiProviderId, string[]>>,
): HarnessModelRouteOption[] {
  return selectedProviders.flatMap((provider) => {
    const models = selectedModels[provider.id] ?? [provider.models[0]];
    return Array.from(new Set(models.filter(Boolean))).map((model) => ({
      key: harnessModelRouteKey(provider.id, model),
      providerId: provider.id,
      providerName: provider.name,
      providerSummary: provider.summary,
      model,
      icon: provider.icon,
      iconSrc: PROVIDER_ICON_SRC[provider.id],
    }));
  });
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
  selectedHarnessPrimaryModelKey,
  enabledHarnessFallbacks,
  enabledDiscordAgents,
}: {
  sourceProvider: ScmProvider;
  sourceHostMode: SourceHostMode;
  sourceHostUrl: string;
  sourceOwner: string;
  harness: HarnessId;
  selectedAiCliIds: AiCliId[];
  selectedProviders: AiProviderOption[];
  selectedModels: Partial<Record<AiProviderId, string[]>>;
  selectedHarnessPrimaryModelKey: string | null;
  enabledHarnessFallbacks: Partial<Record<string, boolean>>;
  enabledDiscordAgents: Partial<Record<DiscordAgentId, true>>;
}): BootstrapSetupProfile {
  const owner = sourceOwner.trim();
  const routeOptions = buildHarnessModelRoutes(selectedProviders, selectedModels);
  const primaryRoute =
    routeOptions.find((route) => route.key === selectedHarnessPrimaryModelKey) ?? routeOptions[0];
  const routing = primaryRoute
    ? {
        primary: {
          providerId: primaryRoute.providerId,
          model: primaryRoute.model,
        },
        fallbacks: routeOptions
          .filter((route) => route.key === primaryRoute.key || enabledHarnessFallbacks[route.key] !== false)
          .map((route) => ({
            providerId: route.providerId,
            model: route.model,
          })),
      }
    : undefined;
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
        cliIds: provider.cliIds.filter((cliId) => selectedAiCliIds.includes(cliId)),
        model: (selectedModels[provider.id] ?? [provider.models[0]])[0],
        models: selectedModels[provider.id] ?? [provider.models[0]],
      })),
      routing,
    },
    agents: CODING_DISCORD_AGENTS.map((agent) => ({
      id: agent.id,
      enabled: enabledDiscordAgents[agent.id] === true,
    })),
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
  const [dependencyPrepState, setDependencyPrepState] = useState<DependencyPrepState>("idle");
  const [sourceProvider, setSourceProvider] = useState<ScmProvider>("github");
  const [sourceHostMode, setSourceHostMode] = useState<SourceHostMode>("hosted");
  const [sourceHostUrl, setSourceHostUrl] = useState(SOURCE_DEFAULT_URLS.github);
  const [sourceOwner, setSourceOwner] = useState("");
  const [sourceAuthMode, setSourceAuthMode] = useState<SourceAuthMode>("github-oauth");
  const [sourceOriginEngine, setSourceOriginEngine] = useState<SourceOriginEngine>("standard");
  const [sourceOriginPlan, setSourceOriginPlan] = useState<OriginTransferPlan | null>(null);
  const [sourceOriginReviewOpen, setSourceOriginReviewOpen] = useState(false);
  const [sourceOriginAppCreated, setSourceOriginAppCreated] = useState(false);
  const [sourceModalProvider, setSourceModalProvider] = useState<"github" | "gitlab" | "origin" | null>(null);
  const [showSourceAdvanced, setShowSourceAdvanced] = useState(false);
  const [harness, setHarness] = useState<HarnessId | null>(null);
  const [selectedCliIds, setSelectedCliIds] = useState<Partial<Record<AiCliId, true>>>({});
  const [selectedProviderIds, setSelectedProviderIds] =
    useState<Partial<Record<AiProviderId, true>>>({});
  const [selectedModels, setSelectedModels] = useState<Partial<Record<AiProviderId, string[]>>>({});
  const [selectedHarnessPrimaryModelKey, setSelectedHarnessPrimaryModelKey] = useState<string | null>(
    null,
  );
  const [enabledHarnessFallbacks, setEnabledHarnessFallbacks] = useState<
    Partial<Record<string, boolean>>
  >({});
  const [providerSearch, setProviderSearch] = useState("");
  const [providerAuthInputs, setProviderAuthInputs] = useState<Partial<Record<AiProviderId, string>>>({});
  const [providerAuthApiKeys, setProviderAuthApiKeys] =
    useState<Partial<Record<AiProviderId, string>>>({});
  const [toolApiKeys, setToolApiKeys] = useState<Partial<Record<ToolApiKeyName, string>>>({});
  const [scmProvisioningBusy, setScmProvisioningBusy] = useState(false);
  const [scmProvisioningMessage, setScmProvisioningMessage] = useState<string | null>(null);
  const [githubOAuthPrompt, setGithubOAuthPrompt] = useState<GitHubCliOAuthPrompt | null>(null);
  const [githubAccountOptions, setGithubAccountOptions] = useState<GitHubCliAccount[]>([]);
  const [enabledDiscordAgents, setEnabledDiscordAgents] = useState<Partial<Record<DiscordAgentId, true>>>(
    () =>
      Object.fromEntries(
        CODING_DISCORD_AGENTS.filter((agent) => agent.defaultEnabled).map((agent) => [agent.id, true]),
      ) as Partial<Record<DiscordAgentId, true>>,
  );
  const [discordAgentTokens, setDiscordAgentTokens] =
    useState<Partial<Record<DiscordAgentId, string>>>({});
  const [progress, setProgress] = useState<BootstrapProgress>({
    stage: "credentials",
    message: "Preparing setup...",
    progress: 4,
  });
  const [error, setError] = useState<string | null>(null);
  const [previewBanner, setPreviewBanner] = useState<string | null>(null);
  const [audioWarning, setAudioWarning] = useState<string | null>(null);
  const [resettingFlow, setResettingFlow] = useState(false);
  const [morganAudioMuted, setMorganAudioMuted] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [activeCaptionText, setActiveCaptionText] = useState("");
  const [morganVideoUnavailable, setMorganVideoUnavailable] = useState(false);
  const [morganConversationTurn, setMorganConversationTurn] = useState(0);
  const [metrics, setMetrics] = useState<MetricsState>({ status: "idle", report: null });
  const [githubForm, setGithubForm] = useState<BootstrapGithubForm>({
    enabled: true,
    token: "",
    tokenSource: null,
    owner: "",
    ownerSource: null,
  });
  const [sourceCredentialForm, setSourceCredentialForm] = useState<SourceCredentialForm>({
    token: "",
  });
  const loadedDefaults = useRef(false);
  const retriedGithubDefaults = useRef(false);
  const githubOAuthVoiceClient = useRef<VoiceClient | null>(null);
  const setupSelectionVoiceClient = useRef<VoiceClient | null>(null);
  const githubOAuthOpenedUri = useRef<string | null>(null);
  const githubOAuthAttemptId = useRef(0);
  const githubOAuthTimeout = useRef<number | null>(null);
  const spokenGithubOAuthCode = useRef<string | null>(null);
  const toolKeyTouched = useRef<Partial<Record<ToolApiKeyName, true>>>({});
  const metricsInFlight = useRef(false);
  const lastMetricsProgress = useRef(0);
  const morganVideoRef = useRef<HTMLVideoElement | null>(null);
  const morganAudioRef = useRef<HTMLAudioElement | null>(null);
  const introAdvanceTimer = useRef<number | null>(null);
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
      AI_PROVIDERS.map((provider, index) => ({ provider, index }))
        .sort((left, right) => {
          const leftRank = PROVIDER_DISPLAY_RANK.get(left.provider.id) ?? Number.MAX_SAFE_INTEGER;
          const rightRank =
            PROVIDER_DISPLAY_RANK.get(right.provider.id) ?? Number.MAX_SAFE_INTEGER;

          return leftRank === rightRank ? left.index - right.index : leftRank - rightRank;
        })
        .map(({ provider }) => provider),
    [],
  );
  const visibleProviderOptions = useMemo(() => {
    const query = providerSearch.trim().toLowerCase();
    return providerOptions.filter((provider) => {
      if (
        selectedProviderFilterCliIds.length > 0 &&
        !provider.cliIds.some((cliId) => selectedProviderFilterCliIds.includes(cliId))
      ) {
        return false;
      }

      if (!query) return true;

      return [
        provider.name,
        provider.summary,
        providerAuthLabel(provider.auth),
        provider.id.replaceAll("-", " "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [providerOptions, providerSearch, selectedProviderFilterCliIds]);
  const [showAllProviders, setShowAllProviders] = useState(false);
  const limitedProviderOptions = useMemo(
    () =>
      showAllProviders
        ? visibleProviderOptions
        : visibleProviderOptions.slice(0, PROVIDER_VISIBLE_LIMIT),
    [showAllProviders, visibleProviderOptions],
  );
  const hiddenProviderCount = Math.max(
    0,
    visibleProviderOptions.length - limitedProviderOptions.length,
  );
  const selectedProviders = useMemo(
    () => providerOptions.filter((provider) => selectedProviderIds[provider.id]),
    [providerOptions, selectedProviderIds],
  );
  const selectedHarnessModelRoutes = useMemo(
    () => buildHarnessModelRoutes(selectedProviders, selectedModels),
    [selectedModels, selectedProviders],
  );
  const effectivePrimaryHarnessModelRoute = useMemo(
    () =>
      selectedHarnessModelRoutes.find((route) => route.key === selectedHarnessPrimaryModelKey) ??
      selectedHarnessModelRoutes[0] ??
      null,
    [selectedHarnessModelRoutes, selectedHarnessPrimaryModelKey],
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
      selectedHarnessPrimaryModelKey: effectivePrimaryHarnessModelRoute?.key ?? null,
      enabledHarnessFallbacks,
      enabledDiscordAgents,
    }),
    [
      effectivePrimaryHarnessModelRoute?.key,
      enabledHarnessFallbacks,
      enabledDiscordAgents,
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
  const sourceNamespaceReady =
    sourceOwner.trim().length > 0 &&
    (sourceHostMode === "hosted" || sourceHostUrl.trim().length > 0);
  const selected5DOrigin = sourceProvider === "gitea" || (sourceProvider === "gitlab" && sourceHostMode === "self-hosted" && sourceOriginEngine === "gitlab-compatible");
  const shouldAskForSourceNamespace =
    githubAccountOptions.length > 0 ||
    (sourceHostMode === "self-hosted" && !selected5DOrigin) ||
    (isManualSourceTokenMode(sourceAuthMode) && showSourceAdvanced && !selected5DOrigin);
  const sourceAuthStartReady =
    (sourceAuthMode === "github-oauth" ||
      sourceAuthMode === "gitlab-instance-oauth-app" ||
      sourceAuthMode === "gitlab-token") &&
    (sourceHostMode === "hosted" || sourceHostUrl.trim().length > 0);
  const sourceAuthReady =
    !isManualSourceTokenMode(sourceAuthMode) ||
    githubForm.token.trim().length > 0 ||
    sourceCredentialForm.token.trim().length > 0;
  const sourceReady = selected5DOrigin
    ? sourceOriginAppCreated
    : (shouldAskForSourceNamespace ? sourceNamespaceReady : true) && sourceAuthReady;
  const clisReady = selectedProviderFilterCliIds.length > 0;
  const providersReady = selectedProviderCount > 0;
  const routingReady =
    selectedHarnessModelRoutes.length > 0 && effectivePrimaryHarnessModelRoute !== null;
  const harnessReady = harness !== null;
  const canContinue = sourceReady && clisReady && harnessReady && providersReady;
  const configuredToolKeyCount = useMemo(
    () =>
      TOOL_API_KEYS.filter((tool) => (toolApiKeys[tool.name] ?? "").trim().length > 0).length,
    [toolApiKeys],
  );
  const enabledDiscordAgentCount = useMemo(
    () => CODING_DISCORD_AGENTS.filter((agent) => enabledDiscordAgents[agent.id]).length,
    [enabledDiscordAgents],
  );
  const configuredDiscordTokenCount = useMemo(
    () =>
      CODING_DISCORD_AGENTS.filter(
        (agent) => enabledDiscordAgents[agent.id] && (discordAgentTokens[agent.id] ?? "").trim(),
      ).length,
    [discordAgentTokens, enabledDiscordAgents],
  );
  const morganMediaSlug =
    state === "checking"
      ? MORGAN_INSTALL_MEDIA_SLUG
      : state === "credentials" && MORGAN_VIDEO_SCREENS.has(setupScreen)
        ? MORGAN_MEDIA_SCREEN_SLUG[setupScreen]
        : null;
  const activeMorganPrompt =
    setupScreen === "source"
      ? ""
      : setupScreen === "harness"
        ? "Which harness should run your agents?"
        : setupScreen === "clis"
          ? "Which coding CLIs should CTO prepare?"
          : setupScreen === "profiles"
            ? "Which providers should Morgan wire in?"
            : setupScreen === "provider-models"
              ? "Which models should be ready?"
              : setupScreen === "harness-routing"
                ? "Which model should answer first?"
                : setupScreen === "provider-auth"
                  ? "How should CTO connect each provider?"
                  : setupScreen === "tools"
                    ? "Which tool keys should Morgan save?"
                    : setupScreen === "agent-tokens"
                      ? "Which agents should come online?"
                      : "Welcome to CTO.";

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

  const applyBootstrapDefaults = useCallback((defaults: LocalStackBootstrapDefaults) => {
    setGithubForm({
      enabled: true,
      token: defaults.github.token,
      tokenSource: defaults.github.tokenSource,
      owner: defaults.github.owner,
      ownerSource: defaults.github.ownerSource,
    });
    setSourceOwner(defaults.github.owner);
    if (defaults.github.token) {
      setScmProvisioningMessage(
        defaults.github.tokenSource === "GitHub CLI"
          ? "GitHub token provided by GitHub CLI environment. CTO will use it during install."
          : "GitHub credentials are already configured. CTO will use that token during install.",
      );
    }
    setToolApiKeys((current) => {
      const next = { ...current };
      for (const tool of TOOL_API_KEYS) {
        if (toolKeyTouched.current[tool.name]) continue;
        next[tool.name] = defaults.toolKeys?.[tool.name]?.value ?? "";
      }
      return next;
    });
  }, []);

  const playMorganVideo = useCallback(async () => {
    const video = morganVideoRef.current;
    if (!video) return;

    try {
      video.muted = morganAudioMuted;
      if (video.ended) {
        video.currentTime = 0;
      }
      await video.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        console.info("Morgan video autoplay with audio is waiting for a user gesture.");
        setAudioWarning("Enable audio playback so you can hear Morgan during setup.");
        return;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      if (err instanceof DOMException && err.name === "NotSupportedError") {
        setMorganVideoUnavailable(true);
        return;
      }
      setError(`Could not play Morgan video: ${String(err)}`);
    }
  }, [morganAudioMuted]);

  const playMorganAudio = useCallback(async () => {
    const audio = morganAudioRef.current;
    if (!audio) return;

    try {
      audio.muted = morganAudioMuted;
      if (audio.ended) {
        audio.currentTime = 0;
      }
      await audio.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setAudioWarning("Enable audio playback so you can hear Morgan during setup.");
      }
    }
  }, [morganAudioMuted]);

  const speakMorganCue = useCallback(async (text: string, reason: "setup-selection" = "setup-selection") => {
    if (morganAudioMuted || isLocalStackBootstrapPreview()) return;
    try {
      const client = setupSelectionVoiceClient.current ?? new VoiceClient();
      setupSelectionVoiceClient.current = client;
      await client.speakCue(text, reason);
    } catch {
      // Reactive Morgan audio is an enhancement. Selection should never block on voice-bridge.
    }
  }, [morganAudioMuted]);

  const handleMorganSelection = useCallback(
    async (acknowledgement: string, applySelection: () => void) => {
      setPreviewBanner(acknowledgement);
      await speakMorganCue(acknowledgement, "setup-selection");
      applySelection();
      setMorganConversationTurn((turn) => turn + 1);
    },
    [speakMorganCue],
  );

  useEffect(() => {
    if (morganVideoRef.current) {
      morganVideoRef.current.muted = morganAudioMuted;
    }
    if (morganAudioRef.current) {
      morganAudioRef.current.muted = morganAudioMuted;
    }
    if (morganAudioMuted) {
      setAudioWarning(null);
    }
  }, [morganAudioMuted]);

  useEffect(() => {
    return () => setupSelectionVoiceClient.current?.close();
  }, []);

  const updateActiveCaption = useCallback(() => {
    if (!captionsEnabled) {
      setActiveCaptionText("");
      return;
    }

    const currentTime =
      morganVideoRef.current && !morganVideoUnavailable
        ? morganVideoRef.current.currentTime
        : morganAudioRef.current?.currentTime;
    const activeCue =
      typeof currentTime === "number"
        ? captionCues.find((cue) => currentTime >= cue.start && currentTime <= cue.end)
        : undefined;
    setActiveCaptionText(activeCue?.text ?? "");
  }, [captionCues, captionsEnabled, morganVideoUnavailable]);

  const clearIntroAdvanceTimer = useCallback(() => {
    if (introAdvanceTimer.current === null) return;
    window.clearTimeout(introAdvanceTimer.current);
    introAdvanceTimer.current = null;
  }, []);

  const prepareClusterDependencies = useCallback(async () => {
    clearIntroAdvanceTimer();
    setError(null);
    setPreviewBanner(null);
    setMetrics({ status: "idle", report: null });
    lastMetricsProgress.current = 0;
    setDependencyPrepState("running");
    setProgress({
      stage: "runtime",
      message: "Preparing cluster dependencies...",
      progress: 5,
    });
    void refreshMetrics();

    if (isLocalStackBootstrapPreview()) {
      try {
        setProgress({
          stage: "runtime",
          message: "[Preview] Checking Docker or Colima",
          progress: 18,
        });
        await delay(220);
        setProgress({
          stage: "cluster",
          message: "[Preview] Creating Kind, installing NGINX ingress, Argo CD via Helm, then baseline CTO charts",
          progress: 82,
        });
        await delay(260);
        setProgress({
          stage: "baseline",
          message: "[Preview] Client Cluster baseline ready",
          progress: 100,
        });
        setDependencyPrepState("ready");
        setPreviewBanner("Client Cluster baseline is ready. Now connect Source while CTO keeps the local stack warm.");
        setSetupScreen("source");
      } catch (err) {
        setDependencyPrepState("failed");
        setError(String(err));
      }
      return;
    }

    try {
      await invokeTauri("prepare_local_stack_dependencies");
      void refreshMetrics();
      setProgress({
        stage: "baseline",
        message: "Client Cluster baseline ready for setup choices.",
        progress: 100,
      });
      setDependencyPrepState("ready");
      setPreviewBanner("Client Cluster baseline is ready. Now connect Source while CTO keeps the local stack warm.");
      setSetupScreen("source");
    } catch (err) {
      setDependencyPrepState("failed");
      setError(String(err));
    }
  }, [clearIntroAdvanceTimer, refreshMetrics]);

  const navigateSetupForDev = useCallback(
    (direction: "previous" | "next") => {
      clearIntroAdvanceTimer();
      setError(null);
      setPreviewBanner(null);
      setState("credentials");
      setActiveCaptionText("");
      setDependencyPrepState((current) => (current === "running" ? "idle" : current));
      setSetupScreen((current) =>
        direction === "previous" ? previousSetupScreen(current) : nextSetupScreen(current),
      );
    },
    [clearIntroAdvanceTimer],
  );

  const scheduleIntroAdvance = useCallback(
    (durationSeconds?: number) => {
      if (setupScreen !== "intro" || dependencyPrepState !== "idle") return;
      clearIntroAdvanceTimer();
      const durationMs =
        typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0
          ? Math.ceil(durationSeconds * 1000) + 800
          : INTRO_ADVANCE_FALLBACK_MS;
      introAdvanceTimer.current = window.setTimeout(() => {
        void prepareClusterDependencies();
      }, durationMs);
    },
    [clearIntroAdvanceTimer, dependencyPrepState, prepareClusterDependencies, setupScreen],
  );

  const persistSourceConnection = useCallback(async () => {
    if (!isTauriCommandAvailable()) return;

    if (sourceProvider === "github" && sourceAuthMode !== "github-enterprise-app") {
      return;
    }

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
  }, [setupProfile.source, sourceProvider, sourceAuthMode]);

  const authorizeGithubWithCli = useCallback(async () => {
    if (!isTauriCommandAvailable()) {
      setPreviewBanner("GitHub OAuth is available in the desktop app.");
      return;
    }

    const attemptId = githubOAuthAttemptId.current + 1;
    githubOAuthAttemptId.current = attemptId;
    if (githubOAuthTimeout.current !== null) {
      window.clearTimeout(githubOAuthTimeout.current);
    }
    setScmProvisioningBusy(true);
    setError(null);
    setGithubOAuthPrompt(null);
    githubOAuthOpenedUri.current = null;
    setScmProvisioningMessage(
      "Morgan is opening the GitHub app install flow. Approve the user, org, or repo access you want CTO to manage, then Morgan will detect the available accounts.",
    );
    githubOAuthTimeout.current = window.setTimeout(() => {
      if (githubOAuthAttemptId.current !== attemptId) return;
      githubOAuthAttemptId.current += 1;
      githubOAuthTimeout.current = null;
      setScmProvisioningBusy(false);
      setGithubOAuthPrompt(null);
      setError(
        "GitHub authorization timed out. Close any stale GitHub prompt, switch to the right browser profile, and try again.",
      );
    }, GITHUB_OAUTH_UI_TIMEOUT_MS);
    try {
      const result = await invokeTauri<GitHubCliOAuthResult>("github_cli_oauth");
      if (githubOAuthAttemptId.current !== attemptId) return;
      setGithubForm((current) => ({
        ...current,
        enabled: true,
        token: result.token,
        tokenSource: "GitHub OAuth",
        owner: result.username ?? current.owner,
      }));
      const accounts = result.accounts ?? [];
      setGithubAccountOptions(accounts);
      if (!sourceOwner.trim()) {
        const preferredOrg = accounts.find((account) => account.kind === "organization");
        const selectedOwner = preferredOrg?.login ?? result.username;
        if (selectedOwner) {
          setSourceOwner(selectedOwner);
        }
      }
      setScmProvisioningMessage(
        result.username
          ? `GitHub OAuth connected as ${result.username}. Select the user or org that should own cto-gitops.`
          : "GitHub OAuth connected. CTO will use this token during install.",
      );
      setGithubOAuthPrompt(null);
    } catch (err) {
      if (githubOAuthAttemptId.current !== attemptId) return;
      setError(String(err));
    } finally {
      if (githubOAuthAttemptId.current === attemptId) {
        if (githubOAuthTimeout.current !== null) {
          window.clearTimeout(githubOAuthTimeout.current);
          githubOAuthTimeout.current = null;
        }
        setScmProvisioningBusy(false);
      }
    }
  }, [sourceOwner]);

  const resetGithubAuthorization = useCallback(() => {
    githubOAuthAttemptId.current += 1;
    if (githubOAuthTimeout.current !== null) {
      window.clearTimeout(githubOAuthTimeout.current);
      githubOAuthTimeout.current = null;
    }
    setScmProvisioningBusy(false);
    setGithubOAuthPrompt(null);
    setScmProvisioningMessage(
      "GitHub authorization reset. Switch to the right browser profile and start authorization again.",
    );
  }, []);

  const prepareOriginMirrorReview = useCallback(async () => {
    const hostedProvider = sourceProvider === "gitlab" ? "gitlab" : "github";
    const sourceConnectionId = sourceOwner.trim()
      ? sourceConnectionIdForProvider(hostedProvider, sourceOwner.trim())
      : sourceConnectionIdForProvider(hostedProvider, "approved-source");

    setScmProvisioningBusy(true);
    setError(null);
    setScmProvisioningMessage("Preparing a redacted 5D Origin mirror plan for review...");
    try {
      const plan = await prepareOriginTransfer({
        engine: sourceOriginEngine,
        sourceProvider: hostedProvider,
        sourceConnectionId,
        mode: "mirror",
      });
      setSourceOriginPlan(plan);
      setSourceOriginReviewOpen(true);
      setSourceOriginAppCreated(false);
      setScmProvisioningMessage(
        `${plan.appLabel} review is ready. Morgan will create ${plan.appName} only after you approve this redacted mirror plan.`,
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setScmProvisioningBusy(false);
    }
  }, [sourceOriginEngine, sourceOwner, sourceProvider]);

  const approveOriginApplication = useCallback(async () => {
    setScmProvisioningBusy(true);
    setError(null);
    setScmProvisioningMessage("Creating the 5D Origin Argo app from the repo-owned template...");
    try {
      const result = await provisionOriginApplication({
        engine: sourceOriginEngine,
        approved: true,
        dryRun: false,
      });
      setSourceOriginAppCreated(true);
      setSourceOriginReviewOpen(false);
      setScmProvisioningMessage(
        `${result.appName} is ready. CTO will mirror first and keep GitHub/GitLab as source of truth until you choose to migrate.`,
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setScmProvisioningBusy(false);
    }
  }, [sourceOriginEngine]);

  const startOverFromBeginning = useCallback(async () => {
    const confirmed = window.confirm(
      "Start over from the beginning? This clears saved setup choices and deletes the local CTO Kind cluster. GitHub repositories are not deleted.",
    );
    if (!confirmed) return;

    if (!isTauriCommandAvailable()) {
      setPreviewBanner("Start over is available in the desktop app.");
      return;
    }

    githubOAuthAttemptId.current += 1;
    if (githubOAuthTimeout.current !== null) {
      window.clearTimeout(githubOAuthTimeout.current);
      githubOAuthTimeout.current = null;
    }
    setResettingFlow(true);
    setError(null);
    setGithubOAuthPrompt(null);
    setScmProvisioningBusy(false);
    setScmProvisioningMessage("Clearing local setup state and deleting the CTO Kind cluster...");
    setProgress({
      stage: "reset",
      message: "Starting over...",
      progress: 2,
    });

    try {
      await invokeTauri<ResetLocalStackBootstrapReport>("reset_local_stack_bootstrap");
      window.location.reload();
    } catch (err) {
      setError(String(err));
      setResettingFlow(false);
    }
  }, []);

  useEffect(() => {
    setScmProvisioningMessage(null);
  }, [sourceHostMode, sourceHostUrl, sourceProvider]);

  const runBootstrap = useCallback(async () => {
    setState("checking");
    setDependencyPrepState("ready");
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
        setSetupScreen("agent-tokens");
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
          sourceCredentialForm.token,
          sourceAuthMode,
          null,
          selectedProviders,
          providerAuthInputs,
          providerAuthApiKeys,
          toolApiKeys,
          enabledDiscordAgents,
          discordAgentTokens,
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
      setGithubForm((current) => ({
        ...current,
        token: "",
        tokenSource: null,
      }));
    } catch (err) {
      setError(String(err));
      setState("failed");
    }
  }, [
    githubForm.token,
    discordAgentTokens,
    enabledDiscordAgents,
    persistSourceConnection,
    providerAuthApiKeys,
    providerAuthInputs,
    refreshMetrics,
    selectedProviders,
    setupProfile,
    sourceOwner,
    sourceCredentialForm.token,
    sourceAuthMode,
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
    if (isLocalStackBootstrapPreview()) return;

    let unlisten: (() => void) | undefined;

    listenTauri<GitHubCliOAuthPrompt>("github-cli-oauth-prompt", (event) => {
      setGithubOAuthPrompt(event.payload);
      setScmProvisioningMessage(event.payload.message);
      const uri = event.payload.verificationUri?.trim();
      if (uri && githubOAuthOpenedUri.current !== uri) {
        githubOAuthOpenedUri.current = uri;
        void openExternalUrl(uri).catch((err) => {
          setScmProvisioningMessage(
            `Morgan found the GitHub authorization URL, but the browser did not open automatically. Use Open GitHub authorization below. ${String(err)}`,
          );
        });
      }
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
    const code = githubOAuthPrompt?.userCode?.trim();
    if (morganAudioMuted) return;
    if (!code || spokenGithubOAuthCode.current === code) return;

    spokenGithubOAuthCode.current = code;
    const spokenCode = code
      .split("")
      .map((character) => (character === "-" ? "dash" : character))
      .join(", ");
    const cue = `I copied your GitHub code to the clipboard. The code is ${spokenCode}. Again, ${spokenCode}. Paste it into GitHub to continue.`;
    let cancelled = false;
    const client = githubOAuthVoiceClient.current ?? new VoiceClient();
    githubOAuthVoiceClient.current = client;

    void client.speakCue(cue, "github-oauth-code").catch((err) => {
      if (cancelled) return;
      console.debug("Morgan speech cue unavailable for GitHub OAuth code", err);
    });

    return () => {
      cancelled = true;
    };
  }, [githubOAuthPrompt?.userCode, morganAudioMuted]);

  useEffect(() => {
    return () => {
      if (githubOAuthTimeout.current !== null) {
        window.clearTimeout(githubOAuthTimeout.current);
      }
      githubOAuthVoiceClient.current?.close();
    };
  }, []);

  useEffect(() => {
    if (loadedDefaults.current) return;
    loadedDefaults.current = true;
    let cancelled = false;

    void invokeTauri<LocalStackBootstrapDefaults>("local_stack_bootstrap_defaults")
      .then((defaults) => {
        if (cancelled) return;
        applyBootstrapDefaults(defaults);
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
  }, [applyBootstrapDefaults]);

  useEffect(() => {
    if (state !== "credentials") return;

    let cancelled = false;
    void invokeTauri<AudioOutputStatus>("audio_output_status")
      .then((status) => {
        if (cancelled) return;
        setAudioWarning(status.warning);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    if (retriedGithubDefaults.current) return;
    if (state !== "credentials" || setupScreen !== "source") return;
    if (sourceProvider !== "github" || githubForm.token.trim()) return;
    if (!isTauriCommandAvailable()) return;

    retriedGithubDefaults.current = true;
    let cancelled = false;
    void invokeTauri<LocalStackBootstrapDefaults>("local_stack_bootstrap_defaults")
      .then((defaults) => {
        if (cancelled || !defaults.github.token) return;
        applyBootstrapDefaults(defaults);
      })
      .catch(() => {
        if (!cancelled) {
          retriedGithubDefaults.current = false;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applyBootstrapDefaults, githubForm.token, setupScreen, sourceProvider, state]);

  useEffect(() => {
    let cancelled = false;
    if (!morganMediaSlug) {
      setCaptionCues([]);
      setActiveCaptionText("");
      return () => {
        cancelled = true;
      };
    }

    const captionSrc = `/uploads/morgan/${morganMediaSlug}/captions.vtt`;
    setMorganVideoUnavailable(false);
    setActiveCaptionText("");

    void fetch(captionSrc)
      .then((response) => (response.ok ? response.text() : ""))
      .then((vtt) => {
        if (!cancelled) {
          setCaptionCues(parseWebVtt(vtt));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCaptionCues([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [morganMediaSlug]);

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
    const routeKeys = new Set(selectedHarnessModelRoutes.map((route) => route.key));
    const nextPrimaryKey =
      selectedHarnessModelRoutes.find((route) => route.key === selectedHarnessPrimaryModelKey)
        ?.key ??
      selectedHarnessModelRoutes[0]?.key ??
      null;

    if (nextPrimaryKey !== selectedHarnessPrimaryModelKey) {
      setSelectedHarnessPrimaryModelKey(nextPrimaryKey);
    }

    setEnabledHarnessFallbacks((current) => {
      const next: Partial<Record<string, boolean>> = {};
      for (const route of selectedHarnessModelRoutes) {
        next[route.key] = route.key === nextPrimaryKey ? true : current[route.key] ?? true;
      }

      const currentKeys = Object.keys(current).filter((key) => routeKeys.has(key));
      const nextKeys = Object.keys(next);
      const unchanged =
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => current[key] === next[key]);

      return unchanged ? current : next;
    });
  }, [selectedHarnessModelRoutes, selectedHarnessPrimaryModelKey]);

  useEffect(() => {
    if (state !== "checking" || progress.progress < 30) return;
    if (progress.progress - lastMetricsProgress.current < 25) return;

    lastMetricsProgress.current = progress.progress;
    void refreshMetrics();
  }, [progress.progress, refreshMetrics, state]);

  useEffect(() => {
    updateActiveCaption();
  }, [updateActiveCaption]);

  useEffect(() => {
    if (!morganMediaSlug) return;

    const playTimer = window.setTimeout(() => {
      void playMorganVideo();
    }, 0);
    if (setupScreen === "intro") {
      scheduleIntroAdvance();
    }

    return () => {
      window.clearTimeout(playTimer);
      clearIntroAdvanceTimer();
    };
  }, [clearIntroAdvanceTimer, morganMediaSlug, playMorganVideo, scheduleIntroAdvance, setupScreen]);

  if (state === "ready" && !isLocalStackBootstrapPreview()) {
    return <>{children}</>;
  }

  const metricItems = buildMetricsItems(metrics);
  const isIntro = state === "credentials" && setupScreen === "intro";
  const isCredentialSetup = state === "credentials" && setupScreen !== "intro";
  const hasMorganVideo = Boolean(morganMediaSlug) && !morganVideoUnavailable;
  const morganVideoSrc = morganMediaSlug ? `/uploads/morgan/${morganMediaSlug}/morgan.mp4` : "";
  const morganAudioSrc = morganMediaSlug ? `/uploads/morgan/${morganMediaSlug}/morgan.mp3` : "";
  const morganCaptionSrc = morganMediaSlug ? `/uploads/morgan/${morganMediaSlug}/captions.vtt` : "";
  const morganVariantKey = state === "checking" ? "install-start" : setupScreen;
  const showDevReset = import.meta.env.DEV && !isLocalStackBootstrapPreview();
  const setupTitle =
    state === "credentials"
      ? setupScreen === "source"
        ? "Source"
        : setupScreen === "harness"
          ? "Harnesses"
        : setupScreen === "clis"
          ? "ACP CLIs"
          : setupScreen === "profiles"
            ? "Providers"
            : setupScreen === "provider-models"
              ? "Models"
              : setupScreen === "harness-routing"
                ? "Harness routing"
              : setupScreen === "provider-auth"
                ? "Provider auth"
            : setupScreen === "tools"
              ? "Tool keys"
              : setupScreen === "agent-tokens"
                ? "Agent tokens"
              : "CTO"
      : "Installing";
  const handleMorganVideoEnded = () => {
    setActiveCaptionText("");
    if (isIntro && dependencyPrepState === "idle") {
      void prepareClusterDependencies();
    }
  };
  const handleMorganVideoLoadedMetadata = () => {
    const video = morganVideoRef.current;
    scheduleIntroAdvance(video?.duration);
  };
  const handleMorganVideoError = () => {
    setMorganVideoUnavailable(true);
    if (isIntro) {
      scheduleIntroAdvance();
    }
  };

  const sourceAdvancedPanel =
    showSourceAdvanced ? (
                          <div className="local-bootstrap__decision-branch" data-testid="source-auth-decision-tree">
                            {sourceProvider === "github" ? (
                            <div data-testid="source-auth-github-panel">
                              <div className="local-bootstrap__hint-row">
                                Install Morgan on the user, org, or repositories you want CTO to manage.
                                Morgan detects access after approval.
                              </div>
                              <div className="local-bootstrap__oauth-panel">
                                <button
                                  className="primary-btn"
                                  type="button"
                                  disabled={scmProvisioningBusy || (!sourceAuthStartReady && shouldAskForSourceNamespace && !sourceNamespaceReady)}
                                  data-testid="source-github-sign-in"
                                  onClick={() => {
                                    if (sourceAuthMode === "github-oauth") {
                                      void authorizeGithubWithCli();
                                      return;
                                    }
                                    if (sourceAuthMode === "github-enterprise-app") {
                                      setScmProvisioningMessage(
                                        "GitHub Enterprise app manifest is selected. CTO will prepare the enterprise manifest exchange during install.",
                                      );
                                      return;
                                    }
                                    setShowSourceAdvanced(true);
                                    setScmProvisioningMessage("Paste the token below to continue.");
                                  }}
                                >
                                  {scmProvisioningBusy
                                    ? "Authorizing..."
                                    : sourcePrimaryActionLabel(sourceProvider, sourceHostMode)}
                                </button>
                                <span className="field__help">
                                  {sourcePrimaryHelp(sourceProvider, sourceHostMode)}
                                </span>
                              </div>
                              {githubOAuthPrompt?.userCode || githubOAuthPrompt?.verificationUri ? (
                                <div className="local-bootstrap__oauth-code-card">
                                  <button
                                    className="ghost-btn"
                                    type="button"
                                    onClick={resetGithubAuthorization}
                                  >
                                    Reset authorization
                                  </button>
                                  <span className="field__help">
                                    {githubOAuthPrompt.copiedToClipboard
                                      ? "Morgan copied this code to your clipboard and is showing it here too."
                                      : githubOAuthPrompt.clipboardError
                                        ? `Morgan could not copy automatically: ${githubOAuthPrompt.clipboardError}`
                                        : "Copy this code into GitHub when the browser asks for it."}
                                  </span>
                                  {githubOAuthPrompt.userCode ? (
                                    <div className="local-bootstrap__oauth-code-row">
                                      <code className="local-bootstrap__oauth-code">
                                        {githubOAuthPrompt.userCode}
                                      </code>
                                      <button
                                        className="ghost-btn"
                                        type="button"
                                        onClick={() => {
                                          const code = githubOAuthPrompt.userCode;
                                          if (!code) return;
                                          void navigator.clipboard.writeText(code).then(() =>
                                            setScmProvisioningMessage(
                                              "GitHub code copied. Paste it into the GitHub browser prompt.",
                                            ),
                                          );
                                        }}
                                      >
                                        Copy code
                                      </button>
                                    </div>
                                  ) : null}
                                  {githubOAuthPrompt.verificationUri ? (
                                    <button
                                      className="ghost-btn"
                                      type="button"
                                      onClick={() => void openExternalUrl(githubOAuthPrompt.verificationUri ?? "")}
                                    >
                                      Open GitHub authorization
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="local-bootstrap__secondary-actions" aria-label="GitHub source options">
                                <button
                                  className="ghost-btn"
                                  type="button"
                                  onClick={() => setShowSourceAdvanced((visible) => !visible)}
                                >
                                  Review details
                                </button>
                                {showSourceAdvanced ? (
                                  <>
                                    <button
                                      className="ghost-btn"
                                      type="button"
                                      data-testid="source-github-enterprise"
                                      onClick={() => {
                                        const nextHostMode = sourceHostMode === "self-hosted" ? "hosted" : "self-hosted";
                                        setSourceHostMode(nextHostMode);
                                        setSourceHostUrl(nextHostMode === "hosted" ? SOURCE_DEFAULT_URLS.github : "");
                                        setSourceAuthMode(defaultAuthModeForSource("github", nextHostMode));
                                        setScmProvisioningMessage(null);
                                      }}
                                    >
                                      {sourceHostMode === "self-hosted" ? "Use GitHub.com" : "Using GitHub Enterprise?"}
                                    </button>
                                    <button
                                      className="ghost-btn"
                                      type="button"
                                      data-testid="source-auth-github-pat"
                                      onClick={() => {
                                        setSourceHostMode("hosted");
                                        setSourceHostUrl(SOURCE_DEFAULT_URLS.github);
                                        setSourceAuthMode(sourceAuthMode === "github-pat" ? "github-oauth" : "github-pat");
                                        setScmProvisioningMessage(null);
                                      }}
                                    >
                                      {sourceAuthMode === "github-pat" ? "Use GitHub sign-in instead" : sourceAdvancedFallbackLabel(sourceProvider)}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <div data-testid="source-auth-gitlab-panel">
                              {sourceProvider === "gitea" ? (
                                <>
                                  <div className="local-bootstrap__hint-row">
                                    5D Origin starts as a safe mirror and private agent CI lane. Keep GitHub/GitLab as source of truth until you choose to cut over.
                                  </div>
                                  <div className="local-bootstrap__oauth-panel local-bootstrap__oauth-panel--gitlab">
                                    <button
                                      className="primary-btn"
                                      type="button"
                                      data-testid="source-origin-review-plan"
                                      disabled={scmProvisioningBusy}
                                      onClick={() => {
                                        void prepareOriginMirrorReview();
                                      }}
                                    >
                                      {scmProvisioningBusy ? "Preparing..." : "Review mirror plan"}
                                    </button>
                                    <span className="field__help">
                                      Gitea is the lightweight 5D Origin path. Mirror first, test agent workflows, then cut over only when ready.
                                    </span>
                                  </div>
                                  {sourceOriginReviewOpen && sourceOriginPlan ? (
                                    <div className="local-bootstrap__origin-review" data-testid="source-origin-app-review">
                                      <strong>{sourceOriginPlan.appLabel}</strong>
                                      <span className="field__help">
                                        App: {sourceOriginPlan.appName} · mode: {sourceOriginPlan.mode} · secrets stay {sourceOriginPlan.redaction}
                                      </span>
                                      <ul>
                                        {sourceOriginPlan.actionPlan.map((step) => (
                                          <li key={step}>{step}</li>
                                        ))}
                                      </ul>
                                      <pre aria-label="Redacted Origin manifest preview">
                                        {sourceOriginPlan.manifestPreview}
                                      </pre>
                                      <button
                                        className="primary-btn"
                                        type="button"
                                        data-testid="source-origin-create-app"
                                        disabled={scmProvisioningBusy}
                                        onClick={() => {
                                          void approveOriginApplication();
                                        }}
                                      >
                                        Create app
                                      </button>
                                    </div>
                                  ) : null}
                                  {sourceOriginAppCreated ? (
                                    <div className="local-bootstrap__hint-row" data-testid="source-origin-created">
                                      5D Origin app created. Morgan will mirror first, then migrate only if you choose that later.
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <>
                              {selected5DOrigin ? (
                                <>
                                  <div className="local-bootstrap__hint-row">
                                    5D Origin GitLab starts as a safe mirror and private GitLab CI lane. Keep hosted GitHub/GitLab as source of truth until you choose to cut over.
                                  </div>
                                  <div className="local-bootstrap__oauth-panel local-bootstrap__oauth-panel--gitlab">
                                    <button
                                      className="primary-btn"
                                      type="button"
                                      data-testid="source-origin-review-plan"
                                      disabled={scmProvisioningBusy}
                                      onClick={() => {
                                        void prepareOriginMirrorReview();
                                      }}
                                    >
                                      {scmProvisioningBusy ? "Preparing..." : "Review mirror plan"}
                                    </button>
                                    <span className="field__help">
                                      GitLab uses GitLab CE when your team needs GitLab CI/workflows.
                                    </span>
                                  </div>
                                  {sourceOriginReviewOpen && sourceOriginPlan ? (
                                    <div className="local-bootstrap__origin-review" data-testid="source-origin-app-review">
                                      <strong>{sourceOriginPlan.appLabel}</strong>
                                      <span className="field__help">
                                        App: {sourceOriginPlan.appName} · mode: {sourceOriginPlan.mode} · secrets stay {sourceOriginPlan.redaction}
                                      </span>
                                      <ul>
                                        {sourceOriginPlan.actionPlan.map((step) => (
                                          <li key={step}>{step}</li>
                                        ))}
                                      </ul>
                                      <pre aria-label="Redacted Origin manifest preview">
                                        {sourceOriginPlan.manifestPreview}
                                      </pre>
                                      <button
                                        className="primary-btn"
                                        type="button"
                                        data-testid="source-origin-create-app"
                                        disabled={scmProvisioningBusy}
                                        onClick={() => {
                                          void approveOriginApplication();
                                        }}
                                      >
                                        Create app
                                      </button>
                                    </div>
                                  ) : null}
                                  {sourceOriginAppCreated ? (
                                    <div className="local-bootstrap__hint-row" data-testid="source-origin-created">
                                      5D Origin app created. Morgan will mirror first, then migrate only if you choose that later.
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                <div className="local-bootstrap__hint-row">
                                Install Morgan on GitLab, then Morgan detects your groups and projects.
                                Hosted, self-hosted, and token fallbacks stay in Review details.
                              </div>
                              <div className="local-bootstrap__oauth-panel local-bootstrap__oauth-panel--gitlab">
                                <button
                                  className="primary-btn"
                                  type="button"
                                  disabled={scmProvisioningBusy || (!sourceAuthStartReady && shouldAskForSourceNamespace && !sourceNamespaceReady)}
                                  data-testid="source-gitlab-install"
                                  onClick={() => {
                                    setScmProvisioningMessage(
                                      "Morgan will open GitLab app installation next, then detect the groups and projects you approve. If your company uses self-hosted GitLab, open Review details.",
                                    );
                                  }}
                                >
                                  {sourcePrimaryActionLabel(sourceProvider, sourceHostMode)}
                                </button>
                                <span className="field__help">
                                  {sourcePrimaryHelp(sourceProvider, sourceHostMode)}
                                </span>
                              </div>
                              <div className="local-bootstrap__secondary-actions" aria-label="GitLab source options">
                                <button
                                  className="ghost-btn"
                                  type="button"
                                  onClick={() => setShowSourceAdvanced((visible) => !visible)}
                                >
                                  Review details
                                </button>
                                {showSourceAdvanced ? (
                                  <>
                                    <button
                                      className="ghost-btn"
                                      type="button"
                                      data-testid="source-gitlab-self-managed"
                                      onClick={() => {
                                        const nextHostMode = sourceHostMode === "self-hosted" ? "hosted" : "self-hosted";
                                        setSourceHostMode(nextHostMode);
                                        setSourceHostUrl(nextHostMode === "hosted" ? SOURCE_DEFAULT_URLS.gitlab : "");
                                        setSourceAuthMode(defaultAuthModeForSource("gitlab", nextHostMode));
                                        setScmProvisioningMessage(null);
                                      }}
                                    >
                                      {sourceHostMode === "self-hosted" ? "Use GitLab.com" : "Use existing self-hosted GitLab"}
                                    </button>
                                    <button
                                      className="ghost-btn"
                                      type="button"
                                      data-testid="source-gitlab-token"
                                      onClick={() => {
                                        setSourceAuthMode("gitlab-token");
                                        setScmProvisioningMessage("Paste the GitLab project or group token below to continue.");
                                      }}
                                    >
                                      Use a manual token instead
                                    </button>
                                  </>
                                ) : null}
                              </div>
                              </>
                              )}
                              </>
                              )}
                            </div>
                            )}
                          </div>
                        ) : null;

  return (
    <div className="local-bootstrap" role="status" aria-live="polite">
      <div className="local-bootstrap__grid" />
      <div className="local-bootstrap__scan" />
      <div className="local-bootstrap__field" />
      {showDevReset ? (
        <div className="local-bootstrap__dev-controls" aria-label="Development setup controls">
          <button
            type="button"
            className="local-bootstrap__dev-control"
            aria-label="Previous setup screen"
            title="Previous setup screen"
            onClick={() => navigateSetupForDev("previous")}
            disabled={resettingFlow || state === "checking"}
          >
            <IconChevLeft size={16} />
          </button>
          <button
            type="button"
            className="local-bootstrap__dev-control"
            aria-label="Next setup screen"
            title="Next setup screen"
              onClick={() => navigateSetupForDev("next")}
              disabled={resettingFlow || state === "checking"}
            >
              <IconChevRight size={16} />
            </button>
          <button
            type="button"
            className={`local-bootstrap__dev-control${morganAudioMuted ? " is-active" : ""}`}
            aria-label={morganAudioMuted ? "Unmute Morgan audio" : "Mute Morgan audio"}
            aria-pressed={morganAudioMuted}
            title={morganAudioMuted ? "Unmute Morgan audio" : "Mute Morgan audio"}
            onClick={() => setMorganAudioMuted((muted) => !muted)}
          >
            {morganAudioMuted ? <IconVolumeOff size={16} /> : <IconVolume size={16} />}
          </button>
          <button
            type="button"
            className="local-bootstrap__dev-control"
            aria-label="Start over and clear the local CTO stack"
            title="Start over: clear saved setup choices and delete the local CTO Kind cluster"
            onClick={() => void startOverFromBeginning()}
            disabled={resettingFlow || state === "checking"}
          >
            <IconRefresh size={16} />
          </button>
        </div>
      ) : null}
      {isIntro ? <div className="local-bootstrap__aurora" aria-hidden="true" /> : null}
      {isIntro ? (
        <div className="local-bootstrap__intro-logo" aria-label="5D Labs">
          <img src={fiveDLabsLogo} alt="" />
          <strong>5D Labs</strong>
        </div>
      ) : null}

      <main
        className={`local-bootstrap__content${
          isIntro
            ? dependencyPrepState === "idle"
              ? " local-bootstrap__content--intro"
              : " local-bootstrap__content--intro local-bootstrap__content--intro-prep"
            : " local-bootstrap__content--setup"
        }`}
      >
        <section
          className={`local-bootstrap__machine${
            isIntro ? " local-bootstrap__machine--hero" : " local-bootstrap__machine--ambient"
          }`}
        >
          <div className="local-bootstrap__avatar">
            {hasMorganVideo ? (
              <video
                ref={morganVideoRef}
                key={morganVariantKey}
                className="local-bootstrap__avatar-video"
                src={morganVideoSrc}
                poster={MORGAN_PORTRAIT_SRC}
                autoPlay
                muted={morganAudioMuted}
                playsInline
                preload="auto"
                loop={false}
                onCanPlay={() => void playMorganVideo()}
                onLoadedMetadata={handleMorganVideoLoadedMetadata}
                onEnded={handleMorganVideoEnded}
                onError={handleMorganVideoError}
                onTimeUpdate={updateActiveCaption}
              >
                <track kind="captions" src={morganCaptionSrc} srcLang="en" label="English" />
              </video>
            ) : (
              <img className="local-bootstrap__avatar-video" src={MORGAN_PORTRAIT_SRC} alt="" />
            )}
            {!hasMorganVideo && morganMediaSlug ? (
              <audio
                ref={morganAudioRef}
                key={`${morganVariantKey}-audio`}
                src={morganAudioSrc}
                muted={morganAudioMuted}
                preload="auto"
                onCanPlay={() => void playMorganAudio()}
                onLoadedMetadata={(event) => scheduleIntroAdvance(event.currentTarget.duration)}
                onEnded={handleMorganVideoEnded}
                onError={() => {
                  if (isIntro) {
                    scheduleIntroAdvance();
                  }
                }}
                onTimeUpdate={updateActiveCaption}
              />
            ) : null}
          </div>
          <button
            type="button"
            className={`local-bootstrap__caption-toggle${captionsEnabled ? " is-active" : ""}`}
            aria-label={captionsEnabled ? "Hide Morgan captions" : "Show Morgan captions"}
            aria-pressed={captionsEnabled}
            onClick={() => setCaptionsEnabled((enabled) => !enabled)}
          >
            CC
          </button>
          {captionsEnabled && activeCaptionText ? (
            <div className="local-bootstrap__captions" role="status">
              {activeCaptionText}
            </div>
          ) : null}
          {audioWarning ? (
            <div className="local-bootstrap__audio-warning" role="status">
              {audioWarning}
            </div>
          ) : null}
        </section>

        {isIntro && dependencyPrepState === "idle" ? null : (
          <section
            className={`local-bootstrap__copy${
              isIntro ? " local-bootstrap__copy--intro" : " local-bootstrap__copy--wizard"
            }`}
          >
          {!isIntro ? <div className="local-bootstrap__eyebrow">CTO</div> : null}
          {previewBanner ? (
            <div className="local-bootstrap__preview-banner" role="status">
              {previewBanner}
            </div>
          ) : null}
          {!isIntro ? (
            <p className="local-bootstrap__tagline local-bootstrap__tagline--with-eyebrow">
              local stack
            </p>
          ) : null}
          <h1>{setupTitle}</h1>
          {isIntro ? <p className="local-bootstrap__tagline">local stack</p> : null}

          {isIntro ? (
            <div key="intro" className="local-bootstrap__stage local-bootstrap__stage--intro">
              <div className="local-bootstrap__intro-prep-card" data-testid="cluster-dependencies-first-screen">
                <div className="local-bootstrap__decision-card" role="status">
                  <span className="local-bootstrap__decision-card-kicker">Morgan</span>
                  <strong>I’ll prepare the Client Cluster first, then we’ll connect Source.</strong>
                </div>
                <section className="local-bootstrap__panel local-bootstrap__panel--focus" title="Client Cluster baseline">
                  <div className="local-bootstrap__panel-title">Client Cluster</div>
                  <div className="local-bootstrap__cluster-prep-grid local-bootstrap__cluster-prep-grid--baseline" aria-label="Client Cluster baseline prepared first">
                    <div title="Create or reuse the local Kind Client Cluster">
                      <span className="local-bootstrap__brand-mark" aria-hidden="true">
                        <IconCloud size={20} />
                      </span>
                      <strong>Kind</strong>
                      <em>Client Cluster</em>
                    </div>
                    <div title="Install the NGINX ingress controller">
                      <span className="local-bootstrap__brand-mark" aria-hidden="true">
                        <IconGlobe size={20} />
                      </span>
                      <strong>Ingress</strong>
                      <em>NGINX</em>
                    </div>
                    <div title="Install Argo CD with Helm">
                      <span className="local-bootstrap__brand-mark" aria-hidden="true">
                        <IconSparkles size={20} />
                      </span>
                      <strong>Argo CD</strong>
                      <em>Helm</em>
                    </div>
                    <div title="Apply baseline Argo Applications for CTO and local platform dependencies">
                      <span className="local-bootstrap__brand-mark" aria-hidden="true">
                        <IconPackage size={20} />
                      </span>
                      <strong>Charts</strong>
                      <em>CTO + Qdrant</em>
                    </div>
                  </div>

                  <div className="local-bootstrap__baseline-status" aria-label="Client Cluster pod status" data-testid="client-cluster-pod-status">
                    {buildClientClusterBaselineItems(metrics).map((item) => (
                      <span key={item.label}>
                        <strong>{item.label}</strong>
                        <em>{item.value}</em>
                      </span>
                    ))}
                  </div>

                  {dependencyPrepState !== "idle" ? (
                    <div className="local-bootstrap__progress local-bootstrap__progress--inline">
                      <div className="local-bootstrap__progress-track">
                        <span style={{ width: `${Math.max(4, Math.min(100, progress.progress))}%` }} />
                      </div>
                      <div className="local-bootstrap__progress-meta">
                        <span>{progress.stage}</span>
                        <span>{progress.progress}%</span>
                      </div>
                      <p>{progress.message}</p>
                    </div>
                  ) : null}

                  {error ? <div className="local-bootstrap__inline-error">{error}</div> : null}

                  <div className="local-bootstrap__actions local-bootstrap__actions--onepage local-bootstrap__actions--intro">
                    {dependencyPrepState === "ready" ? (
                      <button
                        className="primary-btn"
                        type="button"
                        title="Continue to Source"
                        onClick={() => setSetupScreen("source")}
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        className="primary-btn"
                        type="button"
                        title="Prepare Client Cluster baseline"
                        data-testid="prepare-cluster-dependencies"
                        disabled={dependencyPrepState === "running"}
                        onClick={() => void prepareClusterDependencies()}
                      >
                        {dependencyPrepState === "running" ? "Preparing" : dependencyPrepState === "failed" ? "Retry" : "Prepare"}
                      </button>
                    )}
                  </div>
                </section>
              </div>
            </div>
          ) : isCredentialSetup ? (
            <div
              key={setupScreen}
              className={`local-bootstrap__stage local-bootstrap__stage--${setupScreen} local-bootstrap__conversation-shell`}
              data-testid="morgan-conversation-shell"
              data-turn={morganConversationTurn}
              aria-label="Morgan setup conversation"
            >
              {activeMorganPrompt ? (
                <div className="local-bootstrap__decision-card" role="status">
                  <span className="local-bootstrap__decision-card-kicker">Morgan</span>
                  <strong>{activeMorganPrompt}</strong>
                </div>
              ) : null}
              {setupScreen === "source" ? (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--focus">
                  <section
                    className="local-bootstrap__panel local-bootstrap__panel--focus"
                    title="Repository authorization"
                  >
                    <div className="local-bootstrap__panel-title sr-only">Source</div>
                    <div className="local-bootstrap__auth-grid local-bootstrap__auth-grid--icons-only" aria-label="Source install actions" data-depth-selected={sourceModalProvider ?? "none"}>
                      <button
                        type="button"
                        aria-label="Install Morgan on GitHub"
                        title="Install Morgan on GitHub"
                        data-testid="source-install-github"
                        data-intent="source-provider-github source-install-github"
                        className={`local-bootstrap__auth-choice local-bootstrap__auth-choice--icon-first local-bootstrap__auth-choice--github${sourceProvider === "github" && sourceHostMode === "hosted" ? " is-selected" : ""}`}
                        onClick={() => {
                          githubOAuthAttemptId.current += 1;
                          if (githubOAuthTimeout.current !== null) {
                            window.clearTimeout(githubOAuthTimeout.current);
                            githubOAuthTimeout.current = null;
                          }
                          setGithubOAuthPrompt(null);
                          setScmProvisioningBusy(false);
                          setSourceProvider("github");
                          setSourceHostMode("hosted");
                          setSourceHostUrl(SOURCE_DEFAULT_URLS.github);
                          setSourceAuthMode(defaultAuthModeForSource("github", "hosted"));
                          setShowSourceAdvanced(false);
                          setScmProvisioningMessage(null);
                          setSourceModalProvider("github");
                        }}
                      >
                        <span className="local-bootstrap__install-stack">
                          <span className="local-bootstrap__install-icons" aria-hidden="true">
                            <span className="local-bootstrap__brand-mark local-bootstrap__install-icon local-bootstrap__install-icon--brand local-bootstrap__install-icon--dark">
                              <IconGitHub size={28} />
                            </span>

                          </span>
                          <span className="sr-only">GitHub</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="Install Morgan on GitLab"
                        title="Install Morgan on GitLab"
                        data-testid="source-install-gitlab"
                        data-intent="source-provider-gitlab source-install-gitlab"
                        className={`local-bootstrap__auth-choice local-bootstrap__auth-choice--icon-first local-bootstrap__auth-choice--gitlab${sourceProvider === "gitlab" && sourceHostMode === "hosted" ? " is-selected" : ""}`}
                        onClick={() => {
                          githubOAuthAttemptId.current += 1;
                          if (githubOAuthTimeout.current !== null) {
                            window.clearTimeout(githubOAuthTimeout.current);
                            githubOAuthTimeout.current = null;
                          }
                          setGithubOAuthPrompt(null);
                          setScmProvisioningBusy(false);
                          setSourceProvider("gitlab");
                          setSourceHostMode("hosted");
                          setSourceHostUrl(SOURCE_DEFAULT_URLS.gitlab);
                          setSourceAuthMode(defaultAuthModeForSource("gitlab", "hosted"));
                          setShowSourceAdvanced(false);
                          setScmProvisioningMessage(null);
                          setSourceModalProvider("gitlab");
                        }}
                      >
                        <span className="local-bootstrap__install-stack">
                          <span className="local-bootstrap__install-icons" aria-hidden="true">
                            <span className="local-bootstrap__brand-mark local-bootstrap__install-icon local-bootstrap__install-icon--brand local-bootstrap__install-icon--dark">
                              <IconGitLab size={28} />
                            </span>

                          </span>
                          <span className="sr-only">GitLab</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="Prepare 5D Origin mirror or managed source"
                        title="Prepare 5D Origin mirror or managed source"
                        data-testid="source-install-5d-origin"
                        data-intent="source-provider-5d-origin source-install-5d-origin"
                        className={`local-bootstrap__auth-choice local-bootstrap__auth-choice--icon-first local-bootstrap__auth-choice--origin${sourceModalProvider === "origin" || selected5DOrigin ? " is-selected" : ""}`}
                        onClick={() => {
                          githubOAuthAttemptId.current += 1;
                          if (githubOAuthTimeout.current !== null) {
                            window.clearTimeout(githubOAuthTimeout.current);
                            githubOAuthTimeout.current = null;
                          }
                          setGithubOAuthPrompt(null);
                          setScmProvisioningBusy(false);
                          setSourceProvider(sourceOriginEngine === "gitlab-compatible" ? "gitlab" : "gitea");
                          setSourceHostMode("self-hosted");
                          setSourceHostUrl("");
                          setSourceOwner((current) => current.trim() || "cto");
                          setSourceAuthMode(sourceOriginEngine === "gitlab-compatible" ? "gitlab-instance-oauth-app" : "gitlab-token");
                          setSourceOriginPlan(null);
                          setSourceOriginReviewOpen(false);
                          setSourceOriginAppCreated(false);
                          setShowSourceAdvanced(false);
                          setScmProvisioningMessage(null);
                          setSourceModalProvider("origin");
                        }}
                      >
                        <span className="local-bootstrap__install-stack">
                          <span className="local-bootstrap__install-icons" aria-hidden="true">
                            <span className="local-bootstrap__brand-mark local-bootstrap__install-icon local-bootstrap__install-icon--brand local-bootstrap__install-icon--dark">
                              <Icon5DOriginMono size={28} />
                            </span>

                          </span>
                          <span className="sr-only">5D Origin</span>
                        </span>
                      </button>
                    </div>



                    {sourceModalProvider ? (
                      <div className="local-bootstrap__source-modal-backdrop" role="presentation" onClick={() => setSourceModalProvider(null)}>
                        <div
                          className="local-bootstrap__source-modal"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="source-modal-title"
                          data-testid="source-choice-modal"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            className="local-bootstrap__modal-close"
                            type="button"
                            aria-label="Close source options"
                            title="Close"
                            onClick={() => setSourceModalProvider(null)}
                          >
                            ×
                          </button>
                          <div className="local-bootstrap__source-modal-icon" aria-hidden="true">
                            <span className="local-bootstrap__brand-mark local-bootstrap__install-icon local-bootstrap__install-icon--brand local-bootstrap__install-icon--dark">
                              {sourceModalProvider === "github" ? (
                                <IconGitHub size={38} />
                              ) : sourceModalProvider === "gitlab" ? (
                                <IconGitLab size={38} />
                              ) : (
                                <Icon5DOriginMono size={40} />
                              )}
                            </span>
                          </div>
                          <h3 id="source-modal-title">
                            {sourceModalProvider === "github"
                              ? "GitHub"
                              : sourceModalProvider === "gitlab"
                                ? "GitLab"
                                : "5D Origin"}
                          </h3>
                          {sourceModalProvider === "origin" ? (
                            <>
                              <div className="local-bootstrap__origin-engines" aria-label="5D Origin destination" data-testid="source-origin-options">
                                <button
                                  type="button"
                                  aria-label="Use Gitea under 5D Origin"
                                  title="Gitea under 5D Origin"
                                  className={`local-bootstrap__origin-engine local-bootstrap__origin-engine--gitea${sourceOriginEngine === "standard" ? " is-selected" : ""}`}
                                  data-testid="source-origin-standard"
                                  onClick={() => {
                                    setSourceOriginEngine("standard");
                                    setSourceProvider("gitea");
                                    setSourceHostMode("self-hosted");
                                    setSourceHostUrl("");
                                    setSourceAuthMode("gitlab-token");
                                    setSourceOwner((current) => current.trim() || "cto");
                                    setSourceOriginPlan(null);
                                    setSourceOriginReviewOpen(false);
                                    setSourceOriginAppCreated(false);
                                    setShowSourceAdvanced(false);
                                  }}
                                >
                                  <IconGiteaMono size={46} />
                                  <span className="sr-only">Gitea</span>
                                </button>
                                <button
                                  type="button"
                                  aria-label="Use GitLab under 5D Origin"
                                  title="GitLab under 5D Origin"
                                  className={`local-bootstrap__origin-engine local-bootstrap__origin-engine--gitlab${sourceOriginEngine === "gitlab-compatible" ? " is-selected" : ""}`}
                                  data-testid="source-origin-gitlab-compatible"
                                  onClick={() => {
                                    setSourceOriginEngine("gitlab-compatible");
                                    setSourceProvider("gitlab");
                                    setSourceHostMode("self-hosted");
                                    setSourceHostUrl("");
                                    setSourceAuthMode("gitlab-instance-oauth-app");
                                    setSourceOwner((current) => current.trim() || "cto");
                                    setSourceOriginPlan(null);
                                    setSourceOriginReviewOpen(false);
                                    setSourceOriginAppCreated(false);
                                    setShowSourceAdvanced(false);
                                  }}
                                >
                                  <IconGitLab size={46} />
                                  <span className="sr-only">GitLab</span>
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p>Install Morgan, approve access, and I’ll detect what you selected.</p>
                              <button
                                className="primary-btn"
                                type="button"
                                data-testid="source-modal-continue"
                                onClick={() => {
                                  setShowSourceAdvanced(true);
                                }}
                              >
                                Continue
                              </button>
                              <button
                                className="ghost-btn"
                                type="button"
                                onClick={() => {
                                  setShowSourceAdvanced(true);
                                }}
                              >
                                Review details
                              </button>
                            </>
                          )}
                          {showSourceAdvanced ? (
                            <div className="local-bootstrap__source-modal-body">
                              {sourceAdvancedPanel}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div data-testid="source-shared-followup" />

                    {sourceModalProvider === null && sourceHostMode === "self-hosted" && sourceProvider !== "gitea" ? (
                      <div className="field">
                        <span className="field__label">
                          {sourceProvider === "github"
                            ? "GitHub Enterprise Server URL"
                            : "GitLab self-managed URL"}
                        </span>
                        <input
                          className="field__input"
                          data-testid="source-base-url"
                          type="url"
                          autoComplete="url"
                          placeholder={
                            sourceProvider === "github"
                              ? "https://github.example.com"
                              : "https://gitlab.example.com"
                          }
                          value={sourceHostUrl}
                          onChange={(event) => setSourceHostUrl(event.target.value)}
                        />
                      </div>
                    ) : null}

                    {sourceModalProvider === null && shouldAskForSourceNamespace ? (
                      <div className="field">
                        <span className="field__label">{sourceNamespaceLabel(sourceProvider)}</span>
                        {sourceProvider === "github" && githubAccountOptions.length > 0 ? (
                          <select
                            className="field__input"
                            value={sourceOwner}
                            onChange={(event) => {
                              setSourceOwner(event.target.value);
                              setGithubForm((current) => ({ ...current, owner: event.target.value }));
                            }}
                          >
                            {githubAccountOptions.map((account) => (
                              <option key={`${account.kind}:${account.login}`} value={account.login}>
                                {account.login} ({account.kind === "organization" ? "org" : "user"})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="field__input"
                            type="text"
                            autoComplete="organization"
                            placeholder={sourceNamespacePlaceholder(sourceProvider)}
                            value={sourceOwner}
                            onChange={(event) => {
                              setSourceOwner(event.target.value);
                              if (sourceProvider === "github") {
                                setGithubForm((current) => ({ ...current, owner: event.target.value }));
                              }
                            }}
                          />
                        )}
                        <span className="field__help">
                          Morgan uses this only after sign-in shows which accounts are available.
                        </span>
                      </div>
                    ) : null}

                    {sourceModalProvider === null && isManualSourceTokenMode(sourceAuthMode) && showSourceAdvanced ? (
                      <div className="field">
                        <span className="field__label">{sourceTokenLabel(sourceProvider)}</span>
                        <input
                          className="field__input"
                          type="password"
                          autoComplete="off"
                          placeholder={sourceTokenPlaceholder(sourceProvider)}
                          value={sourceProvider === "github" ? githubForm.token : sourceCredentialForm.token}
                          onChange={(event) => {
                            const token = event.target.value;
                            if (sourceProvider === "github") {
                              setGithubForm((current) => ({
                                ...current,
                                enabled: true,
                                token,
                                tokenSource: null,
                                owner: sourceOwner,
                              }));
                            } else {
                              setSourceCredentialForm({ token });
                            }
                          }}
                        />
                        <span className="field__help">{sourceTokenHelp(sourceProvider)}</span>
                      </div>
                    ) : null}

                    {sourceModalProvider === null && showSourceAdvanced && isGitHubManifestMode(sourceAuthMode) ? (
                      <div className="local-bootstrap__hint-row">
                        GitHub Enterprise Server will use the app manifest exchange at
                        <code>/api/v3/app-manifests</code>.
                      </div>
                    ) : sourceAuthMode === "gitlab-instance-oauth-app" ? (
                      <div className="local-bootstrap__hint-row">
                        Self-managed GitLab will use the instance OAuth application API at
                        <code>/api/v4/applications</code>.
                      </div>
                    ) : null}
                    {githubForm.token && githubForm.tokenSource === "GitHub OAuth" ? (
                      <div className="local-bootstrap__hint-row">
                        GitHub OAuth connected. CTO will apply the OAuth token during install.
                      </div>
                    ) : null}
                    {scmProvisioningMessage ? (
                      <div className="local-bootstrap__hint-row">{scmProvisioningMessage}</div>
                    ) : null}
                    {error ? <div className="local-bootstrap__inline-error">{error}</div> : null}
                    <div className="local-bootstrap__actions local-bootstrap__actions--onepage">
                      <button
                        className="primary-btn"
                        type="button"
                        title="Continue to harness selection"
                        disabled={!sourceReady}
                        onClick={() => {
                          void handleMorganSelection("Source is set. Next I’ll tune the agent harness.", () => setSetupScreen("harness"));
                        }}
                      >
                        Continue
                      </button>
                    </div>
                  </section>
                </div>
              ) : setupScreen === "clis" ? (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--clis">
                  <section
                    className="local-bootstrap__panel local-bootstrap__panel--focus"
                    title="ACP CLI selection"
                  >
                    <div className="local-bootstrap__panel-title">ACP CLIs</div>
                    <p className="local-bootstrap__panel-copy">
                      Pick the coding surfaces CTO should prepare. Morgan will use these to filter
                      provider and model choices next.
                    </p>
                    <div className="local-bootstrap__decision-prompt">Which coding CLIs should CTO prepare?</div>
                    <div className="local-bootstrap__choice-grid local-bootstrap__choice-grid--clis">
                      {AI_CLIS.map((item) => {
                        const CliIcon = item.icon;
                        const selected = Boolean(selectedCliIds[item.id]);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            title={item.summary}
                            aria-pressed={selected}
                            className={`local-bootstrap__choice local-bootstrap__choice--large${
                              selected ? " is-selected" : ""
                            }`}
                            onClick={() => {
                              void handleMorganSelection(`${item.name} selected. I’ll tune provider choices around it.`, () => {
                                setSelectedCliIds((current) => {
                                  const next = { ...current };
                                  if (next[item.id]) {
                                    delete next[item.id];
                                  } else {
                                    next[item.id] = true;
                                  }
                                  return next;
                                });
                              });
                            }}
                          >
                            <span className="local-bootstrap__brand-mark local-bootstrap__brand-mark--large">
                              <CliIcon size={22} />
                            </span>
                            <strong>{item.name}</strong>
                          </button>
                        );
                      })}
                    </div>

                    {error ? <div className="local-bootstrap__inline-error">{error}</div> : null}

                    <div className="local-bootstrap__actions local-bootstrap__actions--onepage">
                      <button
                        className="ghost-btn"
                        type="button"
                        title="Back to harness selection"
                        onClick={() => setSetupScreen("harness")}
                      >
                        Back
                      </button>
                      <button
                        className="primary-btn"
                        type="button"
                        title="Continue to providers"
                        disabled={!clisReady}
                        onClick={() => setSetupScreen("profiles")}
                      >
                        Continue
                      </button>
                    </div>
                  </section>
                </div>
              ) : setupScreen === "profiles" ? (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--profiles">
                  <section className="local-bootstrap__panel" title="Provider profiles">
                    <div className="local-bootstrap__panel-title">Providers</div>
                    {selectedProviderFilterCliIds.length > 0 ? (
                      <p className="local-bootstrap__panel-hint">
                        Showing recommended providers for your selected coding CLIs first.
                      </p>
                    ) : null}
                    <label className="local-bootstrap__provider-search">
                      <span aria-hidden="true">
                        <IconSearch size={14} />
                      </span>
                      <input
                        type="search"
                        aria-label="Search providers"
                        value={providerSearch}
                        onChange={(event) => setProviderSearch(event.target.value)}
                        placeholder="Search providers..."
                      />
                    </label>
                    <div className="local-bootstrap__provider-list">
                      {visibleProviderOptions.length === 0 ? (
                        <div
                          className="local-bootstrap__empty-state"
                          title="No providers match the current filter"
                        >
                          No matching providers
                        </div>
                      ) : null}
                      {limitedProviderOptions.map((provider) => {
                        const ProviderIcon = provider.icon;
                        const providerIconSrc = PROVIDER_ICON_SRC[provider.id];
                        const selected = Boolean(selectedProviderIds[provider.id]);
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
                                      [provider.id]: models[provider.id] ?? [provider.models[0]],
                                   }));
                                  }
                                }}
                            >
                              <span className="local-bootstrap__brand-mark">
                                {providerIconSrc ? (
                                  <img src={providerIconSrc} alt="" aria-hidden="true" />
                                ) : (
                                  <ProviderIcon size={16} />
                                )}
                               </span>
                               <strong>{provider.name}</strong>
                             </button>
                           </article>
                        );
                      })}
                    </div>
                    {hiddenProviderCount > 0 ? (
                      <button
                        type="button"
                        className="ghost-btn local-bootstrap__provider-show-all"
                        title="Show all providers"
                        onClick={() => setShowAllProviders(true)}
                      >
                        Show all providers ({hiddenProviderCount} more)
                      </button>
                    ) : null}
                  </section>

                  {error ? <div className="local-bootstrap__inline-error">{error}</div> : null}

                  <div className="local-bootstrap__actions local-bootstrap__actions--onepage">
                    <button
                        className="ghost-btn"
                        type="button"
                      title="Back to ACP CLIs"
                      onClick={() => setSetupScreen("clis")}
                    >
                      Back
                    </button>
                    <button
                        className="primary-btn"
                        type="button"
                        title="Configure provider authentication"
                      disabled={!providersReady}
                        onClick={() => setSetupScreen("provider-models")}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : setupScreen === "provider-models" ? (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--provider-models">
                  <section className="local-bootstrap__panel" title="Selected provider models">
                    <div className="local-bootstrap__panel-title">Models</div>
                    <div className="local-bootstrap__provider-model-list">
                      {selectedProviders.map((provider) => {
                        const ProviderIcon = provider.icon;
                        const providerIconSrc = PROVIDER_ICON_SRC[provider.id];
                        const providerSelectedModels =
                          selectedModels[provider.id] ?? [provider.models[0]];
                        return (
                          <article
                            key={provider.id}
                            className="local-bootstrap__provider-model-card"
                            title={provider.summary}
                          >
                            <span className="local-bootstrap__tool-key-heading">
                              <span className="local-bootstrap__brand-mark">
                                {providerIconSrc ? (
                                  <img src={providerIconSrc} alt="" aria-hidden="true" />
                                ) : (
                                  <ProviderIcon size={16} />
                                )}
                              </span>
                              <span>
                                <strong>{provider.name}</strong>
                                <em>{provider.models.length} models</em>
                              </span>
                            </span>
                            <div className="local-bootstrap__provider-model-options">
                              {provider.models.map((model) => {
                                const modelSelected = providerSelectedModels.includes(model);
                                return (
                                  <button
                                    key={model}
                                    type="button"
                                    className={modelSelected ? "is-selected" : ""}
                                    title={`${provider.name} ${model}`}
                                    onClick={() =>
                                      setSelectedModels((current) => {
                                        const existing = current[provider.id] ?? [];
                                        const nextModels = existing.includes(model)
                                          ? existing.filter((item) => item !== model)
                                          : [...existing, model];

                                        return {
                                          ...current,
                                          [provider.id]:
                                            nextModels.length > 0 ? nextModels : [provider.models[0]],
                                        };
                                      })
                                    }
                                  >
                                    {model}
                                  </button>
                                );
                              })}
                            </div>
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
                      title="Back to providers"
                      onClick={() => setSetupScreen("profiles")}
                    >
                      Back
                    </button>
                    <button
                      className="primary-btn"
                      type="button"
                      title="Choose harness routing"
                      disabled={!providersReady}
                      onClick={() => setSetupScreen("harness-routing")}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : setupScreen === "harness-routing" ? (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--harness-routing">
                  <section className="local-bootstrap__panel" title="ACP harness model routing">
                    <div className="local-bootstrap__panel-title">Harness routing</div>
                    <p className="local-bootstrap__panel-copy">
                      Pick the primary model the ACP harness should try first. Every selected
                      provider model is enabled as a fallback by default; turn off only the models
                      you do not want in the routing pool.
                    </p>
                    <div className="local-bootstrap__harness-route-list">
                      {selectedHarnessModelRoutes.map((route) => {
                        const ProviderIcon = route.icon;
                        const isPrimary = effectivePrimaryHarnessModelRoute?.key === route.key;
                        const fallbackEnabled =
                          isPrimary || enabledHarnessFallbacks[route.key] !== false;
                        return (
                          <article
                            key={route.key}
                            className={`local-bootstrap__harness-route-card${
                              isPrimary ? " is-primary" : ""
                            }`}
                            title={`${route.providerName} ${route.model}`}
                          >
                            <span className="local-bootstrap__tool-key-heading">
                              <span className="local-bootstrap__brand-mark">
                                {route.iconSrc ? (
                                  <img src={route.iconSrc} alt="" aria-hidden="true" />
                                ) : (
                                  <ProviderIcon size={16} />
                                )}
                              </span>
                              <span>
                                <strong>{route.model}</strong>
                                <em>{route.providerName}</em>
                              </span>
                            </span>
                            <div className="local-bootstrap__route-controls">
                              <label>
                                <input
                                  type="radio"
                                  name="harness-primary-model"
                                  checked={isPrimary}
                                  onChange={() => {
                                    setSelectedHarnessPrimaryModelKey(route.key);
                                    setEnabledHarnessFallbacks((current) => ({
                                      ...current,
                                      [route.key]: true,
                                    }));
                                  }}
                                />
                                <span>Primary</span>
                              </label>
                              <label className={isPrimary ? "is-locked" : ""}>
                                <input
                                  type="checkbox"
                                  checked={fallbackEnabled}
                                  disabled={isPrimary}
                                  onChange={(event) =>
                                    setEnabledHarnessFallbacks((current) => ({
                                      ...current,
                                      [route.key]: event.target.checked,
                                    }))
                                  }
                                />
                                <span>{isPrimary ? "Primary route" : "Fallback"}</span>
                              </label>
                            </div>
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
                      title="Back to provider models"
                      onClick={() => setSetupScreen("provider-models")}
                    >
                      Back
                    </button>
                    <button
                      className="primary-btn"
                      type="button"
                      title="Configure provider authentication"
                      disabled={!routingReady}
                      onClick={() => setSetupScreen("provider-auth")}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : setupScreen === "provider-auth" ? (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--provider-auth">
                  <section className="local-bootstrap__panel" title="Selected provider authentication">
                    <div className="local-bootstrap__panel-title">Provider authentication</div>
                    <div className="local-bootstrap__provider-auth-list">
                      {selectedProviders.map((provider) => {
                        const ProviderIcon = provider.icon;
                        const providerIconSrc = PROVIDER_ICON_SRC[provider.id];
                        const value = providerAuthInputs[provider.id] ?? "";
                        const apiKeyValue = providerAuthApiKeys[provider.id] ?? "";
                        return (
                          <article
                            key={provider.id}
                            className="local-bootstrap__provider-auth-card"
                            title={provider.summary}
                          >
                            <span className="local-bootstrap__tool-key-heading">
                              <span className="local-bootstrap__brand-mark">
                                {providerIconSrc ? (
                                  <img src={providerIconSrc} alt="" aria-hidden="true" />
                                ) : (
                                  <ProviderIcon size={16} />
                                )}
                              </span>
                              <span>
                                <strong>{provider.name}</strong>
                                <em>{providerAuthLabel(provider.auth)}</em>
                              </span>
                            </span>
                            {provider.auth === "oauth" ? (
                              <button
                                className="local-bootstrap__auth-button"
                                type="button"
                                onClick={() =>
                                  setPreviewBanner(
                                    `${provider.name} OAuth will open from the desktop app.`,
                                  )
                                }
                              >
                                Start OAuth
                              </button>
                            ) : provider.auth === "local" || provider.auth === "gateway" ? (
                              <div className="local-bootstrap__provider-auth-fields">
                                <input
                                  className="field__input"
                                  type="text"
                                  autoComplete="off"
                                  placeholder={providerAuthPlaceholder(provider.auth, provider.name)}
                                  value={value}
                                  onChange={(event) =>
                                    setProviderAuthInputs((current) => ({
                                      ...current,
                                      [provider.id]: event.target.value,
                                    }))
                                  }
                                />
                                <input
                                  className="field__input"
                                  type="password"
                                  autoComplete="off"
                                  placeholder={providerApiKeyPlaceholder(provider.auth, provider.name)}
                                  value={apiKeyValue}
                                  onChange={(event) =>
                                    setProviderAuthApiKeys((current) => ({
                                      ...current,
                                      [provider.id]: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                            ) : (
                              <input
                                className="field__input"
                                type={provider.auth === "api-key" ? "password" : "text"}
                                autoComplete="off"
                                placeholder={providerAuthPlaceholder(provider.auth, provider.name)}
                                value={value}
                                onChange={(event) =>
                                  setProviderAuthInputs((current) => ({
                                    ...current,
                                    [provider.id]: event.target.value,
                                  }))
                                }
                              />
                            )}
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
                      title="Back to harness routing"
                      onClick={() => setSetupScreen("harness-routing")}
                    >
                      Back
                    </button>
                    <button
                      className="primary-btn"
                      type="button"
                      title="Configure tool API keys"
                      disabled={!providersReady}
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
                        <strong>cto/cto-agent-keys</strong>
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
                      title="Back to provider authentication"
                      onClick={() => setSetupScreen("provider-auth")}
                    >
                      Back
                    </button>
                    <button
                      className="primary-btn"
                      type="button"
                      title="Configure agent Discord tokens"
                      disabled={!canContinue}
                      onClick={() => setSetupScreen("agent-tokens")}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : setupScreen === "agent-tokens" ? (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--agent-tokens">
                  <section className="local-bootstrap__panel" title="Discord bot tokens for coding agents">
                    <div className="local-bootstrap__panel-title">Agent Discord bots</div>
                    <div className="local-bootstrap__agent-token-summary" aria-label="Discord token setup summary">
                      <div>
                        <span>Secret</span>
                        <strong>cto/openclaw-discord-tokens</strong>
                      </div>
                      <div>
                        <span>Enabled agents</span>
                        <strong>
                          {enabledDiscordAgentCount} of {CODING_DISCORD_AGENTS.length}
                        </strong>
                      </div>
                      <div>
                        <span>Configured tokens</span>
                        <strong>
                          {configuredDiscordTokenCount} of {enabledDiscordAgentCount}
                        </strong>
                      </div>
                    </div>
                    <div className="local-bootstrap__agent-token-list">
                      {CODING_DISCORD_AGENTS.map((agent) => {
                        const enabled = enabledDiscordAgents[agent.id] === true;
                        const token = discordAgentTokens[agent.id] ?? "";
                        return (
                          <article
                            key={agent.id}
                            className={`local-bootstrap__agent-token-card${enabled ? " is-enabled" : ""}`}
                          >
                            <div className="local-bootstrap__agent-token-heading">
                              <span
                                className={`local-bootstrap__agent-avatar${
                                  agent.avatarSrc ? "" : " local-bootstrap__agent-avatar--fallback"
                                }`}
                                style={{ "--agent-hue": String(agent.hue) } as CSSProperties}
                                aria-hidden="true"
                              >
                                <span className="local-bootstrap__agent-avatar-initial">
                                  {getAgentFallbackLabel(agent.name)}
                                </span>
                                {agent.avatarSrc ? (
                                  <img
                                    src={agent.avatarSrc}
                                    alt=""
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                ) : null}
                              </span>
                              <span>
                                <strong>{agent.name}</strong>
                                <em>{agent.role}</em>
                              </span>
                              <button
                                type="button"
                                className={`local-bootstrap__agent-toggle${enabled ? " is-active" : ""}`}
                                aria-pressed={enabled}
                                aria-label={`${enabled ? "Disable" : "Enable"} ${agent.name}`}
                                onClick={() => {
                                  setEnabledDiscordAgents((current) => {
                                    const next = { ...current };
                                    if (next[agent.id]) {
                                      delete next[agent.id];
                                    } else {
                                      next[agent.id] = true;
                                    }
                                    return next;
                                  });
                                }}
                              >
                                {enabled ? "On" : "Off"}
                              </button>
                            </div>
                            {enabled ? (
                              <input
                                className="field__input"
                                type="password"
                                autoComplete="off"
                                placeholder={`${agent.name} Discord bot token`}
                                value={token}
                                onChange={(event) =>
                                  setDiscordAgentTokens((current) => ({
                                    ...current,
                                    [agent.id]: event.target.value,
                                  }))
                                }
                              />
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
                      title="Back to tool API keys"
                      onClick={() => setSetupScreen("tools")}
                    >
                      Back
                    </button>
                    <button
                      className="primary-btn"
                      type="button"
                      title="Start CTO"
                      disabled={!canContinue}
                      onClick={() => void runBootstrap()}
                    >
                      Start
                    </button>
                  </div>
                </div>
              ) : (
                <div className="local-bootstrap__wizard local-bootstrap__wizard--focus">
                  <section
                    className="local-bootstrap__panel local-bootstrap__panel--focus"
                    title="ACP harness agent"
                  >
                    <div className="local-bootstrap__panel-title">Harnesses</div>
                    <p className="local-bootstrap__panel-copy">
                      Choose the agent harness CTO should run before selecting ACP CLIs. Provider
                      and model choices are stored after the CLI step.
                    </p>
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

                    {error ? <div className="local-bootstrap__inline-error">{error}</div> : null}

                    <div className="local-bootstrap__actions local-bootstrap__actions--onepage">
                      <button
                        className="ghost-btn"
                        type="button"
                        title="Back to source"
                        onClick={() => setSetupScreen("source")}
                      >
                        Back
                      </button>
                      <button
                        className="primary-btn"
                        type="button"
                        title="Continue to ACP CLIs"
                        disabled={!harnessReady}
                        onClick={() => setSetupScreen("clis")}
                      >
                        Continue
                      </button>
                    </div>
                  </section>
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
        )}
      </main>
    </div>
  );
}
