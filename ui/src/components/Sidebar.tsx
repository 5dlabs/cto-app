import { cn } from "../lib/cn";

type NavKey = "agents" | "plays" | "sessions" | "intake" | "repos" | "infra";

interface Props {
  active: NavKey;
  onChange: (k: NavKey) => void;
}

const NAV: Array<{ key: NavKey; label: string; count?: string; hint?: string }> = [
  { key: "agents", label: "Agents", count: "19" },
  { key: "plays", label: "Plays", count: "7" },
  { key: "sessions", label: "Sessions", count: "4", hint: "live" },
  { key: "intake", label: "Intake", hint: "green" },
  { key: "repos", label: "Repos", count: "26" },
  { key: "infra", label: "Infra" },
];

export function Sidebar({ active, onChange }: Props) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-900 bg-ink-950/80">
      <div className="flex h-14 items-center gap-2.5 border-b border-ink-900 px-5 drag-region">
        <div className="no-drag flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 ring-1 ring-accent/30">
          <span className="text-[11px] font-semibold tracking-tightest text-accent-soft">5D</span>
        </div>
        <div className="no-drag flex flex-col leading-none">
          <span className="text-[11px] font-semibold tracking-caps text-ink-100">CTO</span>
          <span className="text-[10px] tracking-caps text-ink-500">CONTROL SURFACE</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="px-3 pb-2 text-[10px] font-semibold tracking-caps text-ink-600">
          WORKSPACE
        </div>
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const isActive = item.key === active;
            return (
              <li key={item.key}>
                <button
                  onClick={() => onChange(item.key)}
                  className={cn(
                    "group flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[13px] transition-colors",
                    isActive
                      ? "bg-ink-900 text-ink-50 ring-1 ring-ink-800"
                      : "text-ink-400 hover:bg-ink-900/60 hover:text-ink-200",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-1 w-1 rounded-full",
                        isActive ? "bg-accent-soft" : "bg-ink-700 group-hover:bg-ink-500",
                      )}
                    />
                    <span className="font-medium tracking-tight">{item.label}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {item.hint && (
                      <span className="text-[10px] font-medium uppercase tracking-caps text-signal-ok">
                        {item.hint}
                      </span>
                    )}
                    {item.count && (
                      <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] tabular-nums text-ink-500 ring-1 ring-ink-800">
                        {item.count}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 px-3 pb-2 text-[10px] font-semibold tracking-caps text-ink-600">
          QUICK
        </div>
        <ul className="space-y-0.5">
          {["New play", "Open session", "Kick intake"].map((a) => (
            <li key={a}>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[13px] text-ink-400 transition-colors hover:bg-ink-900/60 hover:text-ink-200">
                <span className="text-ink-600">›</span>
                <span className="tracking-tight">{a}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-ink-900 p-3">
        <div className="flex items-center gap-2 rounded-md bg-ink-900/50 px-2.5 py-2 ring-1 ring-ink-900">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-accent/40 to-accent-strong/60 text-[10px] font-semibold text-ink-50">
            J
          </div>
          <div className="flex flex-1 flex-col leading-tight">
            <span className="text-[11px] font-medium text-ink-200 tracking-tight">
              jonathon
            </span>
            <span className="text-[10px] text-ink-500 tracking-tight">5dlabs · admin</span>
          </div>
          <span className="h-1.5 w-1.5 rounded-full bg-signal-ok" />
        </div>
      </div>
    </aside>
  );
}

export type { NavKey };
