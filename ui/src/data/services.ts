export type ServiceHealth = "ok" | "warn" | "err" | "unknown";

export interface Service {
  id: string;
  name: string;
  kind: string;
  health: ServiceHealth;
  detail?: string;
}

// Platform health — wire to /health probes via Tauri commands later.
export const SERVICES: Service[] = [
  { id: "argocd", name: "ArgoCD", kind: "GitOps", health: "ok", detail: "all apps synced" },
  { id: "gitlab-mirror", name: "GitLab Mirror", kind: "Sync", health: "ok", detail: "26/26 repos" },
  { id: "dual-publish", name: "Dual-publish", kind: "Sync", health: "warn", detail: "0/23 rolled" },
  { id: "intake", name: "Intake Pipeline", kind: "Lobster", health: "ok", detail: "green" },
  { id: "discord-bridge", name: "Discord Bridge", kind: "Bridge", health: "ok" },
  { id: "linear-bridge", name: "Linear Bridge", kind: "Bridge", health: "ok" },
  { id: "openclaw", name: "OpenClaw Gateway", kind: "Runtime", health: "ok" },
  { id: "k8s", name: "Kubernetes", kind: "Cluster", health: "ok", detail: "42/42 nodes" },
];

export const healthColor: Record<ServiceHealth, string> = {
  ok: "text-signal-ok",
  warn: "text-signal-warn",
  err: "text-signal-err",
  unknown: "text-ink-500",
};

export const healthDot: Record<ServiceHealth, string> = {
  ok: "bg-signal-ok",
  warn: "bg-signal-warn",
  err: "bg-signal-err",
  unknown: "bg-ink-600",
};
