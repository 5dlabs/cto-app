// Morgan (home) view

const Morgan = () => {
  const [mode, setMode] = React.useState("video");
  return (
    <div className="morgan-view">
      <div className="morgan-hero">
        <div className="morgan-hero-video">
          <div className="morgan-hero-live">
            <span className="morgan-hero-live-dot" />
            Live · {mode}
          </div>
          <div className="morgan-hero-avatar">M</div>
          <div className="morgan-hero-label">
            <div className="morgan-hero-name">Morgan</div>
            <div className="morgan-hero-caption">Project manager · standing by</div>
          </div>
        </div>
        <div className="morgan-hero-controls">
          <div className="hero-mode-toggle">
            <button className={mode === "video" ? "active" : ""} onClick={() => setMode("video")}>
              <IconVideo /> Video
            </button>
            <button className={mode === "voice" ? "active" : ""} onClick={() => setMode("voice")}>
              <IconMic /> Voice
            </button>
            <button className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}>
              <IconChat /> Chat
            </button>
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost"><IconRefresh size={12} /> Reconnect</button>
          <button className="btn"><IconExternal size={12} /> Pop out</button>
        </div>
        <div className="morgan-chat">
          <div>
            <div className="chat-meta">Morgan · 9:42 AM</div>
            <div className="chat-bubble morgan">
              Standup summary: conduit/RPC rate-limiter merged, cto-pay has two flaky tests blocking release. I've queued Angie on the failing suite.
            </div>
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <div className="chat-meta" style={{ textAlign: "right" }}>You · 9:43 AM</div>
            <div className="chat-bubble user">Ship cto-pay once tests are green. Hold release notes for my review.</div>
          </div>
          <div>
            <div className="chat-meta">Morgan · 9:43 AM</div>
            <div className="chat-bubble morgan">
              Confirmed. I'll ping you in #cto-releases when Angie clears the suite. Release notes drafted and waiting in PRDs → cto-pay → <span className="md-code">RELEASE-0.4.md</span>.
            </div>
          </div>
        </div>
        <div className="chat-composer">
          <input className="chat-input" placeholder="Message Morgan — she'll route to the right agent" />
          <button className="btn btn-icon" style={{ color: "var(--fg-muted)" }}><IconSparkles size={13} /></button>
          <button className="btn btn-primary btn-icon"><IconSend size={13} /></button>
        </div>
      </div>

      <div className="home-side">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-eyebrow">Today</div>
              <div className="card-title" style={{ marginTop: 2 }}>Studio briefing</div>
            </div>
            <span className="kbd-row"><span className="kbd">⌘</span><span className="kbd">B</span></span>
          </div>
          <div className="standup-item">
            <div className="standup-time">09:00</div>
            <div className="standup-body">
              <div className="standup-title">conduit · RPC lease renewal</div>
              <div className="standup-meta">
                <span className="standup-tag">merged</span> 4 commits · Blaze
              </div>
            </div>
          </div>
          <div className="standup-item">
            <div className="standup-time">09:40</div>
            <div className="standup-body">
              <div className="standup-title">cto-pay · release gate</div>
              <div className="standup-meta">
                <span className="standup-tag">blocked</span> flaky tests × 2 · Angie on it
              </div>
            </div>
          </div>
          <div className="standup-item">
            <div className="standup-time">10:15</div>
            <div className="standup-body">
              <div className="standup-title">openclaw · CLI routing spec</div>
              <div className="standup-meta">
                <span className="standup-tag">draft</span> PRD revision · Morgan
              </div>
            </div>
          </div>
          <div className="standup-item">
            <div className="standup-time">11:00</div>
            <div className="standup-body">
              <div className="standup-title">trading-platform · live P&amp;L dashboard</div>
              <div className="standup-meta">
                <span className="standup-tag">shipped</span> deploy to base-mainnet
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-eyebrow">Operations</div>
              <div className="card-title" style={{ marginTop: 2 }}>Last 24h</div>
            </div>
          </div>
          <div className="metric-row">
            <div className="metric">
              <div className="metric-label">Agent runs</div>
              <div className="metric-value">1,284</div>
              <div className="metric-trend">↑ 12.4%</div>
            </div>
            <div className="metric">
              <div className="metric-label">Ships</div>
              <div className="metric-value">37</div>
              <div className="metric-trend">↑ 4</div>
            </div>
            <div className="metric">
              <div className="metric-label">LLM spend</div>
              <div className="metric-value">$214</div>
              <div className="metric-trend down">↓ 3.1%</div>
            </div>
            <div className="metric">
              <div className="metric-label">Trading P&amp;L</div>
              <div className="metric-value">+$842</div>
              <div className="metric-trend">↑ 18.7%</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-eyebrow">Ventures in flight</div>
            <span className="card-eyebrow" style={{ color: "var(--fg-faint)" }}>5</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["conduit", "Decentralized RPC", "building", 1],
              ["cto-pay", "Usage-based payments", "building", 2],
              ["openclaw", "Orchestration layer", "building", 1],
              ["trading", "Market-making stack", "building", 3],
              ["hermes", "Stealth", "exploring", 4],
            ].map(([name, desc, stage, grp]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px dashed var(--border-subtle)" }}>
                <span className={`mem-tag-dot`} style={{ background: `var(--accent)`, opacity: grp === 1 ? 1 : 0.4 + (0.15 * grp) }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: "var(--fg-primary)", fontWeight: 500 }}>{name}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>{desc}</div>
                </div>
                <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: stage === "exploring" ? "var(--state-warning)" : "var(--fg-muted)" }}>{stage}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Morgan });
