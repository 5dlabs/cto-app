import { useMemo, useState } from "react";
import {
  IconVideo,
  IconMic,
  IconChat,
  IconBracket,
  IconTerminal,
  IconPalette,
  IconExternal,
  IconSparkles,
} from "./icons";
import {
  PROJECTS,
  DEBATE_SCRIPT,
  DEBATE_COMMITTEE,
  type Project,
  type ProjectStatus,
} from "./data";

type Mode = "video" | "voice" | "text";
type ProjectTab = "design" | "storybook" | "tasks";

const STATUSES: { key: ProjectStatus; label: string; hint: string }[] = [
  { key: "pending", label: "Pending", hint: "dropped — awaiting intake" },
  { key: "in_progress", label: "In Progress", hint: "committee cleared · agents building" },
  { key: "complete", label: "Complete", hint: "shipped · summaries below" },
];

export function ProjectsView() {
  const [selected, setSelected] = useState<string | null>(null);
  const project = useMemo(
    () => PROJECTS.find((p) => p.id === selected) ?? null,
    [selected],
  );

  return (
    <div className="section">
      <div className="kanban">
        {STATUSES.map((col) => (
          <KanbanColumn
            key={col.key}
            label={col.label}
            hint={col.hint}
            items={PROJECTS.filter((p) => p.status === col.key)}
            selected={selected}
            onPick={setSelected}
          />
        ))}
      </div>

      {project ? (
        <ProjectDetail project={project} />
      ) : (
        <Debate />
      )}
    </div>
  );
}

