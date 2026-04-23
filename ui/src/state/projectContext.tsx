/**
 * App-wide project context: what project are we in, what does the list look
 * like, and how do we mutate it. Consumed by the Morgan view (right-rail
 * panel), the Projects list, and the Tasks view / Coder iframe host so they
 * all stay in sync when the user creates or switches projects.
 *
 * The provider talks to `projectApi`; when the API is unreachable it falls
 * back to a static seed so the rest of the shell stays usable (this was the
 * explicit design constraint from the user — the UI shouldn't hard-fail
 * when the Morgan pod isn't running).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  PROJECT_API_BASE_URL,
  ProjectApiError,
  projectApi,
  type ProjectDescriptor,
} from "../api/projectApi";

const ACTIVE_STORAGE_KEY = "5d.activeProject";

function readStoredActive(): string | null {
  try {
    const v = window.localStorage.getItem(ACTIVE_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function writeStoredActive(name: string | null): void {
  try {
    if (name) window.localStorage.setItem(ACTIVE_STORAGE_KEY, name);
    else window.localStorage.removeItem(ACTIVE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export interface ProjectContextValue {
  projects: ProjectDescriptor[];
  /** The selected project's name, or null when none is active yet. */
  activeProject: string | null;
  /** Resolved descriptor for `activeProject`, or null when not yet loaded. */
  activeDescriptor: ProjectDescriptor | null;
  /** `"live"` when the API responded; `"stub"` when we fell back to seed data. */
  source: "live" | "stub" | "loading";
  /** Last error encountered while talking to the project-api, if any. */
  error: string | null;
  /** `true` while a list refresh is in flight. */
  refreshing: boolean;
  /** Re-fetch the projects list. Safe to call at any time. */
  refresh(): Promise<void>;
  /** Create a new project (via the API). Returns the descriptor on success. */
  createProject(name: string): Promise<ProjectDescriptor>;
  /** Switch the active project locally and (best-effort) sync to the pod. */
  setActive(name: string | null): Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

/** Lightweight seed so the UI stays usable offline. */
const STUB_PROJECTS: ProjectDescriptor[] = [
  {
    name: "morgan-md-sandbox",
    path: "/workspace/repos/morgan-md-sandbox",
    hasPrd: false,
    remoteUrl: "https://github.com/5dlabs/morgan-md-sandbox",
    updatedAt: null,
    branch: "main",
    lastCommit: null,
  },
];

function normalize(list: ProjectDescriptor[]): ProjectDescriptor[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ProjectDescriptor[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(() =>
    readStoredActive(),
  );
  const [source, setSource] = useState<"live" | "stub" | "loading">("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRefreshing(true);
    try {
      const live = await projectApi.list(ctrl.signal);
      setProjects(normalize(live));
      setSource("live");
      setError(null);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setProjects(normalize(STUB_PROJECTS));
      setSource("stub");
      setError(
        err instanceof ProjectApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      if (!ctrl.signal.aborted) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  // Hydrate active project from the pod once, if the user hasn't chosen one
  // locally yet. Pod-side wins when we have no local preference.
  useEffect(() => {
    if (activeProject) return;
    let cancelled = false;
    void (async () => {
      try {
        const { name } = await projectApi.getActive();
        if (cancelled) return;
        if (name) {
          setActiveProject(name);
          writeStoredActive(name);
        }
      } catch {
        /* offline — fine, we'll rely on local state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProject]);

  const setActive = useCallback(async (name: string | null) => {
    setActiveProject(name);
    writeStoredActive(name);
    // Best-effort sync: we don't fail the UI if the pod isn't reachable.
    try {
      await projectApi.setActive(name);
    } catch {
      /* offline — local state is the source of truth here */
    }
  }, []);

  const createProject = useCallback(
    async (rawName: string): Promise<ProjectDescriptor> => {
      const name = rawName.trim();
      if (!name) throw new Error("project name is required");
      // The API does the heavy lifting (github check + clone/init). We just
      // reflect the resulting descriptor into state and mark it active.
      const res = await projectApi.create({ name });
      setProjects((prev) => {
        const next = prev.filter((p) => p.name !== res.project.name);
        next.push(res.project);
        return normalize(next);
      });
      await setActive(res.project.name);
      return res.project;
    },
    [setActive],
  );

  const activeDescriptor = useMemo(
    () =>
      activeProject
        ? projects.find((p) => p.name === activeProject) ?? null
        : null,
    [projects, activeProject],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      activeProject,
      activeDescriptor,
      source,
      error,
      refreshing,
      refresh,
      createProject,
      setActive,
    }),
    [
      projects,
      activeProject,
      activeDescriptor,
      source,
      error,
      refreshing,
      refresh,
      createProject,
      setActive,
    ],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProjects(): ProjectContextValue {
  const v = useContext(ProjectContext);
  if (!v) {
    throw new Error("useProjects must be used inside <ProjectProvider>");
  }
  return v;
}

/** Read-only accessor that's safe outside the provider (returns null). */
export function useOptionalProjects(): ProjectContextValue | null {
  return useContext(ProjectContext);
}

export { PROJECT_API_BASE_URL };
