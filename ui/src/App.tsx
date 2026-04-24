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
  IconUsers,
  IconPalette,
  IconBracket,
  IconCpu,
  IconTerminal,
} from "./views/icons";
import { MorganView } from "./views/MorganView";
import { ProjectsView } from "./views/ProjectsView";
import { GitLabView } from "./views/GitLabView";
import { ApplicationsView } from "./views/ApplicationsView";
import { MemoryView } from "./views/MemoryView";
import { CostView } from "./views/CostView";
import { QualityView } from "./views/QualityView";
import { InfrastructureView } from "./views/InfrastructureView";
import { IntegrationsView } from "./views/IntegrationsView";
import { SettingsView } from "./views/SettingsView";
import { NewAgentModal } from "./views/NewAgentModal";
import { AgentsView } from "./views/AgentsView";
import { TasksView } from "./views/TasksView";
import { ProjectProvider } from "./state/projectContext";
import { LocalStackBootstrap } from "./components/LocalStackBootstrap";

type NavKey =
  | "morgan"
  | "gitlab"
  | "projects"
  | "agents"
  | "tasks"
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
  { key: "gitlab", label: "GitLab", icon: IconGit },
  { key: "projects", label: "Projects", icon: IconFolder },
  { key: "agents", label: "Agents", icon: IconCpu },
  { key: "tasks", label: "Tasks", icon: IconTerminal },
  { key: "applications", label: "Applications", icon: IconApps },
  { key: "memory", label: "Memory", icon: IconDocs },
  { key: "cost", label: "Cost", icon: IconGraph },
  { key: "quality", label: "Quality", icon: IconBolt },
];

const platformNav: NavItem[] = [
  { key: "infrastructure", label: "Infrastructure", icon: IconBracket },
  { key: "integrations", label: "Integrations", icon: IconPalette },
];

const TITLES: Record<NavKey, { title: string; sub: string }> = {
  morgan: {
    title: "Morgan",
    sub: "Intake, routing, and the always-on studio companion",
  },
  gitlab: {
    title: "GitLab",
    sub: "Parallel registry · 32 projects mirrored — skinned embed (MVP)",
  },
  projects: {
    title: "Projects",
    sub: "Pending · In Progress · Complete — debate runs by default",
  },
  agents: {
    title: "Agents",
    sub: "Roster — harness, CLI, and models per agent · manifests optionally on-chain",
  },
  tasks: {
    title: "Tasks",
    sub: "Open a task to drop into its code-server session — the task CRD's workspace embed",
  },
  applications: {
    title: "Applications",
    sub: "Extension packs — Accounting, Marketing, RMS, Voice",
  },
  memory: {
    title: "Memory",
    sub: "mem0 graph for cross-project, cross-agent housekeeping",
  },
  cost: {
    title: "Cost",
    sub: "LLM spend by provider, project, and agent · Grafana-backed",
  },
  quality: {
    title: "Quality",
    sub: "Per-task tokens, cost, and iterations to acceptance",
  },
  infrastructure: {
    title: "Infrastructure",
    sub: "17 5D services across 9 categories · operator-provisioned",
  },
  integrations: {
    title: "Integrations",
    sub: "External surfaces — PM, Comms, Observability, SCM/CI, Security",
  },
  settings: {
    title: "Settings",
    sub: "Secure API keys · profile · themes · shortcuts",
  },
};

export default function App() {
  const [active, setActive] = useState<NavKey>("morgan");
  const [showNewAgent, setShowNewAgent] = useState(false);

  return (
    <LocalStackBootstrap>
      <ProjectProvider>
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
              <ContentPane active={active} onNewAgent={() => setShowNewAgent(true)} />
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

          <NewAgentModal open={showNewAgent} onClose={() => setShowNewAgent(false)} />
        </div>
      </ProjectProvider>
    </LocalStackBootstrap>
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

// Views that want to fill the entire content pane (no eyebrow / title / sub
// header above them). The embedded GitLab iframe is the obvious one — the
// giant pane header stacked on top of GitLab's own top bar wastes a lot of
// vertical space and made the embed feel buried.
const FULL_BLEED_VIEWS: ReadonlySet<NavKey> = new Set(["gitlab"]);

function ContentPane({
  active,
  onNewAgent,
}: {
  active: NavKey;
  onNewAgent: () => void;
}) {
  const head = TITLES[active];
  const fullBleed = FULL_BLEED_VIEWS.has(active);

  return (
    <div className={`pane pane--wide${fullBleed ? " pane--fullbleed" : ""}`}>
      {!fullBleed && (
        <header className="pane__header">
          <div>
            <div className="pane__eyebrow">5D Platform</div>
            <h1 className="pane__title">{head.title}</h1>
            <p className="pane__sub">{head.sub}</p>
          </div>
          <div className="pane__actions">
            <button className="ghost-btn" type="button">
              <IconUsers size={12} /> Team
            </button>
          </div>
        </header>
      )}

      <section className="pane__body">
        <ViewRouter active={active} onNewAgent={onNewAgent} />
      </section>
    </div>
  );
}

function ViewRouter({
  active,
  onNewAgent,
}: {
  active: NavKey;
  onNewAgent: () => void;
}) {
  // Morgan is special: we always render it, just hide it when another view
  // is active. That way an in-flight voice/text reply (including LemonSlice
  // video + audio playback) keeps streaming when the user flips over to
  // /projects or /tasks and back. Unmounting would tear down the
  // VoiceClient WebRTC peer, the message list, the analyser graph — every
  // bit of state the user legitimately expects to survive a nav.
  //
  // We accept the small idle CPU cost of an offscreen MorganAvatar RAF loop
  // in exchange for the UX win. If that ever shows up in a profile we can
  // pass a `visible` prop and gate the RAF on it.
  return (
    <>
      <div hidden={active !== "morgan"} style={{ height: "100%" }}>
        <MorganView />
      </div>
      {active !== "morgan" ? (
        <OtherViews active={active} onNewAgent={onNewAgent} />
      ) : null}
    </>
  );
}

function OtherViews({
  active,
  onNewAgent,
}: {
  active: NavKey;
  onNewAgent: () => void;
}) {
  switch (active) {
    case "gitlab":
      return <GitLabView />;
    case "projects":
      return <ProjectsView />;
    case "agents":
      return <AgentsView onNewAgent={onNewAgent} />;
    case "tasks":
      return <TasksView />;
    case "applications":
      return <ApplicationsView />;
    case "memory":
      return <MemoryView />;
    case "cost":
      return <CostView />;
    case "quality":
      return <QualityView />;
    case "infrastructure":
      return <InfrastructureView />;
    case "integrations":
      return <IntegrationsView />;
    case "settings":
      return <SettingsView />;
    default:
      return null;
  }
}