function KanbanColumn({
  label,
  hint,
  items,
  selected,
  onPick,
}: {
  label: string;
  hint: string;
  items: Project[];
  selected: string | null;
  onPick: (id: string | null) => void;
}) {
  return (
    <div className="kanban__col">
      <div className="kanban__col-head">
        <div>
          <div className="kanban__col-title">{label}</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            {hint}
          </div>
        </div>
        <span className="kanban__col-count">{items.length}</span>
      </div>
      {items.map((p) => (
        <button
          type="button"
          key={p.id}
          className={`kanban__card${selected === p.id ? " kanban__card--active" : ""}`}
          onClick={() => onPick(selected === p.id ? null : p.id)}
        >
          <div className="kanban__card-title">{p.name}</div>
          <div className="kanban__card-meta">{p.summary}</div>
          {p.repo ? (
            <div className="kanban__card-row">
              <span className="chip">
                <IconExternal size={10} /> {p.repo}
              </span>
            </div>
          ) : null}
        </button>
      ))}
      {items.length === 0 ? (
        <div
          className="tiny muted"
          style={{
            border: "1px dashed var(--border-subtle)",
            padding: "18px 12px",
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          Nothing here.
        </div>
      ) : null}
    </div>
  );
}

function ProjectDetail({ project }: { project: Project }) {
  const [tab, setTab] = useState<ProjectTab>("design");
  return (
    <div className="project-detail">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="section__eyebrow">Project</div>
          <div className="section__title" style={{ fontSize: 18 }}>
            {project.name}
          </div>
          <div className="section__sub">{project.summary}</div>
        </div>
        <div className="row">
          <span className={`chip chip--${statusChip(project.status)}`}>{statusLabel(project.status)}</span>
          {project.repo ? (
            <span className="chip">
              <IconExternal size={10} /> {project.repo}
            </span>
          ) : null}
        </div>
      </div>

      {project.status === "complete" ? (
        <CompleteSummary project={project} />
      ) : (
        <>
          <div className="tabs">
            <button
              type="button"
              className={`tab${tab === "design" ? " tab--active" : ""}`}
              onClick={() => setTab("design")}
            >
              <IconPalette size={12} /> Design
            </button>
            <button
              type="button"
              className={`tab${tab === "storybook" ? " tab--active" : ""}`}
              onClick={() => setTab("storybook")}
            >
              <IconBracket size={12} /> Storybook
              <span className="tab__count">tweakcn A/B</span>
            </button>
            <button
              type="button"
              className={`tab${tab === "tasks" ? " tab--active" : ""}`}
              onClick={() => setTab("tasks")}
            >
              <IconTerminal size={12} /> Tasks
            </button>
          </div>

          {tab === "design" ? <DesignThread project={project} /> : null}
          {tab === "storybook" ? <StorybookPane project={project} /> : null}
          {tab === "tasks" ? <TasksPane project={project} /> : null}
        </>
      )}
    </div>
  );
}

function statusLabel(s: ProjectStatus) {
  return s === "in_progress" ? "In Progress" : s === "complete" ? "Complete" : "Pending";
}
function statusChip(s: ProjectStatus): "accent" | "success" | "warn" {
  return s === "complete" ? "success" : s === "in_progress" ? "accent" : "warn";
}

function DesignThread({ project }: { project: Project }) {
  return (
    <div className="chart-card" style={{ gap: 14 }}>
      <div className="section__head">
        <div>
          <div className="section__eyebrow">Design thread</div>
          <div className="section__title">Candidates selected from intake</div>
          <div className="section__sub">
            {project.name} — three directions the committee surfaced. Pick one or branch a hybrid.
          </div>
        </div>
        <div className="row">
          <button type="button" className="ghost-btn">
            <IconSparkles size={12} /> Branch hybrid
          </button>
        </div>
      </div>
      <div className="svc-grid">
        {["Spatial", "Editorial", "Terminal"].map((name, i) => (
          <div className="svc-card" key={name}>
            <div className="svc-card__head">
              <div className="svc-card__icon">
                <IconPalette size={14} />
              </div>
              <div>
                <div className="svc-card__tag">{name.toUpperCase()}</div>
                <div className="svc-card__title">Candidate {i + 1}</div>
              </div>
            </div>
            <p className="svc-card__body">
              {name === "Spatial"
                ? "Depth, layered surfaces, accent glow — feels live, trading-desk adjacent."
                : name === "Editorial"
                ? "Print-quality grid, generous whitespace, type-first — great for PRD review."
                : "Monospace, Logseq-flavored blocks — optimizes for keyboard speed and density."}
            </p>
            <div className="svc-card__stack">
              <span className="mono">
                {i === 0
                  ? "shadcn · tokens from 5D · storybook ✓"
                  : i === 1
                  ? "shadcn · tweakcn preset A · storybook ✓"
                  : "shadcn · tweakcn preset B · storybook ✓"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StorybookPane({ project }: { project: Project }) {
  return (
    <div className="chart-card">
      <div className="section__head">
        <div>
          <div className="section__eyebrow">Component library</div>
          <div className="section__title">Storybook — {project.name}</div>
          <div className="section__sub">
            One Storybook per project. Running side-by-side with a tweakcn A/B theme for comparison.
            Exposed as an MCP resource so agents can reference components directly.
          </div>
        </div>
        <div className="row">
          <button type="button" className="ghost-btn">
            <IconExternal size={12} /> Open in browser
          </button>
          <button type="button" className="ghost-btn">
            <IconBracket size={12} /> MCP endpoint
          </button>
        </div>
      </div>
      <div
        className="gitlab-embed__stage"
        style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}
      >
        <div className="gitlab-embed__nav">
          <div className="gitlab-embed__nav-header">Stories</div>
          {[
            "Primitives / Button",
            "Primitives / Input",
            "Primitives / Kbd",
            "Chrome / Sidebar",
            "Chrome / Titlebar",
            "Views / MorganCard",
            "Views / ServiceCard",
            "Views / DebateTile",
          ].map((s, i) => (
            <div
              key={s}
              className={`gitlab-embed__nav-item${i === 5 ? " gitlab-embed__nav-item--active" : ""}`}
            >
              <IconBracket size={13} /> {s}
            </div>
          ))}
        </div>
        <div className="gitlab-embed__main">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="section__eyebrow">Views / MorganCard</div>
              <div className="section__title">MorganCard — default</div>
            </div>
            <div className="row">
              <span className="chip">storybook</span>
              <span className="chip chip--accent">tweakcn</span>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginTop: 6,
            }}
          >
            {(["storybook", "tweakcn"] as const).map((variant) => (
              <div
                key={variant}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 10,
                  padding: 18,
                  display: "grid",
                  placeItems: "center",
                  minHeight: 180,
                }}
              >
                <div className="morgan-card is-active" style={{ margin: 0, width: 232 }}>
                  <div className="morgan-row">
                    <div className="morgan-avatar">M</div>
                    <div className="morgan-meta">
                      <div className="morgan-name">Morgan</div>
                      <div className="morgan-role">{variant === "storybook" ? "v0 tokens" : "tweakcn preset A"}</div>
                    </div>
                  </div>
                  <div className="morgan-cta">
                    <span className="morgan-pill">
                      <IconVideo size={12} /> Video
                    </span>
                    <span className="morgan-pill">
                      <IconMic size={12} /> Voice
                    </span>
                    <span className="morgan-pill">
                      <IconChat size={12} /> Chat
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TasksPane({ project }: { project: Project }) {
  const [mode, setMode] = useState<Mode>("video");
  return (
    <div className="task-stage">
      <div className="task-panel">
        <div className="task-chrome">
          <div className="task-avatar-lg">A</div>
          <div className="task-meta-col">
            <div className="task-meta-col__name">Angie</div>
            <div className="task-meta-col__role">
              agent architect · {project.name} · fix flaky settle test
            </div>
            <div className="task-meta-col__chips">
              <span className="chip chip--accent">
                <IconTerminal size={10} /> harness · OpenClaw
              </span>
              <span className="chip">
                <IconBracket size={10} /> ACP CLI · claude-code 0.8.3
              </span>
              <span className="modelchip">
                claude-opus-4-7 <span className="modelchip__provider">· anthropic</span>
              </span>
              <span className="modelchip">
                gemini-2.5-pro <span className="modelchip__provider">· google</span>
              </span>
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
                ["--tile-hue" as string]: 200,
                maxWidth: 160,
                gridColumn: 1,
                gridRow: 1,
              }}
            >
              <div className="debate__speaking-ring" />
              <div className="debate__tile-initial">A</div>
              <div className="debate__tile-label">
                <span>Angie</span>
                <span className="debate__tile-speaking">● LIVE</span>
              </div>
            </div>
          </div>
          <div className="debate__subs" style={{ bottom: 72 }}>
            <div className="debate__sub-line" style={{ ["--who-hue" as string]: 200 }}>
              <span className="debate__sub-who">Angie:</span>
              <span>
                Replaced poll() with poll_until(tx, 5s) + exponential backoff. Suite is green, 12
                of 12 passed.
              </span>
            </div>
          </div>
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
      </div>

      <div className="task-panel">
        <div className="section__head">
          <div>
            <div className="section__eyebrow">Task tree</div>
            <div className="section__title">3 epics · 9 tasks</div>
          </div>
        </div>
        <div className="mem-list" style={{ gap: 2 }}>
          {[
            ["Fix flaky settle tests", "Angie · running"],
            ["Update release notes", "Morgan · queued"],
            ["Gate on p99 budget", "Atlas · queued"],
            ["Typed-data schema", "Blaze · done"],
            ["Operator registration", "Blaze · running"],
            ["Slashing window spike", "Vega · blocked"],
          ].map(([title, meta]) => (
            <div className="mem-list-item" key={title}>
              <span>{title}</span>
              <span className="count">{meta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompleteSummary({ project }: { project: Project }) {
  return (
    <div className="summary-card">
      <h3>What shipped</h3>
      <p>
        {project.name} is done. Below is the plain-language summary of the work — no per-task links
        needed.
      </p>
      <ul>
        <li>
          Foundations — Tauri shell, React UI, Radix-12 token ramp, sidebar IA landed on the
          primary navigation we agreed on.
        </li>
        <li>
          Observability — 5D OBSERVE wiring with Prometheus + Grafana + Loki + Jaeger dashboards
          pre-provisioned for every 5D service.
        </li>
        <li>
          Storybook + tweakcn preset A running side-by-side so every primitive has an A/B theme
          version.
        </li>
        <li>Acceptance criteria hit — 12/12 integration + visual snapshots.</li>
      </ul>
    </div>
  );
}

function Debate() {
  const [mode, setMode] = useState<Mode>("video");
  const [cursor, setCursor] = useState(0);
  const active = DEBATE_SCRIPT[cursor % DEBATE_SCRIPT.length];

  return (
    <div className="debate">
      <div className="debate__stage">
        <div className="debate__grid" />
        <div className="debate__live">LIVE · {mode}</div>
        <div className="debate__committee">
          <div
            className="debate__tile debate__tile--moderator"
            style={{ ["--tile-hue" as string]: 282 }}
          >
            {active.who === "Optimus Pestimus" ? (
              <div className="debate__speaking-ring" />
            ) : null}
            <div className="debate__tile-initial">OP</div>
            <div className="debate__tile-label">
              <span>Optimus Pestimus</span>
              <span className={active.who === "Optimus Pestimus" ? "debate__tile-speaking" : ""}>
                {active.who === "Optimus Pestimus" ? "● speaking" : "mod"}
              </span>
            </div>
          </div>
          {DEBATE_COMMITTEE.map((d, i) => {
            const speaking = active.who === d.name;
            return (
              <div
                key={d.name}
                className="debate__tile"
                style={{
                  ["--tile-hue" as string]: d.hue,
                  gridColumn: (i % 3) + 1,
                  gridRow: 2,
                }}
              >
                {speaking ? <div className="debate__speaking-ring" /> : null}
                <div className="debate__tile-initial">{d.name.charAt(0)}</div>
                <div className="debate__tile-label">
                  <span>
                    {d.name} <span className="muted">· {d.role}</span>
                  </span>
                  <span className={speaking ? "debate__tile-speaking" : ""}>
                    {speaking ? "● speaking" : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="debate__subs">
          {DEBATE_SCRIPT.slice(Math.max(0, cursor - 2), cursor + 1).map((line, i) => (
            <div
              className="debate__sub-line"
              style={{ ["--who-hue" as string]: line.hue, opacity: 1 - (cursor - (cursor - 2 + i)) * 0.35 }}
              key={`${line.who}-${i}-${cursor}`}
            >
              <span className="debate__sub-who">{line.who}:</span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>

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
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="debate__mode-btn"
            onClick={() => setCursor((c) => c + 1)}
            title="Advance script"
          >
            Next speaker
          </button>
        </div>
      </div>

      <aside className="debate__aside">
        <div className="chart-card">
          <div className="section__head">
            <div>
              <div className="section__eyebrow">Intake</div>
              <div className="section__title">Default state</div>
            </div>
          </div>
          <p className="section__sub" style={{ margin: 0 }}>
            Select a project from the board above to open its Design thread, Storybook, or Tasks.
            While nothing is selected, Optimus Pestimus moderates a live debate with the committee
            — audio and subtitles always on.
          </p>
        </div>
        <div className="chart-card">
          <div className="section__head">
            <div>
              <div className="section__eyebrow">Committee</div>
              <div className="section__title">Who's on the panel</div>
            </div>
          </div>
          <div className="mem-list">
            {DEBATE_COMMITTEE.map((d) => (
              <div className="mem-list-item" key={d.name}>
                <span>{d.name}</span>
                <span className="count">{d.role}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
