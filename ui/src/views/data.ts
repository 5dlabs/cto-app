export type ProjectStatus = "pending" | "in_progress" | "complete";

export interface Project {
  id: string;
  name: string;
  summary: string;
  status: ProjectStatus;
  repo?: string;
}

export const PROJECTS: Project[] = [];

export interface ServiceCard {
  tag: string;
  tagline: string;
  description: string;
  stack: string;
}

export interface ServiceCategory {
  name: string;
  blurb: string;
  services: ServiceCard[];
}

export const INFRASTRUCTURE: ServiceCategory[] = [
  {
    name: "Security",
    blurb:
      "Continuous vulnerability scanning, dependency analysis, and AI-native remediation running across every service — integrated into the same agent pipeline as everything else.",
    services: [
      {
        tag: "SENTINEL",
        tagline: "Continuous security scanning and AI remediation",
        description:
          "Continuous vulnerability scanning, dependency analysis, and AI-native remediation running across every service. Cipher doesn't just flag issues — it ships the fix through the same agent pipeline as everything else.",
        stack: "Snyk + Nuclei + Aikido + Semgrep + CodeQL",
      },
    ],
  },
  {
    name: "Data & Storage",
    blurb:
      "Managed databases, object storage, and high-performance block volumes — operated for you so your team never has to think about storage engineering.",
    services: [
      {
        tag: "DATA",
        tagline: "Managed PostgreSQL",
        description:
          "Production-grade PostgreSQL clusters with automated backups, point-in-time recovery, connection pooling, and high-availability failover. Zero manual DBA work.",
        stack: "CloudNativePG operator",
      },
      {
        tag: "CACHE",
        tagline: "High-performance in-memory data layer",
        description:
          "Redis-compatible caching and pub/sub infrastructure with sub-millisecond latency. Ideal for session state, rate limiting, leaderboards, and real-time pipelines.",
        stack: "Redis operator (Valkey)",
      },
      {
        tag: "STORE",
        tagline: "S3-compatible object storage",
        description:
          "Fast distributed object storage for assets, artifacts, model weights, backups, and durable application data. S3-compatible API — no vendor lock-in.",
        stack: "SeaweedFS operator",
      },
      {
        tag: "VOLUME",
        tagline: "NVMe-backed block volumes",
        description:
          "High-performance persistent block storage with synchronous replication. Built for databases, message queues, and stateful workloads that need speed and durability on bare metal.",
        stack: "Mayastor (OpenEBS)",
      },
    ],
  },
  {
    name: "AI & Inference",
    blurb:
      "Managed model runtimes across hosted providers and dedicated GPU infrastructure — with a consistent API surface regardless of where the model runs.",
    services: [
      {
        tag: "INFERENCE",
        tagline: "Managed model runtime",
        description:
          "Run open-weight models on dedicated GPU infrastructure or route to hosted providers (OpenAI, Anthropic, Google) behind a single OpenAI-compatible API. Scale from zero. Hot-swap models without code changes.",
        stack: "KubeAI operator (vLLM, Ollama, FasterWhisper) + NVIDIA GPU operator",
      },
      {
        tag: "LLAMASTACK",
        tagline: "Meta LlamaStack inference and agents",
        description:
          "Deploy and manage Meta's LlamaStack distributions for agentic inference workflows. Purpose-built for teams building on Llama models with structured tool use and memory.",
        stack: "LlamaStack Kubernetes operator",
      },
    ],
  },
  {
    name: "Messaging & Events",
    blurb:
      "High-throughput, durable messaging for agent-to-agent communication, event-driven services, and real-time workloads.",
    services: [
      {
        tag: "STREAM",
        tagline: "Cloud-native messaging and event streaming",
        description:
          "High-performance publish/subscribe, request-reply, and persistent JetStream messaging. The connective tissue between agents, services, and systems — with at-least-once and exactly-once delivery.",
        stack: "NATS with JetStream",
      },
    ],
  },
  {
    name: "Secrets & Identity",
    blurb:
      "Secrets management, dynamic credentials, and automatic synchronization — hardened by default, fully managed, nothing to configure.",
    services: [
      {
        tag: "VAULT",
        tagline: "Secrets management and dynamic credentials",
        description:
          "API keys, credentials, and environment secrets fully managed behind a secure, audited control layer. Dynamic secret generation, automatic rotation, and lease management included. Kubernetes-native sync keeps secrets fresh without manual intervention.",
        stack: "OpenBao (open-source Vault) + External Secrets Operator",
      },
    ],
  },
  {
    name: "Source Control",
    blurb:
      "Self-hosted Git hosting with full CI/CD, issues, and merge requests — no vendor lock-in, no per-seat pricing. Choose the stack that fits your workflow.",
    services: [
      {
        tag: "GIT",
        tagline: "Self-hosted GitLab or Gitea",
        description:
          "Enterprise-grade Git hosting on your infrastructure. Run GitLab or Gitea as your default — full CI/CD, issues, merge requests, and repository management. All features included. Integrates seamlessly with CTO agents and 5D Deploy.",
        stack: "GitLab Helm chart / Gitea Helm chart",
      },
    ],
  },
  {
    name: "Delivery & Observability",
    blurb:
      "GitOps-driven release pipelines, unified monitoring, self-healing operations, and automated remediation — so the platform stays healthy and delivery stays fast.",
    services: [
      {
        tag: "DEPLOY",
        tagline: "GitOps-driven delivery pipeline",
        description:
          "Every change moves through a tracked, automated release flow — from PR merge to production deployment. Automated rollbacks, health checks, and full auditability. Agents can ship without touching deployment tooling.",
        stack: "ArgoCD + ArgoCD Image Updater",
      },
      {
        tag: "OBSERVE",
        tagline: "Unified monitoring, logs, and traces",
        description:
          "Metrics, logs, distributed traces, and incident signals surfaced in one place. Pre-wired dashboards for every platform service. OpenTelemetry-native — everything is included and ready to go.",
        stack: "Prometheus + Grafana + Loki + Fluent Bit + Jaeger + OpenTelemetry Collector",
      },
      {
        tag: "PULSE",
        tagline: "Self-healing and automated remediation",
        description:
          "The platform monitors its own vitals and fixes what breaks — before it becomes an incident. Automated detection, remediation, and restart logic keep everything running without turning your team into a 24/7 ops desk.",
        stack: "Healer agent + health check controllers + auto-rollback",
      },
    ],
  },
  {
    name: "Networking & Connectivity",
    blurb:
      "eBPF-powered service mesh, zero-trust access, TLS automation, and DNS management — networking that just works across bare metal and cloud.",
    services: [
      {
        tag: "MESH",
        tagline: "eBPF networking and zero-trust access",
        description:
          "High-performance eBPF-based networking with network policy enforcement and cluster connectivity. Zero-trust private access for agents and services — no VPN required for internal tooling.",
        stack: "Cilium + Twingate operator + Headscale/Tailscale",
      },
      {
        tag: "EDGE",
        tagline: "Ingress, TLS, and DNS automation",
        description:
          "Managed ingress routing with automatic TLS certificate provisioning and renewal. External DNS automation keeps records in sync as services move. Custom domain support out of the box.",
        stack: "ingress-nginx + cert-manager + external-dns",
      },
    ],
  },
  {
    name: "Blockchain Infrastructure",
    blurb:
      "Managed node operations and on-chain data infrastructure for teams building in Web3 — across L1s, L2s, and interoperability protocols, on dedicated hardware.",
    services: [
      {
        tag: "NODE",
        tagline: "Validator and RPC node operations",
        description:
          "Managed node deployment across Solana, Sui, Aptos, NEAR, Base, Ethereum (Reth), Berachain, Monad, Arbitrum, Optimism, and LayerZero. Managed upgrades, health monitoring, and failover on dedicated hardware.",
        stack: "CTO Blockchain Operator (Rust) + Kotal (5dlabs fork)",
      },
      {
        tag: "INDEX",
        tagline: "On-chain data indexing and explorer infrastructure",
        description:
          "Real-time indexing of on-chain events, account states, and transaction history. Includes BlockScout explorer deployments and Cloudflare R2-backed storage for archive data — so your application always has reliable, low-latency chain data.",
        stack: "CTO Blockchain Operator — indexing and explorer CRDs (in development)",
      },
    ],
  },
];

