import { useState } from "react";
import { IconSearch, IconFilter, IconRefresh, IconSparkles } from "./icons";

interface MemNode {
  id: string;
  label: string;
  kind: "project" | "agent" | "fact" | "person" | "tool";
  x: number;
  y: number;
}

interface MemEdge {
  a: string;
  b: string;
}

const NODES: MemNode[] = [
  { id: "morgan", label: "Morgan", kind: "agent", x: 50, y: 32 },
  { id: "conduit", label: "conduit", kind: "project", x: 22, y: 50 },
  { id: "cto-pay", label: "cto-pay", kind: "project", x: 78, y: 50 },
  { id: "sigma-1", label: "sigma-1/rms", kind: "project", x: 48, y: 72 },
  { id: "angie", label: "Angie", kind: "agent", x: 78, y: 68 },
  { id: "blaze", label: "Blaze", kind: "agent", x: 22, y: 68 },
  { id: "cipher", label: "Cipher", kind: "agent", x: 30, y: 18 },
  { id: "atlas", label: "Atlas", kind: "agent", x: 70, y: 18 },
  { id: "phantom", label: "Phantom wallet", kind: "tool", x: 90, y: 30 },
  { id: "cloudnativepg", label: "CloudNativePG", kind: "tool", x: 10, y: 30 },
  { id: "openclaw", label: "openclaw", kind: "project", x: 88, y: 80 },
  { id: "jonathon", label: "you", kind: "person", x: 52, y: 52 },
];

const EDGES: MemEdge[] = [
  { a: "morgan", b: "conduit" },
  { a: "morgan", b: "cto-pay" },
  { a: "morgan", b: "sigma-1" },
  { a: "morgan", b: "jonathon" },
  { a: "morgan", b: "cipher" },
  { a: "morgan", b: "atlas" },
  { a: "angie", b: "cto-pay" },
  { a: "blaze", b: "conduit" },
  { a: "cipher", b: "conduit" },
  { a: "atlas", b: "cto-pay" },
  { a: "cto-pay", b: "phantom" },
  { a: "conduit", b: "cloudnativepg" },
  { a: "sigma-1", b: "angie" },
  { a: "openclaw", b: "jonathon" },
  { a: "openclaw", b: "blaze" },
];

const COLOR: Record<MemNode["kind"], string> = {
  project: "oklch(70% 0.15 200)",
  agent: "oklch(70% 0.18 282)",
  fact: "oklch(72% 0.15 150)",
  person: "oklch(78% 0.15 82)",
  tool: "oklch(68% 0.16 22)",
};

export function MemoryView() {
  const [query, setQuery] = useState("");
  const filtered = NODES.filter((n) =>
    query ? n.label.toLowerCase().includes(query.toLowerCase()) : true,
  );

  return (
    <div className="section">
      <div className="chart-card" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <div>
          <div className="section__eyebrow">Memory · mem0</div>
          <div className="section__title">Graph — cross-project, cross-agent</div>
          <div className="section__sub">
            Housekeeping console for every memory record. Filter, re-index, forget — then watch the
            graph update live. Underlying store: mem0 w/ HSG temporal layer.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="ghost-btn">
          <IconRefresh size={12} /> Re-index
        </button>
        <button type="button" className="ghost-btn">
          <IconFilter size={12} /> Facets
        </button>
      </div>

      <div className="mem-view">
        <div className="mem-canvas">
          <div className="mem-canvas__toolbar">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                padding: "4px 10px",
              }}
            >
              <IconSearch size={12} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search entities, facts…"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--fg-primary)",
                  fontSize: 12.5,
                  outline: "none",
                  width: 220,
                }}
              />
            </div>
          </div>

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            {EDGES.map((e) => {
              const a = NODES.find((n) => n.id === e.a);
              const b = NODES.find((n) => n.id === e.b);
              if (!a || !b) return null;
              return (
                <line
                  key={`${e.a}-${e.b}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="oklch(70% 0.05 258 / 0.22)"
                  strokeWidth={0.15}
                />
              );
            })}
            {filtered.map((n) => (
              <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
                <circle
                  r={n.kind === "agent" ? 1.6 : n.kind === "project" ? 1.3 : 1}
                  fill={COLOR[n.kind]}
                  stroke="oklch(95% 0.02 258 / 0.3)"
                  strokeWidth={0.1}
                />
                <text
                  x={2}
                  y={0.4}
                  fontSize={1.8}
                  fill="var(--fg-primary)"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  {n.label}
                </text>
              </g>
            ))}
          </svg>

          <div className="mem-canvas__meta">
            {NODES.length} entities · {EDGES.length} relationships · mem0 store
          </div>
        </div>

        <div className="mem-side">
          <div className="mem-facet">
            <div className="mem-facet__title">Top entities</div>
            <div className="mem-list">
              {["Morgan (agent)", "conduit (project)", "cto-pay (project)", "sigma-1 (project)", "Angie (agent)"].map(
                (e) => (
                  <div className="mem-list-item" key={e}>
                    <span>{e}</span>
                    <span className="count">{Math.floor(Math.random() * 40 + 20)}</span>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="mem-facet">
            <div className="mem-facet__title">Facets</div>
            <div className="row row--wrap">
              {["agent", "project", "tool", "person", "fact", "decision", "heartbeat"].map((f) => (
                <span className="chip" key={f}>
                  {f}
                </span>
              ))}
            </div>
          </div>

          <div className="mem-facet">
            <div className="mem-facet__title">Recent recall</div>
            <div className="mem-list">
              <div className="mem-list-item">
                <span>Morgan ↔ cto-pay flaky settle</span>
                <span className="count">2m</span>
              </div>
              <div className="mem-list-item">
                <span>Cipher ↔ conduit auth path</span>
                <span className="count">18m</span>
              </div>
              <div className="mem-list-item">
                <span>Atlas ↔ GPU pool sizing</span>
                <span className="count">1h</span>
              </div>
              <div className="mem-list-item">
                <span>Morgan ↔ sigma-1 epic breakdown</span>
                <span className="count">3h</span>
              </div>
            </div>
          </div>

          <div className="mem-facet">
            <div className="mem-facet__title">Housekeeping</div>
            <div className="row row--wrap">
              <button type="button" className="ghost-btn">
                <IconSparkles size={12} /> Compact old
              </button>
              <button type="button" className="ghost-btn">
                Forget node
              </button>
              <button type="button" className="ghost-btn">
                Merge duplicates
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
