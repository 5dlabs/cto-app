// PRDs view — VS Code-inspired markdown editor with project tree

const PRD_PROJECTS = [
  {
    id: "conduit",
    name: "conduit",
    dot: "",
    files: [
      { id: "vision", name: "00 — Vision.md" },
      { id: "lease", name: "01 — Lease protocol.md", active: true },
      { id: "rpc", name: "02 — RPC routing.md" },
      { id: "token", name: "03 — CDT token.md" },
      { id: "release", name: "RELEASE-0.3.md" },
    ],
  },
  {
    id: "ctopay",
    name: "cto-pay",
    dot: "g2",
    files: [
      { id: "prd", name: "00 — PRD.md" },
      { id: "solana", name: "01 — Solana settlement.md" },
      { id: "release", name: "RELEASE-0.4.md" },
    ],
  },
  {
    id: "openclaw",
    name: "openclaw",
    dot: "g3",
    files: [
      { id: "arch", name: "00 — Architecture.md" },
      { id: "cli", name: "01 — CLI routing spec.md" },
      { id: "mcp", name: "02 — MCP tools.md" },
    ],
  },
  {
    id: "trading",
    name: "trading-platform",
    dot: "g4",
    files: [
      { id: "strat", name: "00 — Strategy mandate.md" },
      { id: "risk", name: "01 — Risk limits.md" },
    ],
  },
];

const PRDs = () => {
  const [openProjects, setOpen] = React.useState({ conduit: true, ctopay: true });
  const [active, setActive] = React.useState("lease");

  return (
    <div className="prd-view">
      <div className="prd-tree">
        <div className="prd-tree-head">
          <div className="prd-tree-title">Product Docs</div>
          <IconPlus size={12} style={{ color: "var(--fg-muted)", cursor: "pointer" }} />
        </div>
        {PRD_PROJECTS.map((p) => (
          <div key={p.id} className={`prd-project ${openProjects[p.id] ? "open" : ""}`}>
            <div className="prd-project-head" onClick={() => setOpen({ ...openProjects, [p.id]: !openProjects[p.id] })}>
              <IconChevRight className="chev" size={12} />
              <span className={`proj-dot ${p.dot}`} />
              <span>{p.name}</span>
              <span style={{ marginLeft: "auto", color: "var(--fg-faint)", fontSize: 10.5, fontFamily: "var(--font-mono)" }}>{p.files.length}</span>
            </div>
            <div className="prd-project-files">
              {p.files.map((f) => (
                <div
                  key={f.id}
                  className={`prd-file ${active === f.id ? "active" : ""}`}
                  onClick={() => setActive(f.id)}
                >
                  <IconFile className="prd-file-icon" />
                  <span>{f.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="prd-editor">
        <div className="prd-tabs">
          <button className="prd-tab active">
            <IconFile size={12} />
            01 — Lease protocol.md
            <span className="x"><IconClose size={10} /></span>
          </button>
          <button className="prd-tab">
            <IconFile size={12} />
            00 — Vision.md
            <span className="x"><IconClose size={10} /></span>
          </button>
          <button className="prd-tab">
            <IconFile size={12} />
            RELEASE-0.4.md
            <span className="x"><IconClose size={10} /></span>
          </button>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10, padding: "0 10px", fontSize: 11, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
            <IconGit size={12} /> main · clean
          </span>
        </div>
        <div className="prd-doc">
          <div className="prd-gutter">
            {Array.from({ length: 42 }).map((_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <div className="prd-content">
            <div className="md-token"># </div>
            <h1 className="md-h1" style={{ display: "inline" }}>Lease protocol</h1>
            <div className="md-meta">conduit · v0.3-draft · last edited by Morgan 14m ago</div>

            <h2 className="md-h2">Problem</h2>
            <p className="md-p">
              Centralized RPC providers meter on keys, not demand. A decentralized lease market lets inference and RPC capacity clear at a true market price while giving operators predictable settlement on <span className="md-code">$CDT</span>.
            </p>

            <div className="md-quote">
              North-star: a dev swaps their Alchemy URL for a conduit URL and the rest is invisible.
            </div>

            <h2 className="md-h2">Wedge</h2>
            <ul className="md-ul">
              <li>Drop-in EVM + Solana RPC that settles usage on-chain every 60s</li>
              <li>Operators stake <span className="md-code">$CDT</span> to claim routing slots, get slashed on SLA misses</li>
              <li>Lease terms expressed as signed typed-data; no off-chain trust required</li>
            </ul>

            <h2 className="md-h2">Open questions</h2>
            <ul className="md-checklist">
              <li className="done">
                <span className="md-check done"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="oklch(14.5% 0.008 258)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5l10 -10" /></svg></span>
                Settle on Solana or Base first? <span className="md-token">— decided: Solana (lower fees, faster finality)</span>
              </li>
              <li><span className="md-check"></span>Operator registration flow — KYC-light or fully permissionless?</li>
              <li><span className="md-check"></span>Inference routing heuristic — lowest latency, cheapest, or weighted?</li>
              <li><span className="md-check"></span>Slashing window — 60s rolling or per-lease-epoch?</li>
            </ul>

            <h2 className="md-h2">Related</h2>
            <p className="md-p">
              See <a className="md-link">02 — RPC routing.md</a> for the dispatch algorithm, <a className="md-link">03 — CDT token.md</a> for tokenomics, and the in-flight <a className="md-link">openclaw/01 — CLI routing spec.md</a> which reuses this lease abstraction for model selection.
            </p>

            <h3 className="md-h3">Spec snippet</h3>
            <p className="md-p" style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--fg-muted)", background: "var(--bg-surface)", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", lineHeight: 1.7 }}>
              <span style={{ color: "oklch(75% 0.15 300)" }}>struct</span> <span style={{ color: "oklch(78% 0.12 220)" }}>Lease</span> {"{"}<br/>
              &nbsp;&nbsp;operator: <span style={{ color: "oklch(78% 0.12 220)" }}>Pubkey</span>,<br/>
              &nbsp;&nbsp;capacity_rps: <span style={{ color: "oklch(78% 0.13 50)" }}>u32</span>,<br/>
              &nbsp;&nbsp;price_per_1k: <span style={{ color: "oklch(78% 0.13 50)" }}>u64</span>, <span style={{ color: "var(--fg-faint)", fontStyle: "italic" }}>// lamports</span><br/>
              &nbsp;&nbsp;expiry: <span style={{ color: "oklch(78% 0.13 50)" }}>u64</span>,<br/>
              {"}"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PRDs });