export interface IntegrationGroup {
  name: string;
  blurb: string;
  items: { name: string; primary?: boolean; state?: string }[];
}

export const INTEGRATIONS: IntegrationGroup[] = [
  {
    name: "Project Management",
    blurb:
      "Linear is primary — full agent activity sync, project intake, and live task updates. Other platforms get task creation and status updates.",
    items: [
      { name: "Linear", primary: true, state: "Primary" },
      { name: "GitHub Issues", state: "Mirror" },
      { name: "Jira", state: "Mirror" },
      { name: "Asana", state: "Mirror" },
      { name: "Trello", state: "Mirror" },
      { name: "Monday", state: "Mirror" },
      { name: "Notion", state: "Mirror" },
      { name: "ClickUp", state: "Mirror" },
    ],
  },
  {
    name: "Communication & Alerting",
    blurb:
      "Agents post progress updates, incident alerts, and deployment notifications to your channels in real time.",
    items: [
      { name: "Discord" },
      { name: "Slack" },
      { name: "Microsoft Teams" },
      { name: "PagerDuty" },
      { name: "Email" },
    ],
  },
  {
    name: "Observability",
    blurb:
      "Self-hosted Grafana, Prometheus, and Loki pre-wired. Datadog supported for teams already invested in it.",
    items: [
      { name: "Grafana", primary: true, state: "Platform" },
      { name: "Prometheus", primary: true, state: "Platform" },
      { name: "Loki", primary: true, state: "Platform" },
      { name: "Jaeger", state: "Platform" },
      { name: "OpenTelemetry", state: "Platform" },
      { name: "Datadog" },
    ],
  },
  {
    name: "Source Control & CI",
    blurb:
      "Each agent integrates with your Git host. PRs, reviews, and deployments are fully automated.",
    items: [
      { name: "Git Apps" },
      { name: "CI/CD" },
      { name: "ArgoCD", primary: true, state: "Platform" },
      { name: "Webhooks" },
      { name: "PR Automation" },
    ],
  },
  {
    name: "Security Scanning",
    blurb: "Vulnerability scanning, SCA, AI-native remediation, and supply-chain protection.",
    items: [
      { name: "Snyk" },
      { name: "Nuclei" },
      { name: "Aikido" },
      { name: "Socket" },
      { name: "Trivy" },
      { name: "Gitleaks" },
      { name: "Datadog" },
      { name: "Dynatrace" },
    ],
  },
];

