/**
 * Typed client for the Morgan pod's `project-api` service.
 *
 * The service is a small HTTP sidecar that runs next to Morgan on the
 * OpenClaw pod. It exposes the filesystem under `/workspace/repos/`, talks to
 * GitHub on Morgan's behalf (clone vs. init), and persists an "active project"
 * pointer that the agent reads to set its working directory.
 *
 * Base URL precedence:
 *   1. `VITE_PROJECT_API_URL` build-time env,
 *   2. `window.__PROJECT_API_URL__` (lets Tauri / runtime override),
 *   3. `http://localhost:8080/morgan/project-api` (desktop local ingress).
 *
 * All calls are resilient — the UI falls back to static demo data when the
 * endpoint is unreachable so the shell stays usable without the backend.
 */

/**
 * Workflow state derived from `.prd/PRD.md` YAML frontmatter `status:`.
 * `"drafting"` — PRD exists but not yet signed off by Morgan + user.
 * `"ready"` — PRD is frozen, intake is eligible to run (architecture.md
 * is tracked separately via `hasArchitecture`). The sidecar defaults to
 * `"drafting"` whenever a PRD is present but the field is missing or
 * unrecognized — tiles never silently disappear.
 */
export type PrdStatus = "drafting" | "ready";

/**
 * Lifecycle phase reported by the sidecar from `.plan/status.txt`.
 * Vocabulary: `new → intake → ready → implementing → complete`. The UI
 * renders this as a colored chip on the project card; when the field is
 * absent (older sidecars) the chip is hidden and nothing else changes.
 */
export interface ProjectStatus {
  phase: string;
  updated: string | null;
}

export interface ProjectDescriptor {
  name: string;
  /** Absolute path on the Morgan PVC, e.g. `/workspace/repos/foo`. */
  path: string;
  /** True when `.prd/PRD.md` exists (on GitHub default branch for remote-only listings, or on disk for cloned). */
  hasPrd: boolean;
  /**
   * True when `.prd/architecture.md` is also present — required alongside
   * `state === "ready"` for the "ready for intake" tile CTA.
   */
  hasArchitecture: boolean;
  /** Workflow state, see `PrdStatus`. */
  state: PrdStatus;
  /** Git remote URL, if one is configured. */
  remoteUrl: string | null;
  /** ISO timestamp of the most recent commit or directory mtime. */
  updatedAt: string | null;
  /** Current HEAD branch, when resolvable. */
  branch: string | null;
  /** Short commit subject of HEAD, if any. */
  lastCommit: string | null;
  /**
   * `"cloned"` — repo is present on the Morgan PVC, `"remote-only"` — known
   * to GitHub but not yet materialized locally. Tile click should call
   * `/verify` before opening code-server when `remote-only`.
   */
  locality?: "cloned" | "remote-only";
  /**
   * Lifecycle phase sourced from `.plan/status.txt` on the sidecar.
   * Optional — older sidecars won't populate it and the UI hides the
   * phase chip in that case.
   */
  status?: ProjectStatus | null;
}

export interface ActiveProject {
  name: string | null;
}

export interface CreateProjectRequest {
  name: string;
  /**
   * Optional — reserved for future per-call overrides. Today the service
   * reads `GITHUB_ORG` from env (defaults to `5dlabs`).
   */
  org?: string;
}

export interface CreateProjectResponse {
  project: ProjectDescriptor;
  /**
   * `"cloned"` when the repo existed, `"created"` when we created it on GitHub
   * and cloned it, `"initialized"` when we fell back to a local-only git init.
   */
  mode: "cloned" | "created" | "initialized";
}

export interface WritePrdRequest {
  content: string;
}

export interface WritePrdResponse {
  project: string;
  path: string;
  bytesWritten: number;
}

export type WriteArchitectureRequest = WritePrdRequest;
export type WriteArchitectureResponse = WritePrdResponse;

export class ProjectApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProjectApiError";
  }
}

