import { SERVICES } from "../data/services";
import { StatusPill } from "./StatusPill";

export function TopBar() {
  const featured = SERVICES.filter((s) =>
    ["argocd", "gitlab-mirror", "dual-publish", "intake"].includes(s.id),
  );

  return (
    <header className="drag-region flex h-14 items-center gap-4 border-b border-ink-900 bg-ink-950/80 px-5 backdrop-blur">
      <div className="no-drag flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-full bg-ink-800 ring-1 ring-ink-700" />
          <span className="h-3 w-3 rounded-full bg-ink-800 ring-1 ring-ink-700" />
          <span className="h-3 w-3 rounded-full bg-ink-800 ring-1 ring-ink-700" />
        </div>
      </div>

      <div className="no-drag flex min-w-0 flex-1 items-center gap-3">
        <div className="relative flex h-8 w-full max-w-md items-center">
          <span className="pointer-events-none absolute left-3 text-[11px] tracking-caps text-ink-600">
            ⌘K
          </span>
          <input
            placeholder="Jump to agent, play, session, repo…"
            className="h-full w-full rounded-md border border-ink-800 bg-ink-900/60 pl-12 pr-3 text-[12px] text-ink-100 placeholder:text-ink-500 outline-none transition focus:border-accent/50 focus:bg-ink-900 focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      <div className="no-drag flex items-center gap-2 overflow-x-auto">
        {featured.map((s) => (
          <StatusPill
            key={s.id}
            health={s.health}
            label={s.name}
            detail={s.detail}
          />
        ))}
      </div>
    </header>
  );
}