export interface ExtensionModule {
  key: string;
  name: string;
  short: string;
  description: string;
  active?: boolean;
}

export const APPLICATIONS: ExtensionModule[] = [
  {
    key: "accounting",
    name: "Accounting",
    short: "Ledger, invoicing, revenue recognition",
    description:
      "Close the books with agents. Ledger posting, invoice automation, revenue recognition, and tax filing workflows wired into 5D DEPLOY and 5D VAULT.",
    active: true,
  },
  {
    key: "marketing",
    name: "Marketing",
    short: "Campaigns, analytics, content pipelines",
    description:
      "Campaign orchestration, content pipelines, and cross-channel analytics. Agents draft, publish, and measure — with every asset versioned against Storybook.",
    active: true,
  },
  {
    key: "rms",
    name: "RMS (Sigma 1)",
    short: "Risk management overlay for trading",
    description:
      "Live risk overlay for the Sigma trading desk. Position limits, drawdown guards, and hedge automation routed through the agent pipeline and 5D STREAM.",
    active: false,
  },
  {
    key: "voice",
    name: "Voice Agents",
    short: "Telephony and voice-first agents",
    description:
      "Deploy voice-first agents on SIP and WebRTC. Calls route through 5D STREAM with transcripts indexed by Memory. Integrated with OpenClaw and Hermes.",
    active: false,
  },
];

export interface AgentAssetDef {
  name: string;
  required: boolean;
  blurb: string;
}

