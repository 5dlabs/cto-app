const TOOL_SURFACES = [
  {
    name: "MCP registry",
    desc: "Connected MCP servers, permissions, and capability health.",
  },
  {
    name: "Provider bridges",
    desc: "Model/provider endpoints, key routing, and failover policy.",
  },
  {
    name: "Runtime adapters",
    desc: "Shell, browser, and project adapters available to agents.",
  },
];

export function ToolsView() {
  return (
    <div className="section pane--wide">
      <div className="chart-card">
        <div className="section__eyebrow">Agent Platform</div>
        <div className="section__title">Tools</div>
        <div className="section__sub">
          Tooling control plane placeholder for integrations, authorizations, and operational
          status of the agent toolchain.
        </div>
      </div>

      <div className="svc-grid">
        {TOOL_SURFACES.map((surface) => (
          <article className="svc-card" key={surface.name}>
            <div className="svc-card__tag">Tool surface</div>
            <div className="svc-card__title">{surface.name}</div>
            <p className="svc-card__body">{surface.desc}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
