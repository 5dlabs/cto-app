import { useState } from "react";
import { useProjects } from "../state/projectContext";
import { NewProjectModal } from "./NewProjectModal";
import {
  IconExternal,
  IconFolder,
  IconPlus,
  IconRefresh,
  IconGit,
} from "./icons";
import { buildCoderUrl } from "./data";

/**
 * Right-rail panel that shows the current project context and lets the user
 * switch or create projects. Lives on the Morgan view today; the same
 * `useProjects()` hook is consumed elsewhere (Projects list, Tasks view,
 * Coder iframe) so everything stays in sync.
 */
export function ProjectContextPanel({
  onProjectCreated,
  onProjectSwitched,
}: {
  /** Fired after a successful `createProject`. Useful for Morgan chat nudges. */
  onProjectCreated?: (name: string) => void;
  /** Fired on any explicit active-project change (create counts too). */
  onProjectSwitched?: (name: string) => void;
}) {
  const {
    projects,
    activeProject,
    activeDescriptor,
    source,
    error,
    refreshing,
    refresh,
    setActive,
    verifyProject,
  } = useProjects();
  const [showNew, setShowNew] = useState(false);
  const [busyFor, setBusyFor] = useState<string | null>(null);

  const openCoderFor = async (name: string) => {
    setBusyFor(name);
    try {
      await verifyProject(name);
    } catch (err) {
      console.warn("[project-ctx] verify failed, opening anyway:", err);
    } finally {
      setBusyFor(null);
    }
    const url = buildCoderUrl({ repo: name });
    window.open(url, "_blank", "noreferrer");
  };

  return (
    <>
      <div className="chart-card project-ctx">
        <div className="section__head">
          <div>
            <div className="section__eyebrow">
              Project context
              {source === "stub" ? (
                <span
                  className="tiny"
                  style={{ marginLeft: 6, color: "#f0c060" }}
                  title={error ?? "project-api unreachable — using seed data"}
                >
                  · offline
                </span>
              ) : null}
            </div>
            <div className="section__title">
              {activeProject ?? "No project active"}
            </div>
            <div className="section__sub">
              {activeProject
                ? `Morgan's cwd is /workspace/repos/${activeProject}.`
                : "Pick an existing project below, or create a new one to set Morgan's working directory."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="session-full__icon-btn"
              title="Refresh projects"
              onClick={() => void refresh()}
              aria-label="Refresh projects"
            >
              <IconRefresh
                size={12}
                style={refreshing ? { opacity: 0.6 } : undefined}
              />
            </button>
            <button
              type="button"
              className="primary-btn primary-btn--icon"
              onClick={() => setShowNew(true)}
              aria-label="New project"
              title="New project"
            >
              <IconPlus size={14} />
            </button>
          </div>
        </div>

        {activeDescriptor ? (
          <div className="project-ctx__meta">
            <div className="project-ctx__meta-row">
              <span className="muted tiny">path</span>
              <span className="mono tiny">{activeDescriptor.path}</span>
            </div>
            {activeDescriptor.branch ? (
              <div className="project-ctx__meta-row">
                <span className="muted tiny">branch</span>
                <span className="tiny">
                  <IconGit size={10} /> {activeDescriptor.branch}
                </span>
              </div>
            ) : null}
            <div className="project-ctx__meta-row">
              <span className="muted tiny">PRD</span>
              <span
                className={`chip chip--${
                  activeDescriptor.hasPrd ? "success" : "muted"
                }`}
              >
                {activeDescriptor.hasPrd ? "prd.md present" : "no prd.md yet"}
              </span>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => void openCoderFor(activeDescriptor.name)}
                title="Open this project's workspace in a new tab"
                disabled={busyFor === activeDescriptor.name}
              >
                <IconExternal size={11} />{" "}
                {busyFor === activeDescriptor.name ? "Preparing…" : "Open workspace"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="project-ctx__list">
          <div
            className="tiny muted"
            style={{ padding: "8px 2px 2px 2px", letterSpacing: 0.4 }}
          >
            {projects.length === 0
              ? "Nothing in /workspace/repos yet."
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </div>
          {projects.map((p) => {
            const isActive = p.name === activeProject;
            return (
              <button
                type="button"
                key={p.name}
                className={`project-ctx__item${
                  isActive ? " project-ctx__item--active" : ""
                }`}
                onClick={async () => {
                  if (isActive) return;
                  await setActive(p.name);
                  onProjectSwitched?.(p.name);
                }}
                title={p.path}
              >
                <span className="project-ctx__item-icon" aria-hidden>
                  <IconFolder size={12} />
                </span>
                <span className="project-ctx__item-name">{p.name}</span>
                {p.hasPrd ? (
                  <span
                    className="project-ctx__item-badge"
                    title="prd.md present"
                  >
                    PRD
                  </span>
                ) : null}
                {isActive ? (
                  <span
                    className="project-ctx__item-dot"
                    aria-label="active"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <NewProjectModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(p) => {
          onProjectCreated?.(p.name);
          onProjectSwitched?.(p.name);
        }}
      />
    </>
  );
}