export const AGENT_ASSETS: AgentAssetDef[] = [
  { name: "AGENTS.md", required: true, blurb: "Agent manifest + capabilities" },
  { name: "SOUL.md", required: true, blurb: "Values, personality, non-negotiables" },
  { name: "System prompt", required: true, blurb: "system_prompt.md or system.txt" },
  { name: "SKILL.md (skills/)", required: true, blurb: "OpenClaw skill packages" },
  { name: "IDENTITY.md", required: false, blurb: "Persona card" },
  { name: "TOOLS.md", required: false, blurb: "Tool inventory + routing" },
  { name: "USER.md", required: false, blurb: "User preferences context" },
  { name: "HANDOFF.md", required: false, blurb: "Agent-to-agent handoffs" },
  { name: "HEARTBEAT.md", required: false, blurb: "Keep-alive / status config" },
];

export interface DebateLine {
  who: string;
  hue: number;
  text: string;
}

export const DEBATE_SCRIPT: DebateLine[] = [
  {
    who: "Optimus Pestimus",
    hue: 282,
    text: "Committee, intake received: sigma-1/rms. Thirty seconds per delegate. Cipher — open us up on security posture.",
  },
  {
    who: "Cipher",
    hue: 22,
    text: "Tight scope. CodeQL clean, Semgrep flagged one auth path we should quarantine before build.",
  },
  {
    who: "Morgan",
    hue: 200,
    text: "Backlog breakdown suggests three epics. I can run intake and surface candidates by EOD.",
  },
  {
    who: "Atlas",
    hue: 150,
    text: "Infra cost fits inside the existing GPU pool. No new provisioning needed.",
  },
  {
    who: "Vega",
    hue: 75,
    text: "Risk overlay is overdue — I'd rather ship a vertical slice than pre-optimize.",
  },
];

export const DEBATE_COMMITTEE: { name: string; role: string; hue: number }[] = [
  { name: "Cipher", role: "Security", hue: 22 },
  { name: "Morgan", role: "PM", hue: 200 },
  { name: "Atlas", role: "Infra", hue: 150 },
  { name: "Vega", role: "Risk/Trading", hue: 75 },
  { name: "Nova", role: "Frontend", hue: 230 },
];

export type AgentStatus = "online" | "running" | "idle" | "offline";
export type AgentHarness = "OpenClaw" | "Hermes";

export interface AgentModel {
  model: string;
  provider: string;
}

export interface AgentCard {
  id: string;
  name: string;
  role: string;
  soul: string;
  hue: number;
  status: AgentStatus;
  harness: AgentHarness;
  cli: string;
  models: AgentModel[];
  skills: string[];
  tasksActive: number;
  tasksShipped: number;
  publishedOnChain?: boolean;
}

