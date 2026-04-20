import { useState } from "react";
import {
  IconHome,
  IconGit,
  IconFolder,
  IconApps,
  IconDocs,
  IconGraph,
  IconSparkles,
  IconSettings,
  IconBolt,
  IconSearch,
  IconCommand,
  IconBell,
  IconPlus,
  IconUsers,
  IconPalette,
  IconBracket,
} from "./views/icons";

type NavKey =
  | "morgan"
  | "gitlab"
  | "projects"
  | "applications"
  | "memory"
  | "cost"
  | "quality"
  | "infrastructure"
  | "integrations"
  | "settings";

interface NavItem {
  key: NavKey;
  label: string;
  icon: (p: { size?: number }) => JSX.Element;
  badge?: string;
}

const primaryNav: NavItem[] = [
  { key: "morgan", label: "Morgan", icon: IconSparkles },
  { key: "gitlab", label: "GitLab", icon: IconGit, badge: "sync" },
  { key: "projects", label: "Projects", icon: IconFolder },
  { key: "applications", label: "Applications", icon: IconApps },
  { key: "memory", label: "Memory", icon: IconDocs },
  { key: "cost", label: "Cost", icon: IconGraph },
  { key: "quality", label: "Quality", icon: IconBolt },
];

const platformNav: NavItem[] = [
  { key: "infrastructure", label: "Infrastructure", icon: IconBracket },
  { key: "integrations", label: "Integrations", icon: IconPalette },
];

export default function App() {
  const [active, setActive] = useState<NavKey>("morgan");

  return (
    <div className="app-shell" data-motif="cyan" data-claw="angle" data-chrome="plain">
      <header className="titlebar">
        <div className="titlebar__brand">
          <IconHome size={14} />
          <span>5D Platform</span>
        </div>
        <div className="titlebar__search">
          <IconSearch size={12} />
          <span>Search agents, sessions, docs…</span>
          <kbd>
            <IconCommand size={10} /> K
          </kbd>
        </div>
        <div className="titlebar__actions">
          <button className="ghost-btn" type="button" aria-label="Notifications">
            <IconBell size={14} />
          </button>
          <button className="primary-btn" type="button">
            <IconPlus size={12} /> New agent
          </button>
        </div>
      </header>

      <div className="shell-body">
        <nav className="sidebar" aria-label="Primary">
          <div className="sidebar__group">
            {primaryNav.map((item) => (
              <NavButton
                key={item.key}
                item={item}
                active={active === item.key}
                onClick={() => setActive(item.key)}
              />
            ))}
          </div>

          <div className="sidebar__group">
            <div className="sidebar__label">Platform</div>
            {platformNav.map((item) => (
              <NavButton
                key={item.key}
                item={item}
                active={active === item.key}
                onClick={() => setActive(item.key)}
              />
            ))}
          </div>

          <div className="sidebar__spacer" />

          <div className="sidebar__group">
            <NavButton
              item={{ key: "settings", label: "Settings", icon: IconSettings }}
              active={active === "settings"}
              onClick={() => setActive("settings")}
            />
          </div>
        </nav>

        <main className="content">
          <ContentPane active={active} />
        </main>
      </div>

      <footer className="statusbar">
        <span className="statusbar__dot" aria-hidden />
        <span>Connected · gitlab.5dlabs.ai</span>
        <span className="statusbar__sep">·</span>
        <span>32 projects mirrored</span>
        <span className="statusbar__spacer" />
        <span>v0.1.0 · dev</span>
      </footer>
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`nav-btn${active ? " nav-btn--active" : ""}`}
      onClick={onClick}
    >
      <Icon size={14} />
      <span>{item.label}</span>
      {item.badge && <span className="nav-btn__badge">{item.badge}</span>}
    </button>
  );
}

function ContentPane({ active }: { active: NavKey }) {
  const titles: Record<NavKey, string> = {
    morgan: "Morgan",
    gitlab: "GitLab",
    projects: "Projects",
    applications: "Applications",
    memory: "Memory",
    cost: "Cost",
    quality: "Quality",
    infrastructure: "Infrastructure",
    integrations: "Integrations",
    settings: "Settings",
  };

  const subtitles: Record<NavKey, string> = {
    morgan: "Intake & PRD processing agent",
    gitlab: "Parallel registry · 32 projects mirrored",
    projects: "Kanban across swarms",
    applications: "Deployed via ArgoCD",
    memory: "HSG contextual + temporal facts",
    cost: "Token spend and compute",
    quality: "Test coverage, lint, security",
    infrastructure: "17 platform services",
    integrations: "External API surfaces",
    settings: "Profile · themes · shortcuts",
  };

  return (
    <div className="pane">
      <header className="pane__header">
        <div>
          <div className="pane__eyebrow">5D Platform</div>
          <h1 className="pane__title">{titles[active]}</h1>
          <p className="pane__sub">{subtitles[active]}</p>
        </div>
        <div className="pane__actions">
          <button className="ghost-btn" type="button">
            <IconUsers size={12} /> Team
          </button>
          <button className="primary-btn" type="button">
            <IconSparkles size={12} /> Open
          </button>
        </div>
      </header>

      <section className="pane__body">
        <div className="card">
          <div className="card__eyebrow">Status</div>
          <div className="card__title">Ready</div>
          <p className="card__body">
            This surface is scaffolded. Content ports from the staged design
            drop will land here next.
          </p>
        </div>
        <div className="card">
          <div className="card__eyebrow">Source</div>
          <div className="card__title">.task/.docs/design</div>
          <p className="card__body">
            Canonical spec + prompts live in the design drop. Views ported
            incrementally from .jsx → .tsx.
          </p>
        </div>
        <div className="card">
          <div className="card__eyebrow">Next</div>
          <div className="card__title">Full IA</div>
          <p className="card__body">
            Infrastructure (17 cards), Projects kanban, GitLab sync board,
            and Morgan console are on deck.
          </p>
        </div>
      </section>
    </div>
  );
}
