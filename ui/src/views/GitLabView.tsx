import { useMemo, useRef, useState } from "react";
import { IconGit, IconRefresh, IconSearch, IconBell } from "./icons";

const GITLAB_URL = "https://gitlab.5dlabs.ai";
const DEFAULT_PATH = "/5dlabs";

export function GitLabView() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [path, setPath] = useState(DEFAULT_PATH);

  const src = useMemo(() => `${GITLAB_URL}${path}`, [path]);

  const reload = () => {
    const el = iframeRef.current;
    if (el) el.src = el.src;
  };

  return (
    <div className="gitlab-fullbleed">
      <div className="gitlab-fullbleed__bar">
        <IconGit size={14} />
        <span className="gitlab-fullbleed__host">gitlab.5dlabs.ai</span>
        <span className="gitlab-fullbleed__path mono">{path}</span>
        <span className="gitlab-fullbleed__spacer" />
        <button
          type="button"
          className={`gitlab-fullbleed__chip${path === DEFAULT_PATH ? " gitlab-fullbleed__chip--active" : ""}`}
          onClick={() => setPath(DEFAULT_PATH)}
        >
          Group
        </button>
        <button
          type="button"
          className={`gitlab-fullbleed__chip${path === "/dashboard/projects" ? " gitlab-fullbleed__chip--active" : ""}`}
          onClick={() => setPath("/dashboard/projects")}
        >
          Projects
        </button>
        <button
          type="button"
          className={`gitlab-fullbleed__chip${path === "/dashboard/merge_requests" ? " gitlab-fullbleed__chip--active" : ""}`}
          onClick={() => setPath("/dashboard/merge_requests")}
        >
          MRs
        </button>
        <button
          type="button"
          className={`gitlab-fullbleed__chip${path === "/dashboard/issues" ? " gitlab-fullbleed__chip--active" : ""}`}
          onClick={() => setPath("/dashboard/issues")}
        >
          Issues
        </button>
        <span className="gitlab-fullbleed__divider" />
        <button
          type="button"
          className="gitlab-fullbleed__icon"
          title="Refresh"
          onClick={reload}
        >
          <IconRefresh size={12} />
        </button>
        <button
          type="button"
          className="gitlab-fullbleed__icon"
          title="Search (in-app shortcut: /)"
          onClick={() => setPath("/search")}
        >
          <IconSearch size={12} />
        </button>
        <button
          type="button"
          className="gitlab-fullbleed__icon"
          title="Notifications"
          onClick={() => setPath("/-/user_settings/notifications")}
        >
          <IconBell size={12} />
        </button>
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
