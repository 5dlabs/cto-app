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
  type PrdStatus,
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
  /**
   * Ensure the project is cloned onto the Morgan PVC. Idempotent. Required
   * before routing into the code-server workspace for a remote-only entry.
   */
  verifyProject(name: string): Promise<ProjectDescriptor>;
  /** Switch the active project locally and (best-effort) sync to the pod. */
  setActive(name: string | null): Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

/** Lightweight seed so the UI stays usable offline. */
const STUB_PROJECTS: ProjectDescriptor[] = [];

function normalize(list: ProjectDescriptor[]): ProjectDescriptor[] {
  return [...list]
    .map((p) => ({
      ...p,
      // Defensive defaults so an older sidecar (missing state / hasArchitecture)
      // still renders as a drafting tile rather than crashing the board.
      hasArchitecture: p.hasArchitecture ?? false,
      state: (p.state ?? "drafting") as PrdStatus,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  // Guard so the one-shot "hydrate active project from pod" effect doesn't
  // re-run whenever activeProject changes (e.g. when reconciliation below
  // clears a stale name — otherwise we'd immediately restore it from the
  // pod and loop forever).
  const hydratedRef = useRef(false);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRefreshing(true);
    try {
      const live = await projectApi.refresh(ctrl.signal);
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

  // Cheap poll variant: hits the cached endpoint, never force-refreshes.
  // Used by the background 20s tick; the manual refresh button still calls
  // refresh() above, which bypasses the cache.
  const pollCached = useCallback(async () => {
    try {
      const live = await projectApi.list();
      setProjects(normalize(live));
      setSource("live");
      setError(null);
    } catch {
      /* swallow — the next refresh() will surface real errors */
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  // Background poll so Morgan-authored PRDs surface without the user hitting
  // Refresh. IMPORTANT: this uses the CACHED list endpoint (no force=1). The
  // sidecar caches /projects for 10 minutes and fans out to ~80 GitHub API
  // calls on every miss — polling with force=1 burns the PAT's rate limit
  // in minutes. `invalidateListCache()` fires on create/writePrd server-side,
  // so a Morgan-authored PRD surfaces on the next poll tick anyway.
  useEffect(() => {
    const id = window.setInterval(() => {
      void pollCached();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [pollCached]);

  // Hydrate active project from the pod ONCE on first mount when the user
  // hasn't picked one locally. The hydratedRef guard is load-bearing —
  // otherwise this re-fires every time reconciliation (below) clears a
  // stale name and the pod's stale value gets re-hydrated in a loop.
  useEffect(() => {
    if (hydratedRef.current) return;
    if (activeProject) {
      hydratedRef.current = true;
      return;
    }
    hydratedRef.current = true;
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

  // Reconcile a stale activeProject against the live list. When the user's
  // localStorage points at a project the sidecar no longer knows about
  // (renamed, archived, wrong org, …), the ProjectContextPanel header used
  // to show a ghost entry and the create-flow defaulted to a name that
  // didn't exist. Clear it so the UI falls back to "No project active" and
  // the user picks again.
  //
  // Guards:
  // - source==="live" so we don't nuke the selection on a transient stub list.
  // - projects.length > 0 so we don't nuke it when GitHub probes failed
  //   silently (rate limit, outage) and the sidecar returned an empty array.
  //   You can only trust "X is gone" when you can see OTHER projects.
  useEffect(() => {
    if (source !== "live") return;
    if (!activeProject) return;
    if (projects.length === 0) return;
    const stillExists = projects.some((p) => p.name === activeProject);
    if (stillExists) return;
    setActiveProject(null);
    writeStoredActive(null);
    // Best-effort tell the pod too, so the next code-server launch starts clean.
    void projectApi.setActive(null).catch(() => {});
  }, [source, activeProject, projects]);

  const setActive = useCallback(async (name: string | null) => {
    setActiveProject(name);
    writeStoredActive(name);
    // Best-effort sync: we don't fail the UI if the pod isn't reachable.
    // The backend auto-clones if the repo is remote-only.
    try {
      await projectApi.setActive(name);
    } catch {
      /* offline — local state is the source of truth here */
    }
  }, []);

  const verifyProjectCb = useCallback(
    async (name: string): Promise<ProjectDescriptor> => {
      const descriptor = await projectApi.verify(name);
      setProjects((prev) => {
        const next = prev.filter((p) => p.name !== descriptor.name);
        next.push(descriptor);
        return normalize(next);
      });
      return descriptor;
    },
    [],
  );

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
      verifyProject: verifyProjectCb,
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
      verifyProjectCb,
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