export const AGENTS: AgentCard[] = [
  {
    id: "morgan",
    name: "Morgan",
    role: "Intake + always-on companion",
    soul: "Curator of the board — surfaces direction, never overwrites it.",
    hue: 200,
    status: "online",
    harness: "OpenClaw",
    cli: "claude-code 0.8.3",
    models: [
      { model: "claude-opus-4-7", provider: "anthropic" },
      { model: "gemini-2.5-pro", provider: "google" },
    ],
    skills: ["intake.route", "pm.sync", "voice.stream"],
    tasksActive: 2,
    tasksShipped: 38,
    publishedOnChain: true,
  },
  {
    id: "cipher",
    name: "Cipher",
    role: "Security lead · vuln triage and remediation",
    soul: "Paranoid by trade — assume compromise, prove containment.",
    hue: 22,
    status: "running",
    harness: "OpenClaw",
    cli: "claude-code 0.8.3",
    models: [{ model: "claude-opus-4-7", provider: "anthropic" }],
    skills: ["semgrep.scan", "codeql.triage", "snyk.patch", "aikido.route"],
    tasksActive: 3,
    tasksShipped: 17,
    publishedOnChain: true,
  },
  {
    id: "atlas",
    name: "Atlas",
    role: "Infra + GPU pool custodian",
    soul: "Measures twice, scales once — latency is a feature.",
    hue: 150,
    status: "online",
    harness: "Hermes",
    cli: "opencode 1.2",
    models: [
      { model: "claude-sonnet-4-6", provider: "anthropic" },
      { model: "gpt-5", provider: "openai" },
    ],
    skills: ["kubeai.route", "argocd.ship", "observe.wire"],
    tasksActive: 1,
    tasksShipped: 24,
    publishedOnChain: true,
  },
  {
    id: "vega",
    name: "Vega",
    role: "Risk + trading overlay",
    soul: "Vertical slice shipper — would rather demo than speculate.",
    hue: 75,
    status: "idle",
    harness: "OpenClaw",
    cli: "claude-code 0.8.3",
    models: [{ model: "claude-opus-4-7", provider: "anthropic" }],
    skills: ["sigma.risk", "stream.tap", "pnl.rollup"],
    tasksActive: 1,
    tasksShipped: 9,
    publishedOnChain: false,
  },
  {
    id: "nova",
    name: "Nova",
    role: "Frontend · Storybook + tweakcn",
    soul: "Whitespace is design. Restraint is speed.",
    hue: 230,
    status: "online",
    harness: "Hermes",
    cli: "opencode 1.2",
    models: [
      { model: "claude-sonnet-4-6", provider: "anthropic" },
      { model: "gpt-5", provider: "openai" },
    ],
    skills: ["storybook.snap", "tweakcn.theme", "a11y.audit"],
    tasksActive: 2,
    tasksShipped: 31,
    publishedOnChain: true,
  },
  {
    id: "angie",
    name: "Angie",
    role: "Agent architect · test + flake hunter",
    soul: "Never patches around red — routes through it.",
    hue: 195,
    status: "running",
    harness: "OpenClaw",
    cli: "claude-code 0.8.3",
    models: [{ model: "claude-opus-4-7", provider: "anthropic" }],
    skills: ["test.settle", "backoff.poll", "trace.repro"],
    tasksActive: 1,
    tasksShipped: 14,
    publishedOnChain: false,
  },
  {
    id: "blaze",
    name: "Blaze",
    role: "Solidity + Rust chain engineer",
    soul: "On-chain is one-shot — rehearse in sim, ship once.",
    hue: 18,
    status: "running",
    harness: "OpenClaw",
    cli: "claude-code 0.8.3",
    models: [
      { model: "claude-opus-4-7", provider: "anthropic" },
      { model: "gemini-2.5-pro", provider: "google" },
    ],
    skills: ["solidity.audit", "foundry.sim", "anchor.deploy"],
    tasksActive: 2,
    tasksShipped: 11,
    publishedOnChain: true,
  },
  {
    id: "rex",
    name: "Rex",
    role: "Infra + chart custodian · CTO agents workspace",
    soul: "Chart budgets, not vibes — every bump gets a reason.",
    hue: 32,
    status: "running",
    harness: "OpenClaw",
    cli: "codex 1.4",
    models: [{ model: "claude-opus-4-7", provider: "anthropic" }],
    skills: ["helm.edit", "chart.ci", "kaniko.build"],
    tasksActive: 1,
    tasksShipped: 6,
    publishedOnChain: true,
  },
];

