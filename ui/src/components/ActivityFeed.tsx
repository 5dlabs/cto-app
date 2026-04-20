import { cn } from "../lib/cn";
import { ACTIVITY, kindColor, kindGlyph } from "../data/activity";

export function ActivityFeed() {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-ink-900 bg-ink-950/60 xl:flex">
      <div className="flex h-11 items-center justify-between border-b border-ink-900 px-4">
        <span className="text-[10px] font-semibold tracking-caps text-ink-500">
          ACTIVITY
        </span>
        <span className="flex items-center gap-1.5 text-[10px] tracking-caps text-signal-ok">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-ok" />
          LIVE
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {ACTIVITY.map((e) => (
            <li
              key={e.id}
              className="group flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-ink-900/60"
            >
              <span
                className={cn(
                  "mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 font-mono text-[10px] ring-1 ring-ink-800",
                  kindColor[e.kind],
                )}
              >
                {kindGlyph[e.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 text-[12px] leading-tight">
                  <span className="font-medium tracking-tight text-ink-100">
                    {e.actor}
                  </span>
                  <span className="text-ink-400 tracking-tight">{e.summary}</span>
                  {e.target && (
                    <span className="truncate font-mono text-[10px] text-ink-300">
                      {e.target}
                    </span>
                  )}
                </div>
                <div className="text-[10px] tracking-caps text-ink-600">
                  {e.ts}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-ink-900 px-4 py-2.5 text-[10px] tracking-caps text-ink-600">
        Scroll for older · event stream not yet wired
      </div>
    </aside>
  );
}
