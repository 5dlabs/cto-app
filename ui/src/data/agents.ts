export type AgentStatus = "idle" | "active" | "blocked" | "offline";

export interface Agent {
  id: string;
  name: string;
  role: string;
  specialty: string;
  status: AgentStatus;
  lastSeen?: string;
  currentTask?: string;
}

// Source: /Users/jonathon/5dlabs/cto global instructions § Agent Roster
export const AGENTS: Agent[] = [
  { id: "morgan", name: "Morgan", role: "Intake & PRD", specialty: "Task decomposition, agent assignment", status: "active", currentTask: "PRD intake loop" },
  { id: "atlas", name: "Atlas", role: "Merge Gate", specialty: "PR merging, branch management", status: "idle", lastSeen: "3m ago" },
  { id: "stitch", name: "Stitch", role: "Code Review", specialty: "Automated PR review, quality checks", status: "active", currentTask: "Reviewing #412" },
  { id: "rex", name: "Rex", role: "Rust", specialty: "Backend systems, CLI tools", status: "idle", lastSeen: "12m ago" },
  { id: "blaze", name: "Blaze", role: "Frontend", specialty: "React, TypeScript, UI", status: "idle", lastSeen: "1h ago" },
  { id: "grizz", name: "Grizz", role: "Go", specialty: "Go services, infrastructure", status: "offline" },
  { id: "tess", name: "Tess", role: "Testing", specialty: "Test strategy, coverage", status: "idle", lastSeen: "22m ago" },
  { id: "cleo", name: "Cleo", role: "Code Quality", specialty: "Linting, standards", status: "idle", lastSeen: "8m ago" },
  { id: "cipher", name: "Cipher", role: "Security", specialty: "Audits, vulnerability scans", status: "idle", lastSeen: "40m ago" },
  { id: "healer", name: "Healer", role: "Self-Healing", specialty: "Failure detection, remediation", status: "active", currentTask: "Monitoring CI" },
  { id: "bolt", name: "Bolt", role: "DevOps", specialty: "Helm, Kubernetes", status: "active", currentTask: "GPU node drain" },
  { id: "block", name: "Block", role: "Blockchain", specialty: "Solana, EVM, DeFi", status: "offline" },
  { id: "angie", name: "Angie", role: "Agent Architecture", specialty: "OpenClaw orchestration", status: "idle", lastSeen: "2h ago" },
  { id: "keeper", name: "Keeper", role: "Operations", specialty: "Cluster, monitoring", status: "active", currentTask: "Cluster sweep" },
  { id: "nova", name: "Nova", role: "Research", specialty: "Web research, docs", status: "idle", lastSeen: "15m ago" },
  { id: "spark", name: "Spark", role: "Prototyping", specialty: "Quick iterations", status: "offline" },
  { id: "tap", name: "Tap", role: "Integration", specialty: "APIs, webhooks", status: "idle", lastSeen: "55m ago" },
  { id: "vex", name: "Vex", role: "Debugging", specialty: "Root cause analysis", status: "blocked", currentTask: "Waiting on repro" },
  { id: "pixel", name: "Pixel", role: "Desktop", specialty: "CTO Lite Tauri app", status: "active", currentTask: "Rendering this window" },
];

export const statusColor: Record<AgentStatus, string> = {
  active: "bg-signal-ok",
  idle: "bg-ink-500",
  blocked: "bg-signal-warn",
  offline: "bg-ink-700",
};

export const statusLabel: Record<AgentStatus, string> = {
  active: "Active",
  idle: "Idle",
  blocked: "Blocked",
  offline: "Offline",
};
