import { useMemo, useRef, useState } from "react";
import {
  IconGit,
  IconRefresh,
  IconSearch,
  IconBell,
  IconExternal,
} from "./icons";

// Embedded GitLab strategy:
//
// The self-hosted GitLab is already configured to cooperate with the embed:
//   - CSP `frame-ancestors` whitelists app.5dlabs.ai, localhost:5173, and
//     tauri://localhost, so the iframe is allowed to load it.
//   - The session cookie is issued `Secure; HttpOnly; SameSite=None`, so the
//     browser attaches it inside a cross-origin iframe.
// That means we just iframe the real origin directly — no dev proxy, no
// header rewriting, no relative_url_root gymnastics.
//
// Personal Access Tokens can't auto-sign-in to the GitLab UI (GitLab PATs are
// API/Git/Registry only). The "no login" experience is therefore: user signs
// in once on gitlab.5dlabs.ai (either in a separate tab or via the Sign in
// popup below) and the SameSite=None cookie is honored for every subsequent
// embed load.
const GITLAB_ORIGIN =
  import.meta.env.VITE_GITLAB_ORIGIN ?? "https://gitlab.5dlabs.ai";
const DEFAULT_PATH = import.meta.env.VITE_GITLAB_DEFAULT_PATH ?? "/5dlabs";

const NAV = [
  { label: "Group", path: DEFAULT_PATH },
  { label: "Projects", path: "/dashboard/projects" },
  { label: "MRs", path: "/dashboard/merge_requests" },
  { label: "Issues", path: "/dashboard/issues" },
] as const;

export function GitLabView() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [path, setPath] = useState<string>(DEFAULT_PATH);

  const src = useMemo(() => `${GITLAB_ORIGIN}${path}`, [path]);
  const externalHref = src;
  const hostLabel = useMemo(() => {
    try {
      return new URL(GITLAB_ORIGIN).host;
    } catch {
      return GITLAB_ORIGIN;
    }
  }, []);

  const reload = () => {
    const el = iframeRef.current;
    if (el) el.src = el.src;
  };

  const openSignIn = () => {
    // Pop GitLab's sign-in directly at the real origin. The session cookie is
    // issued `SameSite=None; Secure` so once it's set here the iframe picks
    // it up on reload.
    const w = window.open(
      `${GITLAB_ORIGIN}/users/sign_in`,
      "gitlab-signin",
      "width=520,height=720,noopener=no",
    );
    if (!w) return;
    const timer = window.setInterval(() => {
      if (w.closed) {
        window.clearInterval(timer);
        reload();
      }
    }, 500);
  };

  return (
    <div className="gitlab-fullbleed">
      <div className="gitlab-fullbleed__bar">
        <IconGit size={12} />
        <span className="gitlab-fullbleed__host">{hostLabel}</span>
        <span className="gitlab-fullbleed__path mono">{path}</span>

        <span className="gitlab-fullbleed__nav">
          {NAV.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`gitlab-fullbleed__chip${path === item.path ? " gitlab-fullbleed__chip--active" : ""}`}
              onClick={() => setPath(item.path)}
            >
              {item.label}
            </button>
          ))}
        </span>

        <span className="gitlab-fullbleed__spacer" />

        <button
          type="button"
          className="gitlab-fullbleed__chip"
          onClick={openSignIn}
          title="Sign in to GitLab (opens a popup, session is shared with the embed)"
        >
          Sign in
        </button>
        <span className="gitlab-fullbleed__divider" />
        <button
          type="button"
          className="gitlab-fullbleed__icon"
          title="Refresh"
          onClick={reload}
        >
          <IconRefresh size={11} />
        </button>
        <button
          type="button"
          className="gitlab-fullbleed__icon"
          title="Search (in-app shortcut: /)"
          onClick={() => setPath("/search")}
        >
          <IconSearch size={11} />
        </button>
        <button
          type="button"
          className="gitlab-fullbleed__icon"
          title="Notifications"
          onClick={() => setPath("/-/user_settings/notifications")}
        >
          <IconBell size={11} />
        </button>
        <a
          className="gitlab-fullbleed__icon"
          href={externalHref}
          target="_blank"
          rel="noreferrer"
          title="Open in new tab"
        >
          <IconExternal size={11} />
        </a>
      </div>

      <iframe
        ref={iframeRef}
        key={src}
        className="gitlab-fullbleed__iframe"
        src={src}
        title="GitLab — 5dlabs"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
