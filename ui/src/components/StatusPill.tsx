import { cn } from "../lib/cn";
import { healthDot, type ServiceHealth } from "../data/services";

interface Props {
  health: ServiceHealth;
  label: string;
  detail?: string;
}

export function StatusPill({ health, label, detail }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-ink-800/80 bg-ink-900/60 px-3 py-1 text-[11px] text-ink-300">
      <span
        className={cn(
          "relative inline-flex h-1.5 w-1.5 rounded-full",
          healthDot[health],
        )}
      >
        {health === "ok" && (
          <span className="absolute inset-0 animate-pulse-dot rounded-full bg-signal-ok/60" />
        )}
      </span>
      <span className="font-medium text-ink-200 tracking-tight">{label}</span>
      {detail && (
        <span className="text-ink-500 tabular-nums tracking-tight">· {detail}</span>
      )}
    </div>
  );
}
