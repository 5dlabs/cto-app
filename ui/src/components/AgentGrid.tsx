import { AGENTS } from "../data/agents";
import { AgentCard } from "./AgentCard";

export function AgentGrid() {
  const active = AGENTS.filter((a) => a.status === "active").length;
  const idle = AGENTS.filter((a) => a.status === "idle").length;
  const offline = AGENTS.filter((a) => a.status === "offline").length;
  const blocked = AGENTS.filter((a) => a.status === "blocked").length;

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-end justify-between border-b border-ink-900 px-8 py-5">
        <div>
          <div className="text-[10px] font-semibold tracking-caps text-ink-500">
            5DLABS · CTO
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tightest text-ink-50">
            Agents
          </h1>
          <p className="mt-1 text-[12px] text-ink-500 tracking-tight">
            {AGENTS.length} agents across the platform · click a card to open session
          </p>
        </div>
        <div className="flex items-center gap-5 text-[11px] tracking-caps text-ink-500">
          <Stat label="ACTIVE" value={active} accent="text-signal-ok" />
          <Stat label="IDLE" value={idle} accent="text-ink-200" />
          <Stat label="BLOCKED" value={blocked} accent="text-signal-warn" />
          <Stat label="OFFLINE" value={offline} accent="text-ink-500" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-grid-fade px-8 py-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {AGENTS.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className={`text-[18px] font-semibold tabular-nums tracking-tightest ${accent}`}>
        {value}
      </span>
      <span className="mt-0.5 text-[9px] tracking-caps text-ink-600">{label}</span>
    </div>
  );
}
