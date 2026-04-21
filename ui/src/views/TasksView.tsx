import { useMemo, useState } from "react";
import {
  IconTerminal,
  IconBracket,
  IconVideo,
  IconMic,
  IconChat,
  IconSparkles,
  IconFilter,
  IconSearch,
  IconActivity,
} from "./icons";
import { AGENTS, TASKS, type TaskCard, type TaskState } from "./data";

type StateFilter = "all" | TaskState;
type Mode = "video" | "voice" | "text";

const STATE_LABEL: Record<TaskState, string> = {
  queued: "Queued",
  running: "Running",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
};

const STATE_CHIP: Record<TaskState, "accent" | "success" | "warn" | "danger" | "muted"> = {
  queued: "muted",
  running: "accent",
  blocked: "danger",
  review: "warn",
  done: "success",
};

export function TasksView() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("all");
  const [selected, setSelected] = useState<string | null>(TASKS[0]?.id ?? null);
  const [mode, setMode] = useState<Mode>("video");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TASKS.filter((t) => {
      if (state !== "all" && t.state !== state) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.projectName.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    });
  }, [query, state]);

  const active = useMemo(
    () => TASKS.find((t) => t.id === selected) ?? filtered[0] ?? null,
    [selected, filtered],
  );

  const totals = useMemo(() => {
    const running = TASKS.filter((t) => t.state === "running").length;
    const blocked = TASKS.filter((t) => t.state === "blocked").length;
    const review = TASKS.filter((t) => t.state === "review").length;
    const cost = TASKS.reduce((acc, t) => acc + t.costUsd, 0);
    return { running, blocked, review, cost };
  }, []);

  return (
    <div className="section">
      <div className="section__head">
        <div>
          <div className="section__eyebrow">Global task board</div>
          <div className="section__title">
            {TASKS.length} tasks · {totals.running} running · {totals.blocked} blocked · {totals.review} in review
          </div>
          <div className="section__sub">
            Every task carries its agent, harness, and model pairing. Open a task to drop into the
            live video / voice / text stage — subtitles and per-task telemetry always on.
          </div>
        </div>
        <div className="row">
          <span className="chip">
            spend · ${totals.cost.toFixed(2)}
          </span>
          <button type="button" className="ghost-btn">
            <IconFilter size={12} /> Filters
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 4, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <IconSearch size={12} />
            <input
              className="field__input"
              placeholder="Search tasks, project, or id…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {(["all", "running", "queued", "blocked", "review", "done"] as StateFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`tab${state === s ? " tab--active" : ""}`}
              onClick={() => setState(s)}
            >
              {s === "all" ? "All" : STATE_LABEL[s as TaskState]}
              <span className="tab__count">
                {s === "all" ? TASKS.length : TASKS.filter((t) => t.state === s).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="task-stage">
        <div className="task-panel">
          <div className="section__head">
            <div>
              <div className="section__eyebrow">Task list</div>
              <div className="section__title">{filtered.length} of {TASKS.length}</div>
            </div>
          </div>
          <div className="mem-list" style={{ gap: 4 }}>
            {filtered.map((t) => {
              const agent = AGENTS.find((a) => a.id === t.agentId);
              const isActive = active?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`kanban__card${isActive ? " kanban__card--active" : ""}`}
                  onClick={() => setSelected(t.id)}
                  style={{ textAlign: "left" }}
                >
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="mono tiny muted">{t.id}</span>
                    <span className={`chip chip--${STATE_CHIP[t.state]}`}>{STATE_LABEL[t.state]}</span>
                  </div>
                  <div className="kanban__card-title" style={{ marginTop: 4 }}>{t.title}</div>
                  <div className="kanban__card-meta">
                    {t.projectName} · {agent?.name ?? t.agentId} · {t.updated}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <div
                className="tiny muted"
                style={{
                  border: "1px dashed var(--border-subtle)",
                  padding: "18px 12px",
                  borderRadius: 8,
                  textAlign: "center",
                }}
              >
                No tasks match this filter.
              </div>
            ) : null}
          </div>
        </div>

        <div className="task-panel">
          {active ? (
            <TaskStage task={active} mode={mode} setMode={setMode} />
          ) : (
            <div className="chart-card">
              <div className="section__eyebrow">No task selected</div>
              <div className="section__title">Pick a task to open the stage</div>
              <div className="section__sub">
                The stage renders avatar, harness, CLI, and model chips in every mode — video,
                voice, and text.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskStage({
  task,
  mode,
  setMode,
}: {
  task: TaskCard;
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  const agent = AGENTS.find((a) => a.id === task.agentId);
  const hue = agent?.hue ?? 200;

  return (
    <div className="task-stage" style={{ gridTemplateColumns: "1fr" }}>
      <div className="task-chrome">
        <div
          className="task-avatar-lg"
          style={{
            background: `oklch(0.62 0.14 ${hue} / 0.22)`,
            borderColor: `oklch(0.62 0.14 ${hue} / 0.5)`,
            color: `oklch(0.86 0.08 ${hue})`,
          }}
        >
          {agent?.name.charAt(0) ?? "?"}
        </div>
        <div className="task-meta-col">
          <div className="task-meta-col__name">
            {agent?.name ?? task.agentId}{" "}
            <span className="tiny muted" style={{ marginLeft: 6 }}>
              {task.id}
            </span>
          </div>
          <div className="task-meta-col__role">
            {agent?.role ?? ""} · {task.projectName} · {task.title}
          </div>
          <div className="task-meta-col__chips">
            <span className="chip chip--accent">
              <IconTerminal size={10} /> harness · {task.harness}
            </span>
            <span className="chip">
              <IconBracket size={10} /> ACP CLI · {task.cli}
            </span>
            {task.models.map((m) => (
              <span key={`${m.provider}-${m.model}`} className="modelchip">
                {m.model} <span className="modelchip__provider">· {m.provider}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        className="debate__stage"
        style={{ minHeight: 240, borderRadius: 10, position: "relative" }}
      >
        <div className="debate__grid" />
        <div className="debate__live">LIVE · {mode}</div>
        <div
          className="debate__committee"
          style={{ gridTemplateColumns: "1fr", gridTemplateRows: "1fr", inset: 30 }}
        >
          <div
            className="debate__tile"
            style={{
              ["--tile-hue" as string]: hue,
              maxWidth: 160,
              gridColumn: 1,
              gridRow: 1,
            }}
          >
            <div className="debate__speaking-ring" />
            <div className="debate__tile-initial">{agent?.name.charAt(0) ?? "?"}</div>
            <div className="debate__tile-label">
              <span>{agent?.name ?? task.agentId}</span>
              <span className="debate__tile-speaking">● LIVE</span>
            </div>
          </div>
        </div>
        {task.note ? (
          <div className="debate__subs" style={{ bottom: 72 }}>
            <div
              className="debate__sub-line"
              style={{ ["--who-hue" as string]: hue }}
            >
              <span className="debate__sub-who">{agent?.name ?? task.agentId}:</span>
              <span>{task.note}</span>
            </div>
          </div>
        ) : null}
        <div className="debate__mode">
          <button
            type="button"
            className={`debate__mode-btn${mode === "video" ? " debate__mode-btn--active" : ""}`}
            onClick={() => setMode("video")}
          >
            <IconVideo size={13} /> Video
          </button>
          <button
            type="button"
            className={`debate__mode-btn${mode === "voice" ? " debate__mode-btn--active" : ""}`}
            onClick={() => setMode("voice")}
          >
            <IconMic size={13} /> Voice
          </button>
          <button
            type="button"
            className={`debate__mode-btn${mode === "text" ? " debate__mode-btn--active" : ""}`}
            onClick={() => setMode("text")}
          >
            <IconChat size={13} /> Text
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
      >
        <MetricCard label="Tokens in" value={task.tokensIn.toLocaleString()} />
        <MetricCard label="Tokens out" value={task.tokensOut.toLocaleString()} />
        <MetricCard label="Cost" value={`$${task.costUsd.toFixed(2)}`} />
        <MetricCard
          label="Iterations"
          value={`${task.iterations}`}
          hint="to acceptance"
        />
      </div>

      <div className="chart-card">
        <div className="section__head">
          <div>
            <div className="section__eyebrow">
              <IconActivity size={11} /> Activity
            </div>
            <div className="section__title">Per-task transcript</div>
            <div className="section__sub">
              Subtitles are on by default across video, voice, and text. The stage keeps the same
              chrome in every mode so you can switch without losing runtime context.
            </div>
          </div>
          <div className="row">
            <button type="button" className="ghost-btn">
              <IconSparkles size={12} /> Summarize
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="chart-card" style={{ padding: 12 }}>
      <div className="section__eyebrow">{label}</div>
      <div className="mono" style={{ fontSize: 22, marginTop: 4 }}>
        {value}
      </div>
      {hint ? <div className="tiny muted">{hint}</div> : null}
    </div>
  );
}
