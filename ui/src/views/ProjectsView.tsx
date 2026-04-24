import { useMemo, useState } from "react";
import {
  AGENTS,
  TASKS,
  TASK_STATE_CHIP,
  TASK_STATE_LABEL,
  taskBoardLane,
  taskCoderUrl,
  type ProjectBoardLane,
  type TaskCard,
} from "./data";
import { CoderWorkspacePane } from "./CoderWorkspacePane";
import { IconExternal, IconGit } from "./icons";
import { useProjects } from "../state/projectContext";
import type { ProjectDescriptor, ProjectStatus } from "../api/projectApi";
import { PhaseChip } from "../components/projects/PhaseChip";

const LANES: { key: ProjectBoardLane; label: string; hint: string }[] = [
  { key: "pending", label: "Pending", hint: "Not started yet" },
  { key: "ready", label: "Ready", hint: "Cleared to pick up" },
  { key: "in_progress", label: "In progress", hint: "Active work" },
  { key: "done", label: "Done", hint: "Complete" },
];

type Selection = { task: TaskCard; lane: ProjectBoardLane };

/**
 * For every project in the live list that isn't already represented by a
 * task, synthesize a lightweight "pending" row so newly-created projects
 * appear on the board immediately. The title + note reflect the PRD state
 * machine so the user knows what the next Morgan step is.
 */
function syntheticTaskForProject(p: ProjectDescriptor): TaskCard {
  const title = !p.hasPrd
    ? "Draft PRD"
    : p.state === "ready"
      ? p.hasArchitecture
        ? "Ready for intake"
        : "Draft architecture"
      : "Refine PRD";
  const note = !p.hasPrd
    ? "Have a conversation with Morgan, then say \u201cbegin intake\u201d."
    : p.state === "ready"
      ? p.hasArchitecture
        ? "PRD + architecture are frozen — kick off the intake pipeline."
        : "PRD is frozen — ask Morgan to draft .prd/architecture.md next."
      : "PRD in progress — iterate with Morgan, then mark ready.";
  return {
    id: `P-${p.name}`,
    title,
    projectId: p.name,
    projectName: p.name,
    agentId: "morgan",
    boardLane: "pending",
    state: "queued",
    harness: "OpenClaw",
    cli: "claude-code",
    models: [{ model: "claude-opus-4-7", provider: "anthropic" }],
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    iterations: 0,
    updated: p.updatedAt ?? "new",
    repo: p.name,
    note,
  };
}

