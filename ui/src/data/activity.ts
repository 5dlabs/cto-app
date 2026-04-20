export type ActivityKind = "merge" | "review" | "deploy" | "intake" | "alert" | "session";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  actor: string;
  summary: string;
  target?: string;
  ts: string; // human-readable delta
}

// Placeholder feed — wire to controller event stream when bridge lands.
export const ACTIVITY: ActivityEvent[] = [
  { id: "e1", kind: "merge", actor: "Atlas", summary: "merged", target: "cto#412", ts: "just now" },
  { id: "e2", kind: "review", actor: "Stitch", summary: "approved", target: "cto-app#7", ts: "1m" },
  { id: "e3", kind: "intake", actor: "Morgan", summary: "decomposed PRD", target: "LINEAR-8821", ts: "3m" },
  { id: "e4", kind: "deploy", actor: "Bolt", summary: "rolled Helm chart", target: "openclaw-agent 1.8.2", ts: "8m" },
  { id: "e5", kind: "session", actor: "Rex", summary: "session opened", target: "crates/controller", ts: "14m" },
  { id: "e6", kind: "alert", actor: "Healer", summary: "restarted", target: "discord-bridge", ts: "21m" },
  { id: "e7", kind: "merge", actor: "Atlas", summary: "merged", target: "agent-platform#1204", ts: "32m" },
  { id: "e8", kind: "deploy", actor: "Keeper", summary: "synced", target: "argocd/prod-apps", ts: "47m" },
];

export const kindGlyph: Record<ActivityKind, string> = {
  merge: "⇣",
  review: "✓",
  deploy: "▲",
  intake: "◇",
  alert: "!",
  session: "·",
};

export const kindColor: Record<ActivityKind, string> = {
  merge: "text-signal-info",
  review: "text-signal-ok",
  deploy: "text-accent-soft",
  intake: "text-ink-200",
  alert: "text-signal-warn",
  session: "text-ink-400",
};
