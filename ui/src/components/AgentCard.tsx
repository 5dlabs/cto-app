import { cn } from "../lib/cn";
import { statusColor, statusLabel, type Agent } from "../data/agents";

interface Props {
  agent: Agent;
}

export function AgentCard({ agent }: Props) {
  const initials = agent.name.slice(0, 2).toUpperCase();
  const active = agent.status === "active";
  return (
    <div className="group relative flex flex-col rounded-lg border border-ink-900 bg-ink-950/60 p-4 shadow-card transition-all hover:-translate-y-px hover:border-ink-800 hover:bg-ink-900/40">
      <div className="flex items-start gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-ink-800 to-ink-900 text-[12px] font-semibold tracking-tight text-ink-100 ring-1 ring-ink-800">
          {initials}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-ink-950",
              statusColor[agent.status],
            )}
          >
            {active && (
              <span className="absolute inset-0 animate-pulse-dot rounded-full bg-signal-ok/60" />
            )}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="truncate text-[13px] font-semibold tracking-tight text-ink-50">
              {agent.name}
            </h3>
            <span className="text-[10px] font-medium tracking-caps text-ink-500">
              {agent.role.toUpperCase()}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-500">
            {agent.specialty}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-ink-900 pt-2.5 text-[10px] tracking-tight">
        <span
          className={cn(
            "font-medium",
            active ? "text-signal-ok" : agent.status === "blocked" ? "text-signal-warn" : "text-ink-500",
          )}
        >
          {statusLabel[agent.status]}
        </span>
        <span className="truncate pl-2 text-ink-500">
          {agent.currentTask ?? agent.lastSeen ?? "—"}
        </span>
      </div>
    </div>
  );
}
