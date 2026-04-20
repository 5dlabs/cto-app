import { IconExternal, IconGraph, IconRefresh } from "./icons";

const PROVIDERS = [
  { name: "Anthropic", tokens: "2.4M", cost: 214.12, share: 0.62 },
  { name: "OpenAI", tokens: "1.1M", cost: 96.4, share: 0.28 },
  { name: "Google", tokens: "280K", cost: 22.1, share: 0.06 },
  { name: "xAI", tokens: "120K", cost: 9.8, share: 0.03 },
  { name: "Local (vLLM)", tokens: "4.7M", cost: 3.2, share: 0.01 },
];

const PROJECTS = [
  { name: "cto-pay", cost: 108.2, share: 0.31 },
  { name: "conduit", cost: 94.1, share: 0.27 },
  { name: "sigma-1/rms", cost: 68.9, share: 0.2 },
  { name: "openclaw", cost: 44.6, share: 0.13 },
  { name: "merkle-voice", cost: 30.0, share: 0.09 },
];

const AGENTS = [
  { name: "Morgan", cost: 62.4, share: 0.18 },
  { name: "Angie", cost: 55.2, share: 0.16 },
  { name: "Blaze", cost: 48.3, share: 0.14 },
  { name: "Cipher", cost: 44.0, share: 0.13 },
  { name: "Atlas", cost: 37.1, share: 0.11 },
  { name: "Vega", cost: 28.9, share: 0.08 },
  { name: "Nova", cost: 24.6, share: 0.07 },
];

function Trend({ down }: { down?: boolean }) {
  const points = Array.from({ length: 14 }).map((_, i) => {
    const baseline = down ? 70 - i * 2 : 40 + i * 3;
    const jitter = Math.sin(i * 1.3) * 6;
    return `${(i / 13) * 100},${Math.max(10, Math.min(90, baseline + jitter))}`;
  });
  return (
    <svg className="chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="var(--accent-09)"
        strokeWidth={1.4}
      />
      <polyline
        points={`0,100 ${points.join(" ")} 100,100`}
        fill="var(--accent-softer)"
        stroke="none"
      />
    </svg>
  );
}

export function CostView() {
  return (
    <div className="section">
      <div className="chart-card" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <div>
          <div className="section__eyebrow">Cost · Grafana-backed</div>
          <div className="section__title">LLM + compute spend</div>
          <div className="section__sub">
            Token and spend metrics sourced from 5D OBSERVE. Pre-wired dashboards per provider,
            project, and agent — deep-link to Grafana for custom panels.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="ghost-btn">
          <IconRefresh size={12} /> Refresh
        </button>
        <button type="button" className="ghost-btn">
          <IconExternal size={12} /> Open in Grafana
        </button>
      </div>

      <div className="chart-row">
        <div className="chart-card">
          <div className="chart-label">Total tokens · 7d</div>
          <div className="chart-number">8.6M</div>
          <div className="chart-delta">+14.2%</div>
          <Trend />
        </div>
        <div className="chart-card">
          <div className="chart-label">Input / Output</div>
          <div className="chart-number">5.2M / 3.4M</div>
          <div className="chart-delta">+9.1% in · +22.4% out</div>
          <Trend />
        </div>
        <div className="chart-card">
          <div className="chart-label">Total spend · 7d</div>
          <div className="chart-number">$345.62</div>
          <div className="chart-delta chart-delta--down">−3.1% wk/wk</div>
          <Trend down />
        </div>
        <div className="chart-card">
          <div className="chart-label">Compute · GPU hr</div>
          <div className="chart-number">284h</div>
          <div className="chart-delta">+4 h/day</div>
          <Trend />
        </div>
      </div>

      <div className="chart-row">
        <BreakdownCard title="By provider" rows={PROVIDERS.map((p) => ({ name: p.name, value: `$${p.cost.toFixed(2)}`, share: p.share, meta: `${p.tokens} tokens` }))} />
        <BreakdownCard title="By project" rows={PROJECTS.map((p) => ({ name: p.name, value: `$${p.cost.toFixed(2)}`, share: p.share }))} />
        <BreakdownCard title="By agent" rows={AGENTS.map((a) => ({ name: a.name, value: `$${a.cost.toFixed(2)}`, share: a.share }))} />
      </div>

      <div className="chart-card">
        <div className="section__head">
          <div>
            <div className="section__eyebrow">Trend · 24h granularity</div>
            <div className="section__title">Input vs output token mix</div>
          </div>
          <span className="chip chip--accent">
            <IconGraph size={10} /> rolling 30d
          </span>
        </div>
        <Trend />
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; value: string; share: number; meta?: string }[];
}) {
  return (
    <div className="chart-card">
      <div className="section__head">
        <div>
          <div className="chart-label">{title}</div>
        </div>
      </div>
      {rows.map((r) => (
        <div className="bar-row" key={r.name}>
          <span className="bar-row__label">
            {r.name}
            {r.meta ? <span className="tiny muted" style={{ marginLeft: 6 }}>{r.meta}</span> : null}
          </span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.round(r.share * 100)}%` }} />
          </div>
          <span className="bar-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
