import { useEffect, useMemo, useState } from "react";
import {
  IconTerminal,
  IconVideo,
  IconMic,
  IconChat,
  IconFilter,
  IconSearch,
  IconExternal,
  IconClose,
  IconBolt,
  IconRefresh,
  IconSend,
  IconFile,
  IconGit,
  IconChevRight,
} from "./icons";
import { AGENTS, TASKS, CODER_URL, type TaskCard, type TaskState } from "./data";

type StateFilter = "all" | TaskState;
type Mode = "video" | "voice" | "text";
type SessionView = "list" | "session";

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
              {s === "all" ? "All" : STATE_LABEL[s as TaskState]}
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
                <span className={`chip chip--${STATE_CHIP[t.state]}`}>{STATE_LABEL[t.state]}</span>
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
  const agent = AGENTS.find((a) => a.id === task.agentId);
  const [mode, setMode] = useState<Mode>("video");
  const [prompt, setPrompt] = useState("");
  const [tweaksOpen, setTweaksOpen] = useState(true);
  const [rail, setRail] = useState<"overview" | "files" | "branches">("overview");
  const hue = agent?.hue ?? 200;

  const coderUrl = useMemo(() => {
    const base = CODER_URL;
    if (!task.branch) return base;
    return `${base}&branch=${encodeURIComponent(task.branch)}`;
  }, [task.branch]);

  const runningPeers = TASKS.filter(
    (t) => t.state === "running" && t.id !== task.id,
  ).slice(0, 4);

  return (
    <div className="session">
      <div className="session__chrome">
        <button
          type="button"
          className="ghost-btn"
          onClick={onBack}
          aria-label="Back to sessions list"
        >
          ← Sessions
        </button>
        {task.branch ? (
          <span className="session__branch">
            <IconGit size={12} /> {task.branch}
          </span>
        ) : null}
        <span className={`chip chip--${STATE_CHIP[task.state]}`}>
          {STATE_LABEL[task.state]}
        </span>
        <span className="session__spacer" />
        <span className="session__url mono tiny muted">
          coder.5dlabs.ai/?folder=/home/coder/workspace/repos/{task.projectId}
        </span>
        <button
          type="button"
          className="ghost-btn"
          title="Reload workspace"
          onClick={() => {
            const el = document.getElementById("coder-iframe") as HTMLIFrameElement | null;
            if (el) el.src = el.src;
          }}
        >
          <IconRefresh size={12} />
        </button>
        <a
          className="primary-btn"
          href={coderUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open full <IconExternal size={10} />
        </a>
      </div>

      <div className="session__body">
        <aside className="session__agent">
          <div className="session__agent-head">
            <div className="session__agent-brand">
              <span className="session__agent-brand-5d">5D</span>
              <span className="session__agent-brand-title">
                5DLABS CTO: CTO AGENTS
              </span>
            </div>
            <div className="session__agent-modes">
              <button
                type="button"
                className={`session__mode-chip${mode === "video" ? " is-active" : ""}`}
                onClick={() => setMode("video")}
              >
                <IconVideo size={10} /> Vid
              </button>
              <button
                type="button"
                className={`session__mode-chip${mode === "voice" ? " is-active" : ""}`}
                onClick={() => setMode("voice")}
              >
                <IconMic size={10} /> Mic
              </button>
              <button
                type="button"
                className={`session__mode-chip${mode === "text" ? " is-active" : ""}`}
                onClick={() => setMode("text")}
              >
                <IconChat size={10} /> Txt
              </button>
            </div>
          </div>

          <div className="session__agent-stage">
            <div className="session__agent-rail">
              <button
                type="button"
                className={`session__rail-btn${rail === "overview" ? " is-active" : ""}`}
                onClick={() => setRail("overview")}
                aria-label="Overview"
                title="Overview"
              >
                5D
              </button>
              <button
                type="button"
                className={`session__rail-btn${rail === "files" ? " is-active" : ""}`}
                onClick={() => setRail("files")}
                aria-label="Files"
                title="Files"
              >
                <IconFile size={14} />
              </button>
              <button
                type="button"
                className={`session__rail-btn${rail === "branches" ? " is-active" : ""}`}
                onClick={() => setRail("branches")}
                aria-label="Branches"
                title="Branches"
              >
                <IconGit size={14} />
              </button>
            </div>

            <div className="session__agent-stage-main">
              <div
                className="session__agent-portrait"
                style={{ ["--hue" as string]: `${hue}` }}
              >
                <div className="session__agent-portrait-ring" />
                <div className="session__agent-portrait-inner">
                  {agent?.name.charAt(0) ?? "?"}
                </div>
              </div>
              <div className="session__agent-name">{agent?.name ?? task.agentId}</div>
              <div className="session__agent-meta tiny muted">
                {task.cli} · {task.harness} · listening
              </div>

              {rail === "overview" && runningPeers.length > 0 ? (
                <div className="session__peers">
                  <div className="tiny muted">Other active sessions</div>
                  {runningPeers.map((peer) => {
                    const a = AGENTS.find((x) => x.id === peer.agentId);
                    return (
                      <button
                        key={peer.id}
                        type="button"
                        className="session__peer"
                        onClick={() => onSwitchTask(peer.id)}
                      >
                        <span
                          className="session__peer-dot"
                          style={{ background: `oklch(0.65 0.14 ${a?.hue ?? 200})` }}
                        />
                        <span className="session__peer-name">{a?.name ?? peer.agentId}</span>
                        <span className="session__peer-branch mono tiny muted">
                          {peer.branch ?? peer.projectName}
                        </span>
                        <IconChevRight size={10} />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {rail === "files" ? (
                <div className="session__peers">
                  <div className="tiny muted">Files in this session</div>
                  {(task.files ?? []).map((f) => (
                    <div key={f.path} className="session__peer" style={{ cursor: "default" }}>
                      <IconFile size={11} />
                      <span className="session__peer-name">{f.label}</span>
                      <span className="session__peer-branch mono tiny muted">
                        {f.language}
                      </span>
                    </div>
                  ))}
                  {(task.files ?? []).length === 0 ? (
                    <div className="tiny muted">
                      File list is sourced from the embedded code-server.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {rail === "branches" ? (
                <div className="session__peers">
                  <div className="tiny muted">Branches on this repo</div>
                  {[task.branch, "main"].filter(Boolean).map((b) => (
                    <div key={b as string} className="session__peer" style={{ cursor: "default" }}>
                      <IconGit size={11} />
                      <span className="session__peer-name">{b}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <form
            className="session__prompt"
            onSubmit={(e) => {
              e.preventDefault();
              setPrompt("");
            }}
          >
            <input
              type="text"
              placeholder="Describe what to build"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="session__prompt-input"
            />
            <button type="submit" className="session__prompt-send" aria-label="Send">
              <IconSend size={12} />
            </button>
          </form>
          <div className="session__prompt-foot">
            <span className="chip">
              <IconBolt size={10} /> Auto
            </span>
            <span className="tiny muted">Offline</span>
          </div>
        </aside>

        <section className="session__coder">
          <iframe
            id="coder-iframe"
            className="session__coder-iframe"
            src={coderUrl}
            title="Coder workspace — task CRD"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
          <div className="session__coder-foot tiny muted">
            <span className="mono">{task.branch ?? ""}</span>
            <span>·</span>
            <span>{task.harness}</span>
            <span>·</span>
            <span>{task.cli.split(" ")[0]}</span>
            <span>·</span>
            <span>live diff from code-server</span>
          </div>
        </section>
      </div>

      {tweaksOpen ? (
        <TweaksPanel onClose={() => setTweaksOpen(false)} />
      ) : (
        <button
          type="button"
          className="session__tweaks-open"
          onClick={() => setTweaksOpen(true)}
        >
          Tweaks
        </button>
      )}
    </div>
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
