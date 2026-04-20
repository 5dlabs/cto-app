import { useState } from "react";
import {
  IconGit,
  IconFolder,
  IconUsers,
  IconBracket,
  IconBell,
  IconSearch,
  IconExternal,
  IconRefresh,
  IconFilter,
} from "./icons";

interface Repo {
  name: string;
  group: string;
  branch: string;
  updated: string;
  pipeline: "passed" | "running" | "failed";
  mrs: number;
}

const REPOS: Repo[] = [
  {
    name: "conduit",
    group: "5dlabs",
    branch: "main",
    updated: "3m",
    pipeline: "passed",
    mrs: 4,
  },
  {
    name: "cto-pay",
    group: "5dlabs",
    branch: "release/0.4",
    updated: "12m",
    pipeline: "running",
    mrs: 2,
  },
  {
    name: "openclaw",
    group: "5dlabs",
    branch: "main",
    updated: "41m",
    pipeline: "passed",
    mrs: 7,
  },
  {
    name: "hermes",
    group: "5dlabs",
    branch: "scaffold",
    updated: "2h",
    pipeline: "passed",
    mrs: 1,
  },
  {
    name: "cto-observe",
    group: "5dlabs",
    branch: "main",
    updated: "6h",
    pipeline: "passed",
    mrs: 0,
  },
  {
    name: "sigma-1",
    group: "5dlabs",
    branch: "rms",
    updated: "8h",
    pipeline: "failed",
    mrs: 3,
  },
];

const NAV_GROUPS: { label: string; items: { name: string; active?: boolean; count?: number }[] }[] = [
  {
    label: "Personal",
    items: [
      { name: "Projects", active: true, count: 32 },
      { name: "Groups", count: 4 },
      { name: "Milestones" },
      { name: "Snippets" },
    ],
  },
  {
    label: "Analyze",
    items: [{ name: "Activity" }, { name: "Contribution" }, { name: "Dashboard" }],
  },
  {
    label: "Admin",
    items: [{ name: "Runners" }, { name: "Integrations" }, { name: "Webhooks" }],
  },
];

export function GitLabView() {
  const [filter, setFilter] = useState("");
  const rows = REPOS.filter((r) =>
    (r.name + r.group + r.branch).toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="section">
      <div className="chart-card" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <div>
          <div className="section__eyebrow">MVP integration</div>
          <div className="section__title">GitLab — skinned to 5D</div>
          <div className="section__sub">
            Embedded the real GitLab interface behind a visual skin that matches this console. Long
            term we conditionally render GitHub or GitLab per user setting.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span className="chip chip--success">mirror · 32 projects</span>
        <button type="button" className="ghost-btn">
          <IconRefresh size={12} /> Re-sync
        </button>
        <button type="button" className="ghost-btn">
          <IconExternal size={12} /> Open in browser
        </button>
      </div>

      <div className="gitlab-embed">
        <div className="gitlab-embed__bar">
          <IconGit size={14} /> gitlab.5dlabs.ai
          <span style={{ opacity: 0.5 }}> · /5dlabs</span>
          <span style={{ flex: 1 }} />
          <IconSearch size={12} />
          <IconBell size={12} />
          <span className="mono" style={{ opacity: 0.6 }}>
            u/jonathon
          </span>
        </div>
        <div className="gitlab-embed__stage">
          <div className="gitlab-embed__nav">
            {NAV_GROUPS.map((g) => (
              <div key={g.label} style={{ display: "contents" }}>
                <div className="gitlab-embed__nav-header">{g.label}</div>
                {g.items.map((it) => (
                  <div
                    key={it.name}
                    className={`gitlab-embed__nav-item${it.active ? " gitlab-embed__nav-item--active" : ""}`}
                  >
                    <IconFolder size={13} />
                    <span>{it.name}</span>
                    {it.count ? (
                      <span
                        style={{
                          marginLeft: "auto",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                          opacity: 0.6,
                        }}
                      >
                        {it.count}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="gitlab-embed__main">
            <div
              className="row"
              style={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <div>
                <div className="section__eyebrow">Your projects</div>
                <div className="section__title" style={{ color: "var(--fg-primary)" }}>
                  32 mirrored · 6 active
                </div>
              </div>
              <div className="row">
                <input
                  className="field__input"
                  placeholder="Filter projects…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  style={{ width: 220 }}
                />
                <button type="button" className="ghost-btn">
                  <IconFilter size={12} /> Filter
                </button>
              </div>
            </div>

            {rows.map((r) => (
              <div key={r.name} className="gl-row">
                <div>
                  <div style={{ color: "var(--fg-primary)", fontWeight: 500 }}>
                    {r.group}/{r.name}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    branch <span className="mono">{r.branch}</span> · updated {r.updated} ago
                  </div>
                </div>
                <span
                  className={`chip chip--${r.pipeline === "passed" ? "success" : r.pipeline === "failed" ? "danger" : "warn"}`}
                >
                  pipeline · {r.pipeline}
                </span>
                <span className="chip">
                  <IconBracket size={10} /> MRs · {r.mrs}
                </span>
                <button type="button" className="ghost-btn">
                  <IconUsers size={12} /> Open
                </button>
              </div>
            ))}

            {rows.length === 0 ? (
              <div className="tiny muted" style={{ padding: "18px 0" }}>
                No projects match "{filter}".
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
