const DESIGN_PRINCIPLES = [
  {
    title: "System-first",
    body: "Ship reusable UI primitives before one-off screens. Every new pattern should land as a documented component.",
  },
  {
    title: "Accessible by default",
    body: "Contrast, focus, keyboard paths, and reduced-motion behavior are required for every surface and variant.",
  },
  {
    title: "Motion with purpose",
    body: "Use animation to explain state changes and hierarchy, never as decoration that slows interaction.",
  },
];

const DESIGN_STREAMS = [
  "Foundation tokens refresh (spacing + type scale)",
  "Sidebar and navigation consistency pass",
  "Component docs in Storybook parity mode",
  "UI QA checklist for release gates",
];

export function DesignView() {
  return (
    <div className="section pane--wide">
      <div className="chart-card" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <div>
          <div className="section__eyebrow">Design Ops</div>
          <div className="section__title">System language and UX consistency</div>
          <div className="section__sub">
            Central workspace for visual direction, interaction patterns, and component standards
            used across Morgan, project views, and operator tools.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span className="chip chip--accent">4 active streams</span>
      </div>

      <div className="svc-category">
        <div className="svc-category__head">
          <div>
            <div className="svc-category__title">Design principles</div>
            <p className="svc-category__sub">
              Shared expectations that keep product and brand decisions aligned.
            </p>
          </div>
        </div>
        <div className="svc-grid">
          {DESIGN_PRINCIPLES.map((item) => (
            <article key={item.title} className="svc-card">
              <div className="svc-card__tag">Principle</div>
              <div className="svc-card__title">{item.title}</div>
              <p className="svc-card__body">{item.body}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="chart-card">
        <div className="section__eyebrow">Current work</div>
        <div className="section__title">Design streams</div>
        <div className="section__sub">
          Upcoming initiatives that impact platform polish and experience quality.
        </div>
        <div className="status-list" style={{ marginTop: 14 }}>
          {DESIGN_STREAMS.map((stream) => (
            <div key={stream} className="status-row">
              <span className="status-row__label">{stream}</span>
              <span className="chip">Active</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
