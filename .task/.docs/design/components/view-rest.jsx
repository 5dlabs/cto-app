// Remaining views — Tasks, Applications, Design, Memory, Agents, Settings

// -------- Tasks (iframe-to-remote-code-server frame) --------
const Tasks = () => (
  <div className="tasks-view">
    <div className="tasks-frame-bar">
      <IconExternal size={12} />
      <div className="tasks-frame-url">
        <IconLock className="lock" size={11} />
        https://tasks.cto.5dlabs.ai/ws/cto-pay/flaky-suite
      </div>
      <span style={{ color: "var(--fg-muted)" }}>iframe · code-server</span>
    </div>
    <div className="tasks-frame-body">
      <div className="tasks-ide">
        <div className="tasks-ide-tabs">
          <button className="tasks-ide-tab active"><IconFile size={11} />payment_test.rs</button>
          <button className="tasks-ide-tab"><IconFile size={11} />lib.rs</button>
          <button className="tasks-ide-tab"><IconFile size={11} />Cargo.toml</button>
        </div>
        <div className="tasks-ide-body">
          <div className="prd-gutter">
            {Array.from({ length: 28 }).map((_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <pre className="tasks-code" style={{ margin: 0 }}>
<span className="cm">// flaky: race between ledger settle + confirmation poll</span>{"\n"}
<span className="kw">async fn</span> <span className="fn">test_settle_confirms</span>() {'{'}{"\n"}
{"  "}<span className="kw">let</span> ctx = <span className="fn">setup</span>().<span className="fn">await</span>;{"\n"}
{"  "}<span className="kw">let</span> tx = ctx.<span className="fn">transfer</span>(<span className="num">1_000</span>).<span className="fn">await</span>?;{"\n"}
<span className="diff-rem">  assert_eq!(ctx.poll(tx).await?, Confirmed);</span>{"\n"}
<span className="diff-add">  let confirmed = ctx.poll_until(tx, 5.secs()).await?;</span>{"\n"}
<span className="diff-add">  assert_eq!(confirmed.status, Finalized);</span>{"\n"}
{"}"}{"\n"}
{"\n"}
<span className="cm">// Angie — retry wrapper with exponential backoff</span>{"\n"}
<span className="kw">impl</span> <span className="fn">Ctx</span> {'{'}{"\n"}
{"  "}<span className="kw">async fn</span> <span className="fn">poll_until</span>(&self, tx: <span className="fn">Tx</span>, dur: <span className="fn">Duration</span>) {"->"} <span className="fn">Result</span>{"<"}<span className="fn">Receipt</span>{">"} {'{'}{"\n"}
{"    "}<span className="kw">let</span> start = <span className="fn">Instant::now</span>();{"\n"}
{"    "}<span className="kw">loop</span> {'{'}{"\n"}
{"      "}<span className="kw">match</span> <span className="kw">self</span>.<span className="fn">poll</span>(tx).<span className="fn">await</span>? {'{'}{"\n"}
{"        "}<span className="fn">Receipt</span> {'{'} status: <span className="fn">Finalized</span>, .. {'}'} =&gt; <span className="kw">return</span> <span className="fn">Ok</span>(r),{"\n"}
{"        "}_ <span className="kw">if</span> start.<span className="fn">elapsed</span>() &gt; dur =&gt; <span className="kw">return</span> <span className="fn">Err</span>(Timeout),{"\n"}
{"        "}_ =&gt; <span className="fn">sleep</span>(<span className="num">200</span>.<span className="fn">ms</span>()).<span className="fn">await</span>,{"\n"}
{"      "}{"}"}{"\n"}
{"    "}{"}"}{"\n"}
{"  "}{"}"}{"\n"}
{"}"}
          </pre>
        </div>
      </div>
      <div className="tasks-chat-panel">
        <div className="tasks-chat-head">
          <div className="tasks-agent">A</div>
          <div className="tasks-agent-meta">
            <div className="tasks-agent-name">Angie</div>
            <div className="tasks-agent-cli">claude-code · cto-pay#247</div>
          </div>
          <button className="titlebar-btn"><IconVideo size={13} /></button>
          <button className="titlebar-btn"><IconMic size={13} /></button>
        </div>
        <div style={{ padding: 12, overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="chat-bubble morgan" style={{ fontSize: 12.5 }}>
            Found it — the old <span className="md-code">poll()</span> asserts finalization on the first read. I've replaced it with <span className="md-code">poll_until</span> + 5s deadline. Running suite now.
          </div>
          <div className="chat-bubble user" style={{ fontSize: 12.5, alignSelf: "flex-end" }}>Show me test output</div>
          <div className="chat-bubble morgan" style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--state-success)" }}>✓</span> test_settle_confirms <span style={{ color: "var(--fg-muted)" }}>0.42s</span><br/>
            <span style={{ color: "var(--state-success)" }}>✓</span> test_multi_hop <span style={{ color: "var(--fg-muted)" }}>1.1s</span><br/>
            <span style={{ color: "var(--state-success)" }}>✓</span> test_refund <span style={{ color: "var(--fg-muted)" }}>0.3s</span><br/>
            12 passed, 0 failed.
          </div>
        </div>
        <div className="chat-composer">
          <input className="chat-input" placeholder="Ask Angie…" />
          <button className="btn btn-primary btn-icon"><IconSend size={13} /></button>
        </div>
      </div>
    </div>
  </div>
);

// -------- Applications (Argo CD-driven) --------
const Spark = ({ color = "var(--state-success)", variant = 0 }) => {
  const points = [
    "0,22 12,18 24,20 36,14 48,16 60,8 72,12 84,6 96,10 108,4 120,8",
    "0,14 12,20 24,10 36,16 48,22 60,14 72,18 84,10 96,12 108,6 120,8",
    "0,20 12,12 24,18 36,20 48,14 60,22 72,10 84,16 96,8 108,14 120,6",
  ][variant % 3];
  return (
    <svg className="app-spark" viewBox="0 0 120 30" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`g${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.25" />
      <polygon points={`${points} 120,30 0,30`} fill={`url(#g${variant})`} />
    </svg>
  );
};

const APPS = [
  { name: "conduit-rpc", slug: "conduit/rpc-gateway", status: "ok", regions: ["US","EU","AP","SA"], rps: "12.4k", p99: "48ms", cost: "$1.2/h" },
  { name: "cto-pay-api", slug: "cto-pay/api", status: "warn", regions: ["US","EU","AP"], rps: "3.1k", p99: "120ms", cost: "$0.8/h" },
  { name: "trading-mm", slug: "trading/market-maker", status: "ok", regions: ["US","EU"], rps: "890", p99: "12ms", cost: "$3.4/h" },
  { name: "openclaw-router", slug: "openclaw/cli-router", status: "ok", regions: ["US","EU","AP"], rps: "214", p99: "8ms", cost: "$0.2/h" },
  { name: "mcp-proxy", slug: "toolman/mcp-proxy", status: "err", regions: ["US","EU"], rps: "0", p99: "—", cost: "—" },
  { name: "agent-docs", slug: "docs/mcp-docs", status: "ok", regions: ["US"], rps: "84", p99: "6ms", cost: "$0.1/h" },
];

const Applications = () => (
  <div className="apps-view">
    <div className="apps-toolbar">
      <div className="apps-filters filters">
        <button className="filter-btn active">All · 14</button>
        <button className="filter-btn">Healthy · 11</button>
        <button className="filter-btn">Warning · 2</button>
        <button className="filter-btn">Failing · 1</button>
      </div>
      <button className="btn btn-ghost"><IconFilter size={12} /> Filter</button>
      <span style={{ marginLeft: "auto" }} />
      <span style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
        <IconRefresh size={11} /> argocd-sync · 14s ago
      </span>
      <button className="btn"><IconPlus size={12} /> Deploy from catalog</button>
    </div>
    <div className="apps-grid">
      {APPS.map((a, i) => {
        const color = a.status === "ok" ? "var(--state-success)" : a.status === "warn" ? "var(--state-warning)" : "var(--state-danger)";
        return (
          <div key={a.name} className="app-card">
            <div className="app-card-head">
              <div className="app-card-ident">
                <div className="app-logo">{a.name[0].toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="app-name">{a.name}</div>
                  <div className="app-slug">{a.slug}</div>
                </div>
              </div>
              <span className={`app-status ${a.status === "ok" ? "" : a.status}`}>
                <span className="dot" />{a.status === "ok" ? "Healthy" : a.status === "warn" ? "Degraded" : "Failing"}
              </span>
            </div>
            <div className="app-regions">
              {a.regions.map((r) => (
                <span key={r} className={`region-pip ${a.status === "err" && r === "US" ? "err" : a.status === "warn" && r === "EU" ? "warn" : ""}`}>{r}</span>
              ))}
              {["US","EU","AP","SA"].filter(r => !a.regions.includes(r)).map(r => (
                <span key={r} className="region-pip off">{r}</span>
              ))}
            </div>
            <Spark color={color} variant={i} />
            <div className="app-metrics">
              <div>
                <div className="app-metric-label">Req/s</div>
                <div className="app-metric-value">{a.rps}</div>
              </div>
              <div>
                <div className="app-metric-label">p99</div>
                <div className="app-metric-value">{a.p99}</div>
              </div>
              <div>
                <div className="app-metric-label">Cost</div>
                <div className="app-metric-value">{a.cost}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// -------- Design (Storybook embed frame) --------
const Design = () => (
  <div className="design-view">
    <div className="prd-tree">
      <div className="prd-tree-head">
        <div className="prd-tree-title">Component Library</div>
      </div>
      {[
        { name: "conduit-web", files: ["Button", "LeaseCard", "OperatorStat", "RPCBadge"] },
        { name: "cto-pay-ui", files: ["PayButton", "LedgerRow", "ChainChip"] },
        { name: "cto-desktop", files: ["Titlebar", "Sidebar", "MorganCard", "KbdChip", "AppCard"] },
      ].map((p, i) => (
        <div key={p.name} className="prd-project open">
          <div className="prd-project-head">
            <IconChevDown className="chev" size={12} style={{ transform: "rotate(0deg)" }} />
            <span className={`proj-dot ${["", "g2", "g3"][i]}`} />
            <span>{p.name}</span>
          </div>
          <div className="prd-project-files" style={{ display: "block" }}>
            {p.files.map((f, j) => (
              <div key={f} className={`prd-file ${p.name === "cto-desktop" && f === "MorganCard" ? "active" : ""}`}>
                <IconBracket className="prd-file-icon" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <div className="design-canvas">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div className="placeholder-eyebrow">cto-desktop · MorganCard</div>
          <div className="placeholder-title" style={{ fontSize: 18 }}>MorganCard <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>— default</span></div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-ghost"><IconExternal size={12} /> Open in Storybook</button>
          <button className="btn"><IconGit size={12} /> View source</button>
        </div>
      </div>
      <div className="design-stage">
        <div style={{ width: 232 }}>
          <div className="morgan-card is-active" style={{ margin: 0 }}>
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
          </div>
        </div>
      </div>
      <div className="design-specs">
        <div className="design-spec"><div className="design-spec-label">Size</div><div className="design-spec-value">232 × 108</div></div>
        <div className="design-spec"><div className="design-spec-label">Radius</div><div className="design-spec-value">10px</div></div>
        <div className="design-spec"><div className="design-spec-label">Tokens used</div><div className="design-spec-value">8</div></div>
      </div>
    </div>
  </div>
);

// -------- Memory graph --------
const MemoryGraph = () => {
  // simple force-ish mock — concentric rings, deterministic
  const nodes = React.useMemo(() => {
    const core = [{ x: 50, y: 50, r: 14, label: "you", type: "self" }];
    const ring1 = ["conduit","cto-pay","openclaw","trading","hermes"].map((l, i, a) => {
      const ang = (i / a.length) * Math.PI * 2 - Math.PI / 2;
      return { x: 50 + Math.cos(ang) * 18, y: 50 + Math.sin(ang) * 18, r: 7, label: l, type: "venture" };
    });
    const ring2 = ["angie","morgan","blaze","atlas","echo","nova","vega","orion","rune","sable","kairos","lyra"].map((l, i, a) => {
      const ang = (i / a.length) * Math.PI * 2;
      return { x: 50 + Math.cos(ang) * 34, y: 50 + Math.sin(ang) * 34, r: 4, label: l, type: "agent" };
    });
    return [...core, ...ring1, ...ring2];
  }, []);
  return (
    <div className="mem-view">
      <div className="mem-canvas">
        <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          {nodes.slice(1, 6).map((n, i) => (
            <line key={`c-${i}`} x1="50" y1="50" x2={n.x} y2={n.y} stroke="var(--accent)" strokeWidth="0.15" opacity="0.6" />
          ))}
          {nodes.slice(6).map((n, i) => {
            const parent = nodes[1 + (i % 5)];
            return <line key={`e-${i}`} x1={parent.x} y1={parent.y} x2={n.x} y2={n.y} stroke="var(--border-strong)" strokeWidth="0.08" opacity="0.7" />;
          })}
          {nodes.map((n, i) => (
            <g key={i}>
              <circle
                cx={n.x} cy={n.y} r={n.r / 3}
                fill={n.type === "self" ? "var(--accent)" : n.type === "venture" ? "oklch(72% 0.1 258)" : "var(--rx-gray-07)"}
                stroke="var(--bg-app)" strokeWidth="0.3"
              />
              {n.type !== "agent" && (
                <text x={n.x} y={n.y + n.r / 3 + 3} fontSize="2.2" fill="var(--fg-secondary)" textAnchor="middle" fontFamily="var(--font-ui)">{n.label}</text>
              )}
            </g>
          ))}
        </svg>
        <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 6 }}>
          <button className="btn btn-ghost">All time</button>
          <button className="btn btn-ghost">Ventures</button>
          <button className="btn btn-ghost">Agents</button>
        </div>
        <div style={{ position: "absolute", bottom: 14, left: 14, fontSize: 11, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
          1,284 nodes · 4,201 edges · mem0-compatible
        </div>
      </div>
      <div className="mem-side">
        <div className="mem-facet">
          <div className="mem-facet-title">Top entities</div>
          <div className="mem-list">
            {[["conduit","284"],["Angie","201"],["cto-pay","177"],["Morgan","164"],["lease","142"]].map(([l,c]) => (
              <div key={l} className="mem-list-item"><span>{l}</span><span className="count">{c}</span></div>
            ))}
          </div>
        </div>
        <div className="mem-facet">
          <div className="mem-facet-title">Facets</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["decision","risk","deadline","hypothesis","learning","contact","spec"].map(t => (
              <span key={t} className="mem-tag"><span className="mem-tag-dot" />{t}</span>
            ))}
          </div>
        </div>
        <div className="mem-facet">
          <div className="mem-facet-title">Recent recall</div>
          <div style={{ fontSize: 12, color: "var(--fg-secondary)", lineHeight: 1.55 }}>
            Morgan recalled: <em>“ship cto-pay only after Angie clears the flaky suite”</em> from 14m ago.
          </div>
        </div>
      </div>
    </div>
  );
};

// -------- Agents --------
const AGENTS = [
  { name: "Morgan", role: "Project Manager", hue: 282, clis: ["claude-code","gemini"], skills: ["planning","standup","prd-authoring","scheduling"], runs: 284, success: "98%" },
  { name: "Angie", role: "Agent Architect", hue: 200, clis: ["claude-code","cursor","factory"], skills: ["mcp-routing","voice-agents","runtime"], runs: 201, success: "96%" },
  { name: "Blaze", role: "Backend Engineer", hue: 30, clis: ["claude-code","codex"], skills: ["rust","grpc","postgres","kubernetes"], runs: 177, success: "94%" },
  { name: "Atlas", role: "Infra / SRE", hue: 150, clis: ["opencode","claude-code"], skills: ["talos","argocd","helm","observability"], runs: 164, success: "99%" },
  { name: "Echo", role: "QA / Fleet", hue: 320, clis: ["claude-code"], skills: ["agentic-qe","e2e","flaky-detection"], runs: 142, success: "97%" },
  { name: "Vega", role: "Trading Quant", hue: 75, clis: ["cursor","claude-code"], skills: ["solana","mev","backtest","risk"], runs: 98, success: "91%" },
  { name: "Nova", role: "Frontend Eng", hue: 230, clis: ["claude-code"], skills: ["react","storybook","tailwind","a11y"], runs: 76, success: "95%" },
  { name: "Rune", role: "Docs / DevRel", hue: 100, clis: ["gemini","claude-code"], skills: ["writing","tutorials","onboarding"], runs: 54, success: "99%" },
];

const Agents = () => (
  <div className="agents-view">
    {AGENTS.map(a => (
      <div key={a.name} className="agent-card">
        <div className="agent-head">
          <div className="agent-avatar" style={{
            background: `linear-gradient(135deg, oklch(45% 0.16 ${a.hue}), oklch(22% 0.12 ${a.hue}))`,
            borderColor: `oklch(63% 0.15 ${a.hue} / 0.4)`,
            color: "#fff",
          }}>{a.name[0]}</div>
          <div style={{ flex: 1 }}>
            <div className="agent-name">{a.name}</div>
            <div className="agent-role">{a.role}</div>
          </div>
          <span className="app-status"><span className="dot" />Ready</span>
        </div>
        <div className="agent-cli-row">
          {a.clis.map((c, i) => (
            <span key={c} className={`agent-cli ${i === 0 ? "primary" : ""}`}>{c}</span>
          ))}
        </div>
        <div className="agent-skills">
          {a.skills.map(s => <span key={s} className="agent-skill">{s}</span>)}
        </div>
        <div className="agent-stats">
          <span>Runs <strong>{a.runs}</strong></span>
          <span>Success <strong>{a.success}</strong></span>
          <span style={{ marginLeft: "auto" }}>
            <button className="btn btn-ghost" style={{ height: 22, padding: "0 6px" }}>Configure</button>
          </span>
        </div>
      </div>
    ))}
  </div>
);

// -------- Settings --------
const Settings = () => (
  <div className="placeholder">
    <div className="placeholder-eyebrow">Settings</div>
    <div className="placeholder-title">Workspace preferences</div>
    <div className="placeholder-lead">
      Cluster connections, theme, keyboard shortcuts, agent defaults, and API keys for OpenClaw routing. This surface will get fleshed out after we lock in the primary workspace design.
    </div>
    <div className="placeholder-frame">
      <span className="label">Scaffold</span>
      settings/
      ├── cluster.tsx        <span style={{color:"var(--fg-faint)"}}>// talos endpoints, kubeconfig</span>
      ├── appearance.tsx     <span style={{color:"var(--fg-faint)"}}>// theme, motif, density</span>
      ├── shortcuts.tsx      <span style={{color:"var(--fg-faint)"}}>// keybinding editor</span>
      ├── agents.tsx         <span style={{color:"var(--fg-faint)"}}>// defaults per-agent</span>
      ├── providers.tsx      <span style={{color:"var(--fg-faint)"}}>// LLM + CLI routing</span>
      └── billing.tsx        <span style={{color:"var(--fg-faint)"}}>// cto-pay meters</span>
    </div>
  </div>
);

Object.assign(window, { Tasks, Applications, Design, MemoryGraph, Agents, Settings });
