import { IconBolt, IconCheck, IconExternal, IconRefresh } from "./icons";

interface TaskMetric {
  id: string;
  title: string;
  agent: string;
  project: string;
  tokens: number;
  cost: number;
  iterations: number;
  acceptance: "passed" | "flaky" | "failed";
}

const TASKS: TaskMetric[] = [
  {
    id: "T-931",
    title: "Fix flaky settle tests",
    agent: "Angie",
    project: "cto-pay",
    tokens: 48_420,
    cost: 3.81,
    iterations: 2,
    acceptance: "passed",
  },
  {
    id: "T-928",
    title: "Operator registration",
    agent: "Blaze",
    project: "conduit",
    tokens: 112_800,
    cost: 8.64,
    iterations: 4,
    acceptance: "passed",
  },
  {
    id: "T-924",
    title: "Typed-data schema",
    agent: "Blaze",
    project: "conduit",
    tokens: 64_210,
    cost: 4.22,
    iterations: 1,
    acceptance: "passed",
  },
  {
    id: "T-919",
    title: "Slashing window spike",
    agent: "Vega",
    project: "conduit",
    tokens: 201_400,
    cost: 18.12,
    iterations: 7,
    acceptance: "flaky",
  },
  {
    id: "T-914",
    title: "Release notes",
    agent: "Morgan",
    project: "cto-pay",
    tokens: 12_400,
    cost: 0.98,
    iterations: 1,
    acceptance: "passed",
  },
  {
    id: "T-908",
    title: "p99 budget gate",
    agent: "Atlas",
    project: "cto-pay",
    tokens: 88_200,
    cost: 6.12,
    iterations: 3,
    acceptance: "failed",
  },
];

const maxTokens = Math.max(...TASKS.map((t) => t.tokens));
const maxCost = Math.max(...TASKS.map((t) => t.cost));
const maxIter = Math.max(...TASKS.map((t) => t.iterations));

export function QualityView() {
  return (
    <div className="section">
      <div className="chart-card" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <div>
          <div className="section__eyebrow">Quality · per task</div>
          <div className="section__title">Acceptance criteria, iterations, cost</div>
          <div className="section__sub">
            Every task is tracked end-to-end: tokens consumed, dollar cost, iterations until
            acceptance criteria pass. Drill into outliers to tune harness or model routing.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="ghost-btn">
          <IconRefresh size={12} /> Refresh
        </button>
        <button type="button" className="ghost-btn">
          <IconExternal size={12} /> Grafana
        </button>
      </div>

      <div className="chart-row">
        <div className="chart-card">
          <div className="chart-label">Tasks · 30d</div>
          <div className="chart-number">184</div>
          <div className="chart-delta">+22 vs prior</div>
        </div>
        <div className="chart-card">
          <div className="chart-label">Acceptance rate</div>
          <div className="chart-number">92%</div>
          <div className="chart-delta">+1.8 pp</div>
        </div>
        <div className="chart-card">
          <div className="chart-label">Iterations to accept · median</div>
          <div className="chart-number">2.1</div>
          <div className="chart-delta chart-delta--down">−0.3</div>
        </div>
        <div className="chart-card">
          <div className="chart-label">Avg cost / task</div>
          <div className="chart-number">$4.82</div>
          <div className="chart-delta chart-delta--down">−$0.40</div>
        </div>
      </div>

      <div className="chart-card">
        <div className="section__head">
          <div>
            <div className="section__eyebrow">Per-task metrics · last 30d</div>
            <div className="section__title">Tokens, cost, iterations-to-acceptance</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {TASKS.map((t) => (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1.8fr 1fr 1fr 0.8fr 0.9fr",
                gap: 12,
                alignItems: "center",
                padding: "10px 4px",
                borderBottom: "1px dashed var(--border-subtle)",
              }}
            >
              <div>
                <div className="mono tiny muted">{t.id}</div>
                <div style={{ fontSize: 12.5, color: "var(--fg-primary)", fontWeight: 500 }}>
                  {t.title}
                </div>
                <div className="tiny muted">{t.project} · {t.agent}</div>
              </div>
              <div>
                <div className="tiny muted">Tokens</div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(t.tokens / maxTokens) * 100}%` }} />
                </div>
                <div className="mono tiny" style={{ marginTop: 3 }}>
                  {t.tokens.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="tiny muted">Cost</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${(t.cost / maxCost) * 100}%`,
                      background: "linear-gradient(90deg, oklch(78% 0.15 82), oklch(68% 0.22 40))",
                    }}
                  />
                </div>
                <div className="mono tiny" style={{ marginTop: 3 }}>
                  ${t.cost.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="tiny muted">Iterations</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${(t.iterations / maxIter) * 100}%`,
                      background: "linear-gradient(90deg, oklch(70% 0.14 220), oklch(55% 0.2 260))",
                    }}
                  />
                </div>
                <div className="mono tiny" style={{ marginTop: 3 }}>
                  {t.iterations}
                </div>
              </div>
              <span
                className={`chip chip--${t.acceptance === "passed" ? "success" : t.acceptance === "flaky" ? "warn" : "danger"}`}
              >
                {t.acceptance === "passed" ? (
                  <>
                    <IconCheck size={10} /> passed
                  </>
                ) : (
                  t.acceptance
                )}
              </span>
              <button type="button" className="ghost-btn">
                <IconBolt size={11} /> replay
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
