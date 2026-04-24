import { useMemo, useState } from "react";
import {
  IconSparkles,
  IconTerminal,
  IconBracket,
  IconPlus,
  IconLock,
  IconFilter,
  IconSearch,
  IconActivity,
  IconCheck,
} from "./icons";
import { AGENTS, type AgentCard, type AgentStatus } from "./data";

type StatusFilter = "all" | AgentStatus;

const STATUS_LABEL: Record<AgentStatus, string> = {
  online: "online",
  running: "running",
  idle: "idle",
  offline: "offline",
};

const STATUS_CHIP: Record<AgentStatus, "accent" | "success" | "warn" | "muted"> = {
  online: "success",
  running: "accent",
  idle: "warn",
  offline: "muted",
};

export function AgentsView({ onNewAgent }: { onNewAgent?: () => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AGENTS.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        a.skills.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [query, status]);

  const active = useMemo(
    () => AGENTS.find((a) => a.id === selected) ?? AGENTS[0],
    [selected],
  );

  const totalActive = AGENTS.reduce((acc, a) => acc + a.tasksActive, 0);
  const totalShipped = AGENTS.reduce((acc, a) => acc + a.tasksShipped, 0);
  const onlineCount = AGENTS.filter((a) => a.status === "online" || a.status === "running").length;

  return (
    <div className="section">
      <div className="section__head">
        <div>
          <div className="section__eyebrow">Roster</div>
          <div className="section__title">
            {AGENTS.length} agents · {onlineCount} live · {totalActive} tasks running · {totalShipped} shipped
          </div>
          <div className="section__sub">
            Each agent carries its own harness, ACP CLI, and model pairing. Manifests (AGENTS.md,
            SOUL.md, SKILL.md) travel with the agent; published manifests are verified on-chain.
          </div>
        </div>
        <div className="row">
          <button type="button" className="ghost-btn">
            <IconFilter size={12} /> Filters
          </button>
          <button
            type="button"
            className="primary-btn primary-btn--icon"
            onClick={onNewAgent}
            aria-label="New agent"
            title="New agent"
          >
            <IconPlus size={14} />
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 4, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <IconSearch size={12} />
            <input
              className="field__input"
              placeholder="Search by name, role, or skill…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {(["all", "online", "running", "idle", "offline"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`tab${status === s ? " tab--active" : ""}`}
              onClick={() => setStatus(s)}
            >
              {s === "all" ? "All" : STATUS_LABEL[s as AgentStatus]}
              <span className="tab__count">
                {s === "all"
                  ? AGENTS.length
                  : AGENTS.filter((a) => a.status === s).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        className="svc-grid"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
      >
        {filtered.map((agent) => (
          <AgentCardView
            key={agent.id}
            agent={agent}
            active={active?.id === agent.id}
            onPick={() => setSelected(agent.id)}
          />
        ))}
        {filtered.length === 0 ? (
          <div
            className="tiny muted"
            style={{
              border: "1px dashed var(--border-subtle)",
              padding: "22px 14px",
              borderRadius: 10,
              textAlign: "center",
              gridColumn: "1 / -1",
            }}
          >
            No agents match this filter.
          </div>
        ) : null}
      </div>

      {active ? <AgentDetail agent={active} /> : null}
    </div>
  );
}

function AgentCardView({
  agent,
  active,
  onPick,
}: {
  agent: AgentCard;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={`svc-card${active ? " svc-card--active" : ""}`}
      onClick={onPick}
      style={{
        textAlign: "left",
        cursor: "pointer",
        borderColor: active ? "var(--accent-border)" : undefined,
      }}
    >
      <div className="svc-card__head">
        <div
          className="task-avatar-lg"
          style={{
            width: 36,
            height: 36,
            fontSize: 15,
            background: `oklch(0.62 0.14 ${agent.hue} / 0.22)`,
            borderColor: `oklch(0.62 0.14 ${agent.hue} / 0.5)`,
            color: `oklch(0.86 0.08 ${agent.hue})`,
          }}
        >
          {agent.name.charAt(0)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="svc-card__tag">{agent.role.toUpperCase()}</div>
          <div className="svc-card__title">{agent.name}</div>
        </div>
        <span className={`chip chip--${STATUS_CHIP[agent.status]}`}>{STATUS_LABEL[agent.status]}</span>
      </div>
      <p className="svc-card__body">{agent.soul}</p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <span className="chip chip--accent">
          <IconTerminal size={10} /> {agent.harness}
        </span>
        <span className="chip">
          <IconBracket size={10} /> {agent.cli}
        </span>
        {agent.publishedOnChain ? (
          <span className="chip chip--success">
            <IconLock size={10} /> on-chain
          </span>
        ) : null}
      </div>
      <div className="svc-card__stack">
        <span className="mono">
          {agent.tasksActive} active · {agent.tasksShipped} shipped
        </span>
      </div>
    </button>
  );
}

function AgentDetail({ agent }: { agent: AgentCard }) {
  return (
    <div className="chart-card">
      <div className="section__head">
        <div>
          <div className="section__eyebrow">
            <IconSparkles size={11} /> Agent detail
          </div>
          <div className="section__title">
            {agent.name} — {agent.role}
          </div>
          <div className="section__sub">{agent.soul}</div>
        </div>
        <div className="row">
          <button type="button" className="ghost-btn">
            <IconActivity size={12} /> Live feed
          </button>
          <button type="button" className="ghost-btn">
            <IconBracket size={12} /> Manifest
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginTop: 4,
        }}
      >
        <div className="chart-card" style={{ padding: 12 }}>
          <div className="section__eyebrow">Runtime</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <span className="chip chip--accent">
              <IconTerminal size={10} /> {agent.harness}
            </span>
            <span className="chip">
              <IconBracket size={10} /> {agent.cli}
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            {agent.models.map((m) => (
              <div key={`${m.provider}-${m.model}`} className="modelchip" style={{ marginTop: 4 }}>
                {m.model} <span className="modelchip__provider">· {m.provider}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card" style={{ padding: 12 }}>
          <div className="section__eyebrow">Skills</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {agent.skills.map((s) => (
              <span key={s} className="chip">
                <IconCheck size={10} /> {s}
              </span>
            ))}
          </div>
        </div>

        <div className="chart-card" style={{ padding: 12 }}>
          <div className="section__eyebrow">Throughput</div>
          <div className="row" style={{ gap: 14, marginTop: 6 }}>
            <div>
              <div className="mono" style={{ fontSize: 20 }}>{agent.tasksActive}</div>
              <div className="tiny muted">active</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 20 }}>{agent.tasksShipped}</div>
              <div className="tiny muted">shipped</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 20 }}>
                {agent.publishedOnChain ? "✓" : "—"}
              </div>
              <div className="tiny muted">on-chain</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
