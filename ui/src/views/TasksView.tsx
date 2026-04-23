import { useEffect, useMemo, useState } from "react";
import {
  IconTerminal,
  IconFilter,
  IconSearch,
  IconClose,
  IconGit,
} from "./icons";
import {
  AGENTS,
  TASKS,
  TASK_STATE_CHIP,
  TASK_STATE_LABEL,
  type TaskCard,
  type TaskState,
} from "./data";
import { CoderWorkspacePane } from "./CoderWorkspacePane";

type StateFilter = "all" | TaskState;
type SessionView = "list" | "session";

export function TasksView() {
  const [view, setView] = useState<SessionView>("list");
  const [selected, setSelected] = useState<string>(
    TASKS.find((t) => t.state === "running")?.id ?? TASKS[0].id,
  );

  const task = useMemo(
    () => TASKS.find((t) => t.id === selected) ?? TASKS[0],
    [selected],
  );

  if (view === "session") {
    return (
      <SessionStage
        task={task}
        onBack={() => setView("list")}
        onSwitchTask={(id) => setSelected(id)}
      />
    );
  }

  return (
    <TaskListPane
      selected={selected}
      onOpen={(id) => {
        setSelected(id);
        setView("session");
      }}
    />
  );
}

function TaskListPane({
  selected,
  onOpen,
}: {
  selected: string;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("all");

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
            Click a task to open its code-server session — the task CRD's workspace loads alongside
            the agent stage.
          </div>
        </div>
        <div className="row">
          <span className="chip">spend · ${totals.cost.toFixed(2)}</span>
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
              {s === "all" ? "All" : TASK_STATE_LABEL[s as TaskState]}
              <span className="tab__count">
                {s === "all" ? TASKS.length : TASKS.filter((t) => t.state === s).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mem-list" style={{ gap: 6 }}>
        {filtered.map((t) => {
          const agent = AGENTS.find((a) => a.id === t.agentId);
          const isActive = selected === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`kanban__card${isActive ? " kanban__card--active" : ""}`}
              onClick={() => onOpen(t.id)}
              style={{ textAlign: "left", cursor: "pointer", width: "100%" }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="mono tiny muted">{t.id}</span>
                <span className={`chip chip--${TASK_STATE_CHIP[t.state]}`}>
                  {TASK_STATE_LABEL[t.state]}
                </span>
              </div>
              <div className="kanban__card-title" style={{ marginTop: 4 }}>{t.title}</div>
              <div className="kanban__card-meta">
                {t.projectName} · {agent?.name ?? t.agentId} · {t.updated}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {t.branch ? (
                  <span className="chip">
                    <IconGit size={10} /> {t.branch}
                  </span>
                ) : null}
                <span className="chip chip--accent">
                  <IconTerminal size={10} /> {t.harness}
                </span>
                <span
                  className="mono tiny muted"
                  style={{ marginLeft: "auto" }}
                >
                  {t.cli}
                </span>
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
  );
}

function SessionStage({
  task,
  onBack,
  onSwitchTask,
}: {
  task: TaskCard;
  onBack: () => void;
  onSwitchTask: (id: string) => void;
}) {
  void onSwitchTask;
  const [tweaksOpen, setTweaksOpen] = useState(false);

  return (
    <CoderWorkspacePane
      task={task}
      onBack={onBack}
      backLabel="← Sessions"
      iframeTitle="Coder workspace — task CRD"
    >
      {tweaksOpen ? (
        <TweaksPanel onClose={() => setTweaksOpen(false)} />
      ) : (
        <button
          type="button"
          className="session-full__tweaks-open"
          onClick={() => setTweaksOpen(true)}
        >
          Tweaks
        </button>
      )}
    </CoderWorkspacePane>
  );
}

const ACCENTS: { key: string; label: string; hue: number; chroma: number }[] = [
  { key: "violet", label: "Violet", hue: 282, chroma: 0.165 },
  { key: "cyan", label: "Cyan", hue: 215, chroma: 0.14 },
  { key: "amber", label: "Amber", hue: 68, chroma: 0.155 },
  { key: "jade", label: "Jade", hue: 155, chroma: 0.15 },
];

type Density = "compact" | "default";

function TweaksPanel({ onClose }: { onClose: () => void }) {
  const [accent, setAccent] = useState<string>(() => {
    const shell = document.querySelector(".app-shell") as HTMLElement | null;
    return shell?.getAttribute("data-motif") ?? "violet";
  });
  const [density, setDensity] = useState<Density>("default");

  useEffect(() => {
    const shell = document.querySelector(".app-shell") as HTMLElement | null;
    if (!shell) return;
    shell.setAttribute("data-motif", accent);
  }, [accent]);

  useEffect(() => {
    const shell = document.querySelector(".app-shell") as HTMLElement | null;
    if (!shell) return;
    shell.setAttribute("data-density", density);
  }, [density]);

  return (
    <div className="tweaks">
      <div className="tweaks__head">
        <div>
          <div className="tweaks__title">Tweaks</div>
          <div className="tweaks__eyebrow">ACCENT · DENSITY</div>
        </div>
        <button
          type="button"
          className="tweaks__close"
          onClick={onClose}
          aria-label="Close tweaks"
        >
          <IconClose size={11} />
        </button>
      </div>

      <div className="tweaks__section">
        <div className="tweaks__label">ACCENT COLOUR</div>
        <div className="tweaks__swatches">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              type="button"
              className={`tweaks__swatch${accent === a.key ? " is-active" : ""}`}
              onClick={() => setAccent(a.key)}
            >
              <span
                className="tweaks__swatch-dot"
                style={{
                  background: `oklch(0.63 ${a.chroma} ${a.hue})`,
                  boxShadow: `0 0 0 1px oklch(0.63 ${a.chroma} ${a.hue} / 0.4)`,
                }}
              />
              {a.label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="tweaks__section">
        <div className="tweaks__label">DENSITY</div>
        <div className="tweaks__density">
          {(["compact", "default"] as Density[]).map((d) => (
            <button
              key={d}
              type="button"
              className={`tweaks__density-btn${density === d ? " is-active" : ""}`}
              onClick={() => setDensity(d)}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
