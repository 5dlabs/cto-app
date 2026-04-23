import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconExternal, IconFolder, IconGit, IconRefresh } from "./icons";
import {
  buildCoderUrl,
  TASK_STATE_CHIP,
  TASK_STATE_LABEL,
  getRepoFromLocation,
  taskActiveRepo,
  taskCoderUrl,
  type TaskCard,
} from "./data";
import { ProjectApiError, projectApi } from "../api/projectApi";

type WorkspaceProbe =
  | { state: "idle"; note: string }
  | { state: "checking"; note: string }
  | { state: "ok"; note: string }
  | { state: "missing"; note: string }
  | { state: "error"; note: string };

export function CoderWorkspacePane({
  task,
  onBack,
  backLabel,
  iframeTitle = "Coder workspace",
  children,
}: {
  task: TaskCard;
  onBack: () => void;
  backLabel: string;
  iframeTitle?: string;
  children?: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [urlRepo, setUrlRepo] = useState<string | null>(() => getRepoFromLocation());
  const [probe, setProbe] = useState<WorkspaceProbe>({
    state: "idle",
    note: "No repo pinned; opening repos root.",
  });
  const [forceRootFallback, setForceRootFallback] = useState(false);
  useEffect(() => {
    const onNav = () => setUrlRepo(getRepoFromLocation());
    window.addEventListener("popstate", onNav);
    window.addEventListener("hashchange", onNav);
    return () => {
      window.removeEventListener("popstate", onNav);
      window.removeEventListener("hashchange", onNav);
    };
  }, []);

  const coderUrl = useMemo(() => taskCoderUrl(task), [task, urlRepo]);
  const activeRepo = useMemo(() => taskActiveRepo(task), [task, urlRepo]);
  const fallbackUrl = useMemo(() => buildCoderUrl(), []);
  const resolvedUrl = forceRootFallback ? fallbackUrl : coderUrl;

  useEffect(() => {
    setForceRootFallback(false);
  }, [activeRepo, coderUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!activeRepo) {
      setProbe({ state: "idle", note: "No repo pinned; opening repos root." });
      return;
    }
    setProbe({
      state: "checking",
      note: `Verifying /workspace/repos/${activeRepo} on project-api...`,
    });
    void projectApi
      .get(activeRepo)
      .then((desc) => {
        if (cancelled) return;
        setProbe({
          state: "ok",
          note: `Workspace exists: ${desc.path}`,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ProjectApiError && err.status === 404) {
          setForceRootFallback(true);
          setProbe({
            state: "missing",
            note:
              `Missing /workspace/repos/${activeRepo}; ` +
              "auto-fallback to repos root applied.",
          });
          return;
        }
        setProbe({
          state: "error",
          note:
            err instanceof Error
              ? err.message
              : "Unable to verify workspace path (project-api error).",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [activeRepo]);

  return (
    <div className="session-full">
      <iframe
        ref={iframeRef}
        className="session-full__iframe"
        src={resolvedUrl}
        title={iframeTitle}
        allow="clipboard-read; clipboard-write; fullscreen"
      />

      <div className="session-full__overlay">
        <button type="button" className="session-full__back" onClick={onBack} aria-label="Back">
          {backLabel}
        </button>
        {activeRepo ? (
          <span
            className="session-full__branch"
            title={`/workspace/repos/${activeRepo}`}
          >
            <IconFolder size={12} /> {activeRepo}
          </span>
        ) : null}
        {task.branch ? (
          <span className="session-full__branch">
            <IconGit size={12} /> {task.branch}
          </span>
        ) : null}
        <span className={`chip chip--${TASK_STATE_CHIP[task.state]}`}>
          {TASK_STATE_LABEL[task.state]}
        </span>
        <span className="session-full__spacer" />
        <button
          type="button"
          className="session-full__icon-btn"
          title="Reload workspace"
          onClick={() => {
            const el = iframeRef.current;
            if (el) el.src = resolvedUrl;
          }}
        >
          <IconRefresh size={12} />
        </button>
        <a
          className="session-full__icon-btn"
          href={resolvedUrl}
          target="_blank"
          rel="noreferrer"
          title="Open in new tab"
        >
          <IconExternal size={12} />
        </a>
      </div>

      <div className="session-full__diag" aria-live="polite">
        <span className={`chip session-full__diag-chip session-full__diag-chip--${probe.state}`}>
          workspace {probe.state}
        </span>
        <span className="session-full__diag-note">{probe.note}</span>
      </div>

      {children}
    </div>
  );
}