function resolveBaseUrl(): string {
  try {
    const fromEnv =
      (typeof import.meta !== "undefined" &&
        (import.meta as unknown as { env?: { VITE_PROJECT_API_URL?: string } }).env
          ?.VITE_PROJECT_API_URL) ||
      "";
    if (fromEnv) return fromEnv.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  try {
    const fromWindow = (window as unknown as { __PROJECT_API_URL__?: string })
      .__PROJECT_API_URL__;
    if (fromWindow) return fromWindow.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return "http://localhost:8080/morgan/project-api";
}

export const PROJECT_API_BASE_URL = resolveBaseUrl();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

async function request<T>(
  path: string,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<T> {
  const url = `${PROJECT_API_BASE_URL}${path}`;
  const method = (init?.method || "GET").toUpperCase();
  const retryable = method === "GET";
  const maxAttempts = retryable ? 3 : 1;
  let lastNetworkErr: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(init?.headers || {}),
        },
      });
    } catch (err) {
      lastNetworkErr = err;
      if (
        retryable &&
        attempt < maxAttempts - 1 &&
        !(init?.signal?.aborted ?? false)
      ) {
        await sleep(180 * 2 ** attempt);
        continue;
      }
      throw new ProjectApiError(
        `project-api unreachable at ${PROJECT_API_BASE_URL}`,
        undefined,
        err,
      );
    }

    if (res.ok) {
      if (res.status === 204) return undefined as unknown as T;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) return undefined as unknown as T;
      return (await res.json()) as T;
    }

    if (
      retryable &&
      shouldRetryStatus(res.status) &&
      attempt < maxAttempts - 1 &&
      !(init?.signal?.aborted ?? false)
    ) {
      await sleep(180 * 2 ** attempt);
      continue;
    }

    const detail = await res.text().catch(() => "");
    throw new ProjectApiError(
      `project-api ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 240)}` : ""}`,
      res.status,
    );
  }

  throw new ProjectApiError(
    `project-api unreachable at ${PROJECT_API_BASE_URL}`,
    undefined,
    lastNetworkErr,
  );
}

export const projectApi = {
  base: PROJECT_API_BASE_URL,

  async health(signal?: AbortSignal): Promise<boolean> {
    try {
      await request<unknown>("/health", { signal });
      return true;
    } catch {
      return false;
    }
  },

  list(signal?: AbortSignal): Promise<ProjectDescriptor[]> {
    return request<ProjectDescriptor[]>("/projects", { signal });
  },

  refresh(signal?: AbortSignal): Promise<ProjectDescriptor[]> {
    return request<ProjectDescriptor[]>("/projects?refresh=1", { signal });
  },

  verify(name: string, signal?: AbortSignal): Promise<ProjectDescriptor> {
    return request<ProjectDescriptor>(
      `/projects/${encodeURIComponent(name)}/verify`,
      { method: "POST", signal },
    );
  },

  get(name: string, signal?: AbortSignal): Promise<ProjectDescriptor> {
    return request<ProjectDescriptor>(
      `/projects/${encodeURIComponent(name)}`,
      { signal },
    );
  },

  create(
    body: CreateProjectRequest,
    signal?: AbortSignal,
  ): Promise<CreateProjectResponse> {
    return request<CreateProjectResponse>("/projects", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    });
  },

  getActive(signal?: AbortSignal): Promise<ActiveProject> {
    return request<ActiveProject>("/projects/active", { signal });
  },

  setActive(name: string | null, signal?: AbortSignal): Promise<ActiveProject> {
    return request<ActiveProject>("/projects/active", {
      method: "POST",
      body: JSON.stringify({ name }),
      signal,
    });
  },

  writePrd(
    name: string,
    body: WritePrdRequest,
    signal?: AbortSignal,
  ): Promise<WritePrdResponse> {
    return request<WritePrdResponse>(
      `/projects/${encodeURIComponent(name)}/prd`,
      {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      },
    );
  },

  writeArchitecture(
    name: string,
    body: WriteArchitectureRequest,
    signal?: AbortSignal,
  ): Promise<WriteArchitectureResponse> {
    return request<WriteArchitectureResponse>(
      `/projects/${encodeURIComponent(name)}/architecture`,
      {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      },
    );
  },

  markReady(name: string, signal?: AbortSignal): Promise<ProjectDescriptor> {
    return request<ProjectDescriptor>(
      `/projects/${encodeURIComponent(name)}/mark-ready`,
      { method: "POST", signal },
    );
  },
};