function resolveCoderBaseUrl(): string {
  try {
    const fromEnv =
      (typeof import.meta !== "undefined" &&
        (import.meta as unknown as { env?: { VITE_CODER_BASE_URL?: string } })
          .env?.VITE_CODER_BASE_URL) ||
      "";
    if (fromEnv) return fromEnv.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  try {
    const fromWindow = (window as unknown as { __CODER_BASE_URL__?: string })
      .__CODER_BASE_URL__;
    if (fromWindow) return fromWindow.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return "https://morgan-ide.5dlabs.ai";
}

/** Base origin for Morgan's code-server host. */
export const CODER_BASE_URL = resolveCoderBaseUrl();

/** Parent dir inside the Morgan pod where repos are checked out. */
export const CODER_REPOS_ROOT = "/workspace/repos";

/**
 * Reads a `repo` query param from the current browser URL so the 5D app can
 * deep-link embeds to a specific repo, e.g. `?repo=tsk-taskbox-2`.
 * Returns null when running server-side or when the param is absent/blank.
 */
export function getRepoFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = new URLSearchParams(window.location.search).get("repo");
    const trimmed = v?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export interface CoderUrlOptions {
  /** Repo slug to open (mapped to `/workspace/repos/<repo>`). */
  repo?: string | null;
  /** Optional branch deep link (passed straight through as `&branch=`). */
  branch?: string | null;
}

/**
 * Build the code-server URL for an embed. Uses `?folder=` under
 * `CODER_REPOS_ROOT` when a repo is provided; falls back to the repos root.
 *
 * We intentionally hand-build the query string (rather than using
 * `URLSearchParams`) so the folder path keeps its raw slashes — code-server's
 * router and VS Code Web both prefer `?folder=/workspace/...` over the
 * percent-encoded `?folder=%2Fworkspace%2F...` form, and it matches what
 * code-server itself writes back into `coder.json` on redirect.
 *
 * We also deliberately do NOT pass `ew=`. In code-server's source that query
 * is read as "workspace was closed, clear last-opened" (see
 * `src/node/routes/vscode.ts`), not "exit welcome" — passing it taints
 * `coder.json` and can break plain `/` loads afterwards.
 */
export function buildCoderUrl(opts: CoderUrlOptions = {}): string {
  const folder = opts.repo ? `${CODER_REPOS_ROOT}/${opts.repo}` : CODER_REPOS_ROOT;
  const parts: string[] = [`folder=${folder}`];
  if (opts.branch) parts.push(`branch=${encodeURIComponent(opts.branch)}`);
  return `${CODER_BASE_URL}/?${parts.join("&")}`;
}

/** Legacy default URL — kept for any call sites still importing it. */
export const CODER_URL = buildCoderUrl();

export type TaskState = "queued" | "running" | "blocked" | "review" | "done";

/** Projects board column; optional override per task via `TaskCard.boardLane`. */
export type ProjectBoardLane = "pending" | "ready" | "in_progress" | "done";

export const TASK_STATE_LABEL: Record<TaskState, string> = {
  queued: "Queued",
  running: "Running",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
};

export const TASK_STATE_CHIP: Record<
  TaskState,
  "accent" | "success" | "warn" | "danger" | "muted"
> = {
  queued: "muted",
  running: "accent",
  blocked: "danger",
  review: "warn",
  done: "success",
};

/**
 * Resolve the repo slug a task's workspace will actually open. Mirrors the
 * precedence used by `taskCoderUrl`: explicit task/project repo wins, then URL
 * `?repo=` as a fallback. This prevents stale URL params from overriding the
 * selected card and producing "workspace does not exist" errors.
 * Returns `null` when nothing is pinned (the iframe lands on repos root).
 */
export function taskActiveRepo(
  task: Pick<TaskCard, "repo">,
): string | null {
  return task.repo ?? getRepoFromLocation() ?? null;
}

/**
 * Coder URL for a task embed. Precedence for repo:
 *   1. `task.repo` when the task is pinned to a repo,
 *   2. `?repo=<slug>` on the 5D app URL (fallback when task has no repo),
 *   3. `CODER_REPOS_ROOT` (the default, opens the parent dir).
 * Branch is always taken from the task.
 */
export function taskCoderUrl(task: Pick<TaskCard, "branch" | "repo">): string {
  const repo = taskActiveRepo(task);
  return buildCoderUrl({ repo, branch: task.branch ?? null });
}

export interface TaskFileDiff {
  path: string;
  label: string;
  active?: boolean;
  language?: string;
}

export interface TaskCard {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  agentId: string;
  /** When set, places the row on the Projects board regardless of `state`. */
  boardLane?: ProjectBoardLane;
  state: TaskState;
  harness: AgentHarness;
  cli: string;
  models: AgentModel[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  iterations: number;
  updated: string;
  note?: string;
  branch?: string;
  /** Repo slug to pin this task's workspace to (maps to `/workspace/repos/<repo>`). */
  repo?: string;
  files?: TaskFileDiff[];
}

export function taskBoardLane(task: TaskCard): ProjectBoardLane {
  if (task.boardLane) return task.boardLane;
  switch (task.state) {
    case "done":
      return "done";
    case "running":
    case "blocked":
    case "review":
      return "in_progress";
    case "queued":
    default:
      return "pending";
  }
}

export const TASKS: TaskCard[] = [];
