import { INTEGRATIONS, type IntegrationGroup } from "./data";

function shortMono(name: string) {
  const words = name.split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function IntegrationsView() {
  return (
    <div className="section pane--wide">
      <div className="chart-card" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <div>
          <div className="section__eyebrow">External surfaces</div>
          <div className="section__title">Integrations</div>
          <div className="section__sub">
            Connect the tools your team already uses. Primary integrations get first-class treatment
            — agent activity sync, live status, deep links. Mirrors stay in sync via webhook.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span className="chip chip--accent">
          {INTEGRATIONS.reduce((n, g) => n + g.items.length, 0)} connectors
        </span>
      </div>

      {INTEGRATIONS.map((g) => (
        <Group key={g.name} group={g} />
      ))}
    </div>
  );
}

function Group({ group }: { group: IntegrationGroup }) {
  return (
    <div className="intg-category">
      <div className="svc-category__head">
        <div>
          <div className="svc-category__title">{group.name}</div>
          <p className="svc-category__sub">{group.blurb}</p>
        </div>
      </div>
      <div className="intg-grid">
        {group.items.map((it) => (
          <div
            key={it.name}
            className={`intg-card${it.primary ? " intg-card--primary" : ""}`}
          >
            <div className="intg-card__mono">{shortMono(it.name)}</div>
            <div className="intg-card__name">{it.name}</div>
            <span className="intg-card__state">{it.state ?? "available"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
