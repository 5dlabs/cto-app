// Shell — titlebar, sidebar, status bar

const Titlebar = ({ tab, motif, chrome }) => {
  return (
    <div className="titlebar">
      <div className="traffic">
        <span className="traffic-dot traffic-close" />
        <span className="traffic-dot traffic-min" />
        <span className="traffic-dot traffic-max" />
      </div>
      <div className="titlebar-center">
        <span className="titlebar-mark">
          <svg className="titlebar-mark-glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M3 3l5 0l5 5l0 5l-5 0l-5 -5z" />
            <path d="M8 3l0 5l5 0" opacity="0.45" />
          </svg>
          CTO
        </span>
        <span className="titlebar-sep" />
        <span className="titlebar-crumb">
          5dlabs · <strong>{tab.label}</strong>
        </span>
      </div>
      <div className="titlebar-right">
        <button className="titlebar-btn" title="Search">
          <IconSearch size={14} />
        </button>
        <button className="titlebar-btn" title="Command">
          <IconCommand size={14} />
        </button>
        <button className="titlebar-btn" title="Notifications">
          <IconBell size={14} />
        </button>
      </div>
    </div>
  );
};

const SIDEBAR_ITEMS = [
  { id: "prds", label: "PRDs", icon: IconDocs, badge: 12 },
  { id: "tasks", label: "Tasks", icon: IconTerminal, badge: 4 },
  { id: "apps", label: "Applications", icon: IconApps, badge: null },
  { id: "infra", label: "Infrastructure", icon: IconBolt, badge: null },
  { id: "design", label: "Design", icon: IconPalette, badge: null },
  { id: "memory", label: "Memory", icon: IconGraph, badge: null },
  { id: "agents", label: "Agents", icon: IconUsers, badge: 8 },
];

const Sidebar = ({ active, onSelect }) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <button
          className={`morgan-card ${active === "morgan" ? "is-active" : ""}`}
          onClick={() => onSelect("morgan")}
          style={{ border: "none", width: "calc(100% - 8px)", textAlign: "left" }}
        >
          <div className="morgan-row">
            <div className="morgan-avatar">M</div>
            <div className="morgan-meta">
              <div className="morgan-name">Morgan</div>
              <div className="morgan-role">Project Manager · Live</div>
            </div>
          </div>
          <div className="morgan-cta">
            <span className="morgan-pill"><IconVideo size={12} /> Video</span>
            <span className="morgan-pill"><IconMic size={12} /> Voice</span>
            <span className="morgan-pill"><IconChat size={12} /> Chat</span>
          </div>
        </button>

        <div className="nav-section">
          <div className="nav-section-label">
            <span>Workspace</span>
            <IconPlus size={12} style={{ color: "var(--fg-faint)", cursor: "pointer" }} />
          </div>
          {SIDEBAR_ITEMS.map((it) => (
            <button
              key={it.id}
              className={`nav-item ${active === it.id ? "is-active" : ""}`}
              onClick={() => onSelect(it.id)}
            >
              <it.icon size={16} />
              <span className="nav-label">{it.label}</span>
              {it.badge != null && <span className="nav-badge">{it.badge}</span>}
            </button>
          ))}
        </div>

        <div className="nav-section">
          <div className="nav-section-label">
            <span>Pinned</span>
          </div>
          <button className="nav-item">
            <IconFolder size={16} />
            <span className="nav-label">conduit</span>
          </button>
          <button className="nav-item">
            <IconFolder size={16} />
            <span className="nav-label">cto-pay</span>
          </button>
          <button className="nav-item">
            <IconFolder size={16} />
            <span className="nav-label">openclaw</span>
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-section-label"><span>System</span></div>
          <button
            className={`nav-item ${active === "settings" ? "is-active" : ""}`}
            onClick={() => onSelect("settings")}
          >
            <IconSettings size={16} />
            <span className="nav-label">Settings</span>
          </button>
        </div>
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-footer-avatar">JF</div>
        <div className="sidebar-footer-info">
          <div className="sidebar-footer-name">Jonathon F.</div>
          <div className="sidebar-footer-org">5dlabs / admin</div>
        </div>
        <IconSettings size={14} style={{ color: "var(--fg-muted)", cursor: "pointer" }} />
      </div>
    </aside>
  );
};

const StatusBar = ({ tab, motif }) => (
  <div className="statusbar">
    <span className="statusbar-item">
      <span className="statusbar-dot" /> Cluster healthy
    </span>
    <span className="statusbar-item" style={{ fontFamily: "var(--font-mono)" }}>
      talos-prod · 17 nodes
    </span>
    <span className="statusbar-item">
      <span className="statusbar-dot warn" /> 2 deploy warnings
    </span>
    <span className="statusbar-spacer" />
    <span className="statusbar-item" style={{ fontFamily: "var(--font-mono)" }}>
      openclaw v0.9.2
    </span>
    <span className="statusbar-item" style={{ fontFamily: "var(--font-mono)" }}>
      motif · {motif}
    </span>
    <span className="statusbar-item">
      <span className="kbd-row">
        <span className="kbd">⌘</span><span className="kbd">K</span>
      </span>
    </span>
  </div>
);

Object.assign(window, { Titlebar, Sidebar, StatusBar, SIDEBAR_ITEMS });