export function ProjectsView() {
  const [selected, setSelected] = useState<Selection | null>(null);
  const { projects } = useProjects();

  const statusByProject = useMemo(() => {
    const map = new Map<string, ProjectStatus | null>();
    for (const p of projects) map.set(p.name, p.status ?? null);
    return map;
  }, [projects]);

  const byLane = useMemo(() => {
    const map: Record<ProjectBoardLane, TaskCard[]> = {
      pending: [],
      ready: [],
      in_progress: [],
      done: [],
    };
    for (const t of TASKS) {
      map[taskBoardLane(t)].push(t);
    }
    // Surface live projects that don't yet have a task pointing at them.
    const representedProjects = new Set(
      TASKS.filter((t) => t.repo).map((t) => t.repo as string),
    );
    for (const p of projects) {
      if (representedProjects.has(p.name)) continue;
      map.pending.push(syntheticTaskForProject(p));
    }
    for (const lane of Object.keys(map) as ProjectBoardLane[]) {
      map[lane].sort(
        (a, b) =>
          a.projectName.localeCompare(b.projectName) || a.title.localeCompare(b.title),
      );
    }
    return map;
  }, [projects]);

  if (selected) {
    const { task, lane } = selected;
    if (lane === "pending" || lane === "ready") {
      return (
        <CoderWorkspacePane
          task={task}
          onBack={() => setSelected(null)}
          backLabel="← Projects"
          iframeTitle="Coder workspace — Morgan"
        />
      );
    }
    if (lane === "in_progress") {
      return (
        <ProjectsNonCoderStage
          task={task}
          onBack={() => setSelected(null)}
          eyebrow="In progress"
          title="Active task"
          sub="Live harness session, logs, and agent stage — workspace embed is for pending / ready."
        />
      );
    }
    return (
      <ProjectsNonCoderStage
        task={task}
        onBack={() => setSelected(null)}
        eyebrow="Done"
        title="Shipped task"
        sub="Summary and acceptance — this lane does not open the Coder workspace."
      />
    );
  }

  return (
    <div className="section">
      <div className="section__head">
        <div>
          <div className="section__eyebrow">Projects</div>
          <div className="section__title">Work by stage</div>
          <div className="section__sub">
            Pending and Ready open Morgan&apos;s Coder workspace (embedded). Other stages show a
            different detail view.
          </div>
        </div>
      </div>

      <div className="projects-board">
        {LANES.map((col) => (
          <section className="projects-board__band" key={col.key} aria-label={col.label}>
            <div className="projects-board__band-head">
              <div>
                <div className="kanban__col-title">{col.label}</div>
                <div className="tiny muted" style={{ marginTop: 4 }}>
                  {col.hint}
                </div>
              </div>
              <span className="kanban__col-count">{byLane[col.key].length}</span>
            </div>

            {byLane[col.key].length > 0 ? (
              <div className="projects-board__cards">
                {byLane[col.key].map((task) => (
                  <ProjectBoardCard
                    key={task.id}
                    task={task}
                    status={
                      statusByProject.get(task.repo ?? task.projectId) ?? null
                    }
                    onSelect={() => setSelected({ task, lane: col.key })}
                  />
                ))}
              </div>
            ) : (
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
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function ProjectBoardCard({
  task,
  status,
  onSelect,
}: {
  task: TaskCard;
  status: ProjectStatus | null;
  onSelect: () => void;
}) {
  const agent = AGENTS.find((a) => a.id === task.agentId);
  const assigned = agent?.name ?? task.agentId;
  const statusLabel = TASK_STATE_LABEL[task.state];
  const chip = TASK_STATE_CHIP[task.state];

  return (
    <button type="button" className="projects-board__card" onClick={onSelect}>
      <div className="projects-board__card-project">
        <span>{task.projectName}</span>
        <PhaseChip status={status} />
      </div>
      <div className="projects-board__card-task" title={task.title}>
        {task.title}
      </div>
      <div className="projects-board__card-foot">
        <span className={`chip chip--${chip}`}>{statusLabel}</span>
        <span className="projects-board__card-assign" title={assigned}>
          {assigned}
        </span>
      </div>
    </button>
  );
}

function ProjectsNonCoderStage({
  task,
  onBack,
  eyebrow,
  title,
  sub,
}: {
  task: TaskCard;
  onBack: () => void;
  eyebrow: string;
  title: string;
  sub: string;
}) {
  const agent = AGENTS.find((a) => a.id === task.agentId);
  const assigned = agent?.name ?? task.agentId;
  const coderUrl = taskCoderUrl(task);

  return (
    <div className="session-full">
      <div className="session-full__overlay">
        <button type="button" className="session-full__back" onClick={onBack} aria-label="Back">
          ← Projects
        </button>
        <span className="mono tiny muted">{task.id}</span>
        <span className={`chip chip--${TASK_STATE_CHIP[task.state]}`}>
          {TASK_STATE_LABEL[task.state]}
        </span>
        <span className="session-full__spacer" />
        {task.branch ? (
          <span className="session-full__branch">
            <IconGit size={12} /> {task.branch}
          </span>
        ) : null}
        <a
          className="session-full__icon-btn"
          href={coderUrl}
          target="_blank"
          rel="noreferrer"
          title="Open Coder in new tab"
        >
          <IconExternal size={12} />
        </a>
      </div>

      <div className="projects-detail-body">
        <div className="chart-card" style={{ maxWidth: 560, margin: "0 auto" }}>
          <div className="section__head">
            <div>
              <div className="section__eyebrow">{eyebrow}</div>
              <div className="section__title">{title}</div>
              <div className="section__sub">{sub}</div>
            </div>
          </div>
          <div className="mem-list" style={{ gap: 10 }}>
            <div className="mem-list-item">
              <span>Project</span>
              <span className="count">{task.projectName}</span>
            </div>
            <div className="mem-list-item">
              <span>Task</span>
              <span className="count" style={{ textAlign: "right", maxWidth: "65%" }}>
                {task.title}
              </span>
            </div>
            <div className="mem-list-item">
              <span>Assigned</span>
              <span className="count">{assigned}</span>
            </div>
            <div className="mem-list-item">
              <span>Harness</span>
              <span className="count">{task.harness}</span>
            </div>
            <div className="mem-list-item">
              <span>Updated</span>
              <span className="count">{task.updated}</span>
            </div>
            {task.note ? (
              <div className="tiny muted" style={{ lineHeight: 1.5, paddingTop: 4 }}>
                {task.note}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
