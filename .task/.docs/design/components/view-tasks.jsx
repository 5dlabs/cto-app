// Tasks — 3 pane (Agent · Diff · Source control + Log)
// Logseq-flavored: block-style diffs, soft surfaces

// ---- Agent avatar: image if available, initial fallback ----
const AgentAvatar = ({ name, src, size = 56, style = {} }) => {
  const initial = (name || "?")[0].toUpperCase();
  const hue = ({ Morgan: 282, Angie: 200, Blaze: 30, Atlas: 150, Echo: 320, Vega: 75, Nova: 230, Rune: 100, You: 258 }[name]) || 258;
  const bg = src
    ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: `linear-gradient(135deg, oklch(55% 0.16 ${hue}), oklch(22% 0.12 ${hue}))` };
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        display: "grid", placeItems: "center",
        color: "#fff", fontWeight: 500, fontSize: size * 0.4,
        ...bg, ...style,
      }}
    >
      {!src && initial}
    </div>
  );
};

// ---- Task tree on left pane ----
const TASK_TREE = [
  { id: "ep1", title: "cto-pay · release 0.4", agent: "Morgan", status: "running", children: [
    { id: "t1", title: "Fix flaky settle tests", agent: "Angie", status: "running", active: true },
    { id: "t2", title: "Update release notes", agent: "Morgan", status: "queued" },
    { id: "t3", title: "Gate on p99 budget", agent: "Atlas", status: "queued" },
  ]},
  { id: "ep2", title: "conduit · lease v2", agent: "Blaze", status: "running", children: [
    { id: "t4", title: "Typed-data schema", agent: "Blaze", status: "done" },
    { id: "t5", title: "Operator registration", agent: "Blaze", status: "running" },
    { id: "t6", title: "Slashing window spike", agent: "Vega", status: "blocked" },
  ]},
  { id: "ep3", title: "openclaw · cli routing", agent: "Angie", status: "queued", children: [] },
];

const TaskNode = ({ node, depth = 0, active, onPick }) => (
  <>
    <div
      className={`task-node ${node.active ? "active" : ""}`}
      style={{ paddingLeft: 6 + depth * 16 }}
      onClick={() => onPick?.(node.id)}
    >
      <span className={`status-bullet ${node.status}`} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.title}</span>
      <span className="task-agent-tag">{node.agent}</span>
    </div>
    {node.children && node.children.map(c => <TaskNode key={c.id} node={c} depth={depth + 1} onPick={onPick} />)}
  </>
);

// ---- Pane 1: Agent ----
const AgentPane = ({ agent, avatarSrc, morganSrc }) => {
  const [mode, setMode] = React.useState("video");
  return (
    <div className="agent-pane">
      <div className="agent-pane-head">
        <IconUsers size={12} style={{ color: "var(--fg-muted)" }} />
        <span className="agent-pane-title">Working on</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
          · {agent.task}
        </span>
      </div>

      <div className="agent-video">
        <div className="agent-video-live"><span className="dot" />LIVE · {mode}</div>
        <AgentAvatar name={agent.name} src={avatarSrc} size={180} style={{
          border: "1px solid var(--accent-border)",
          boxShadow: "0 14px 40px var(--accent-glow)",
        }} />
        <div className="agent-video-label">
          <div className="agent-video-name">{agent.name}</div>
          <div className="agent-video-role">{agent.cli} · {agent.role}</div>
        </div>
        {/* PiP: Morgan supervising */}
        <div className="agent-video-mini" title="Morgan · supervising">
          <AgentAvatar name="Morgan" src={morganSrc} size={54} />
        </div>
      </div>

      <div className="agent-mode-bar">
        <button className={mode === "video" ? "active" : ""} onClick={() => setMode("video")}>
          <IconVideo size={12} /> Video
        </button>
        <button className={mode === "voice" ? "active" : ""} onClick={() => setMode("voice")}>
          <IconMic size={12} /> Voice
        </button>
        <button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>
          <IconChat size={12} /> Text
        </button>
      </div>

      <div className="agent-chat">
        <div>
          <div className="chat-meta">Angie · 2m ago</div>
          <div className="chat-bubble morgan">
            Reproduced the race. Replacing <span className="md-code">poll()</span> with <span className="md-code">poll_until(tx, 5s)</span> and adding exponential backoff.
          </div>
        </div>
        <div style={{ alignSelf: "flex-end" }}>
          <div className="chat-meta" style={{ textAlign: "right" }}>You · 1m ago</div>
          <div className="chat-bubble user">Keep retries ≤ 5, don't mask real timeouts.</div>
        </div>
        <div>
          <div className="chat-meta">Angie · 12s ago</div>
          <div className="chat-bubble morgan">
            Confirmed. 5 retries max, real timeouts surface as <span className="md-code">Err(Timeout)</span>. Running suite now — 12/12 so far.
          </div>
        </div>
      </div>

      <div className="chat-composer" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <input className="chat-input" placeholder="Ask Angie · @tag to route" />
        <button className="btn btn-primary btn-icon"><IconSend size={13} /></button>
      </div>

      <div className="agent-task-tree">
        <div className="agent-task-tree-head">
          <span>Task tree</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-faint)" }}>3 epics · 9 tasks</span>
        </div>
        {TASK_TREE.map(n => <TaskNode key={n.id} node={n} />)}
      </div>
    </div>
  );
};

// ---- Pane 2: Diff ----
const DiffRow = ({ n, kind, code, oldN }) => (
  <div className={`diff-row ${kind}`}>
    <span className="diff-ln">{oldN ?? ""}</span>
    <span className="diff-ln">{n ?? ""}</span>
    <span className="diff-code" dangerouslySetInnerHTML={{ __html: code }} />
  </div>
);

const DiffPane = () => (
  <div className="diff-pane">
    <div className="diff-head">
      <span className="diff-crumb">
        <strong>cto-pay</strong>/<span>crates/ledger/</span><strong>src/poll.rs</strong>
      </span>
      <span className="diff-chip add"><IconPlus size={10} />+14</span>
      <span className="diff-chip rem"><IconClose size={10} />−6</span>
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
        <button className="btn btn-ghost"><IconGit size={12} /> Stage all</button>
        <button className="btn btn-ghost"><IconRefresh size={12} /> Refresh</button>
      </span>
    </div>

    <div className="diff-scroll">
      {/* File block 1 */}
      <div className="diff-block">
        <div className="diff-block-head">
          <IconFile size={13} style={{ color: "var(--fg-muted)" }} />
          <span className="diff-block-path"><span className="dir">crates/ledger/src/</span>poll.rs</span>
          <span className="stat"><span className="add">+14</span> <span className="rem">−6</span></span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
            modified · 12s ago
          </span>
        </div>
        <div className="diff-hunk">
          <div className="diff-hunk-header">@@ -42,12 +42,20 @@ impl Ctx</div>

          <DiffRow oldN="42" n="42" kind="ctx" code='<span class="kw">impl</span> <span class="fn">Ctx</span> {' />
          <DiffRow oldN="43" n="43" kind="ctx" code='    <span class="cm">// poll a pending transaction until finalized</span>' />
          <DiffRow oldN="44" kind="rem" code='    <span class="kw">async fn</span> <span class="fn">poll</span>(&amp;self, tx: <span class="fn">Tx</span>) -&gt; <span class="fn">Result</span>&lt;<span class="fn">Receipt</span>&gt; {' />
          <DiffRow oldN="45" kind="rem" code='        <span class="kw">let</span> r = <span class="kw">self</span>.client.<span class="fn">get_receipt</span>(tx).<span class="fn">await</span>?;' />
          <DiffRow oldN="46" kind="rem" code='        <span class="fn">assert_eq</span>!(r.status, <span class="fn">Confirmed</span>); <span class="cm">// flaky on slow nodes</span>' />
          <DiffRow oldN="47" kind="rem" code='        <span class="fn">Ok</span>(r)' />
          <DiffRow oldN="48" kind="rem" code='    }' />
          <DiffRow n="44" kind="add" code='    <span class="kw">async fn</span> <span class="fn">poll_until</span>(&amp;self, tx: <span class="fn">Tx</span>, dur: <span class="fn">Duration</span>) -&gt; <span class="fn">Result</span>&lt;<span class="fn">Receipt</span>&gt; {' />
          <DiffRow n="45" kind="add" code='        <span class="kw">let</span> start = <span class="fn">Instant::now</span>();' />
          <DiffRow n="46" kind="add" code='        <span class="kw">let mut</span> attempts = <span class="num">0</span>;' />
          <DiffRow n="47" kind="add" code='        <span class="kw">loop</span> {' />
          <DiffRow n="48" kind="add" code='            <span class="kw">let</span> r = <span class="kw">self</span>.client.<span class="fn">get_receipt</span>(tx).<span class="fn">await</span>?;' />
          <DiffRow n="49" kind="add" code='            <span class="kw">if</span> r.status == <span class="fn">Finalized</span> { <span class="kw">return</span> <span class="fn">Ok</span>(r); }' />
          <DiffRow n="50" kind="add" code='            <span class="kw">if</span> start.<span class="fn">elapsed</span>() &gt; dur || attempts &gt;= <span class="num">5</span> {' />
          <DiffRow n="51" kind="add" code='                <span class="kw">return</span> <span class="fn">Err</span>(<span class="fn">Error::Timeout</span>);' />
          <DiffRow n="52" kind="add" code='            }' />
          <DiffRow n="53" kind="add" code='            attempts += <span class="num">1</span>;' />
          <DiffRow n="54" kind="add" code='            <span class="fn">sleep</span>(<span class="fn">backoff</span>(attempts)).<span class="fn">await</span>;' />
          <DiffRow n="55" kind="add" code='        }' />
          <DiffRow n="56" kind="add" code='    }' />
          <DiffRow oldN="49" n="57" kind="ctx" code='}' />
        </div>
      </div>

      {/* File block 2 */}
      <div className="diff-block">
        <div className="diff-block-head">
          <IconFile size={13} style={{ color: "var(--fg-muted)" }} />
          <span className="diff-block-path"><span className="dir">crates/ledger/src/</span>tests/payment_test.rs</span>
          <span className="stat"><span className="add">+3</span> <span className="rem">−1</span></span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
            modified · 8s ago
          </span>
        </div>
        <div className="diff-hunk">
          <div className="diff-hunk-header">@@ -18,7 +18,9 @@ async fn test_settle_confirms</div>
          <DiffRow oldN="18" n="18" kind="ctx" code='    <span class="kw">let</span> ctx = <span class="fn">setup</span>().<span class="fn">await</span>;' />
          <DiffRow oldN="19" n="19" kind="ctx" code='    <span class="kw">let</span> tx = ctx.<span class="fn">transfer</span>(<span class="num">1_000</span>).<span class="fn">await</span>?;' />
          <DiffRow oldN="20" kind="rem" code='    <span class="fn">assert_eq</span>!(ctx.<span class="fn">poll</span>(tx).<span class="fn">await</span>?.status, <span class="fn">Confirmed</span>);' />
          <DiffRow n="20" kind="add" code='    <span class="kw">let</span> r = ctx.<span class="fn">poll_until</span>(tx, <span class="num">5</span>.<span class="fn">secs</span>()).<span class="fn">await</span>?;' />
          <DiffRow n="21" kind="add" code='    <span class="fn">assert_eq</span>!(r.status, <span class="fn">Finalized</span>);' />
          <DiffRow n="22" kind="add" code='    <span class="fn">assert</span>!(r.confirmations &gt;= <span class="num">12</span>);' />
          <DiffRow oldN="21" n="23" kind="ctx" code='}' />
        </div>
      </div>

      {/* File block 3 */}
      <div className="diff-block">
        <div className="diff-block-head">
          <IconFile size={13} style={{ color: "var(--fg-muted)" }} />
          <span className="diff-block-path"><span className="dir">crates/ledger/</span>CHANGELOG.md</span>
          <span className="stat"><span className="add">+2</span></span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
            modified · 3s ago
          </span>
        </div>
        <div className="diff-hunk">
          <div className="diff-hunk-header">@@ -1,4 +1,6 @@</div>
          <DiffRow oldN="1" n="1" kind="ctx" code='<span class="fn">## Unreleased</span>' />
          <DiffRow n="2" kind="add" code='- Fixed flaky settle test caused by premature finality check' />
          <DiffRow n="3" kind="add" code='- Added <span class="fn">poll_until</span> helper with 5s deadline + exp backoff' />
          <DiffRow oldN="2" n="4" kind="ctx" code='' />
          <DiffRow oldN="3" n="5" kind="ctx" code='<span class="fn">## 0.3.0</span>' />
        </div>
      </div>
    </div>
  </div>
);

// ---- Pane 3: Source control + log ----
const SCMPane = () => {
  const [tab, setTab] = React.useState("changes");
  return (
    <div className="scm-pane">
      <div className="scm-tabs">
        <button className={`scm-tab ${tab === "changes" ? "active" : ""}`} onClick={() => setTab("changes")}>
          <IconGit size={12} /> Changes <span className="scm-tab-count">3</span>
        </button>
        <button className={`scm-tab ${tab === "pr" ? "active" : ""}`} onClick={() => setTab("pr")}>
          <IconExternal size={12} /> PR <span className="scm-tab-count">#247</span>
        </button>
        <button className={`scm-tab ${tab === "log" ? "active" : ""}`} onClick={() => setTab("log")}>
          <IconTerminal size={12} /> Log
        </button>
      </div>

      <div className="scm-body">
        {tab === "changes" && (
          <>
            <div className="scm-section">
              <div className="scm-section-head">
                <span>Staged</span>
                <span className="scm-section-count">2</span>
              </div>
              <div className="scm-file">
                <span className="scm-badge M">M</span>
                <span className="scm-file-name"><span className="scm-file-path">crates/ledger/src/</span>poll.rs</span>
              </div>
              <div className="scm-file">
                <span className="scm-badge M">M</span>
                <span className="scm-file-name"><span className="scm-file-path">crates/ledger/</span>CHANGELOG.md</span>
              </div>
            </div>
            <div className="scm-section">
              <div className="scm-section-head">
                <span>Unstaged</span>
                <span className="scm-section-count">1</span>
              </div>
              <div className="scm-file">
                <span className="scm-badge M">M</span>
                <span className="scm-file-name"><span className="scm-file-path">crates/ledger/src/tests/</span>payment_test.rs</span>
              </div>
            </div>
            <div className="scm-section" style={{ borderBottom: "none" }}>
              <div className="scm-section-head">
                <span>Branch</span>
                <span className="scm-section-count" style={{ fontFamily: "var(--font-mono)", color: "var(--accent-11)" }}>angie/fix-flaky-settle</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
                ↑2 commits · behind main by 0
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input className="chat-input" placeholder='Commit message…' style={{ flex: 1 }} />
                <button className="btn btn-primary">Commit</button>
              </div>
            </div>
          </>
        )}

        {tab === "pr" && (
          <div className="scm-pr-card">
            <div className="scm-pr-head">
              <span className="scm-pr-status open">Open</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="scm-pr-title">ledger: fix flaky settle test with <code>poll_until</code> + backoff</div>
                <div className="scm-pr-meta">#247 · angie → main · 3 files · +19 −7</div>
              </div>
            </div>
            <div className="scm-checks">
              <div className="scm-check">
                <span className="scm-check-icon"><span className="ic ok">✓</span></span>
                <span>cargo test · ledger</span>
                <span className="scm-check-time">0:42</span>
              </div>
              <div className="scm-check">
                <span className="scm-check-icon"><span className="ic ok">✓</span></span>
                <span>cargo clippy</span>
                <span className="scm-check-time">0:18</span>
              </div>
              <div className="scm-check">
                <span className="scm-check-icon"><span className="ic ok">✓</span></span>
                <span>cargo fmt check</span>
                <span className="scm-check-time">0:04</span>
              </div>
              <div className="scm-check">
                <span className="scm-check-icon"><span className="ic run">·</span></span>
                <span>integration · solana-devnet</span>
                <span className="scm-check-time">running</span>
              </div>
              <div className="scm-check">
                <span className="scm-check-icon"><span className="ic skip">-</span></span>
                <span>deploy · staging</span>
                <span className="scm-check-time">after checks</span>
              </div>
            </div>
            <div className="scm-pr-actions">
              <button className="scm-merge-btn" disabled style={{ opacity: 0.7 }}>
                <IconGit size={12} /> Waiting on integration
              </button>
              <button className="btn btn-ghost"><IconExternal size={12} /></button>
            </div>
            <div style={{ padding: "10px 12px", borderTop: "1px dashed var(--border-subtle)", fontSize: 11.5, color: "var(--fg-secondary)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AgentAvatar name="Morgan" size={22} />
                <div>
                  <div><strong style={{ color: "var(--fg-primary)", fontWeight: 500 }}>Morgan</strong> <span style={{ color: "var(--fg-muted)" }}>requested review · just now</span></div>
                  <div style={{ color: "var(--fg-muted)", marginTop: 2 }}>Auto-merge enabled · waiting on green CI.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "log" && (
          <div className="log-list">
            {[
              ["09:42:14", "info", "session.start", ['<span class="tool">claude-code</span> · session <span class="path">sess_8k2a</span>']],
              ["09:42:16", "info", "tool",          ['→ <span class="tool">read_file</span>(<span class="path">crates/ledger/src/poll.rs</span>)']],
              ["09:42:17", "ok",   "tool",          ['← 142 lines']],
              ["09:42:22", "info", "tool",          ['→ <span class="tool">grep</span>(<span class="path">"poll_until"</span>)']],
              ["09:42:22", "ok",   "tool",          ['← <span class="num">0</span> matches']],
              ["09:42:31", "info", "reason",        ["Plan: replace <code>poll()</code> with deadline-bounded retry. Extract <code>backoff</code> util."]],
              ["09:42:45", "info", "tool",          ['→ <span class="tool">str_replace</span>(<span class="path">poll.rs</span>, +14/−6)']],
              ["09:42:46", "ok",   "tool",          ['← applied']],
              ["09:42:52", "info", "tool",          ['→ <span class="tool">str_replace</span>(<span class="path">payment_test.rs</span>, +3/−1)']],
              ["09:42:53", "ok",   "tool",          ['← applied']],
              ["09:43:01", "info", "shell",         ['$ <span class="tool">cargo test</span> -p ledger']],
              ["09:43:42", "ok",   "shell",         ['12 passed · 0 failed · <span class="num">0.42</span>s']],
              ["09:43:45", "info", "tool",          ['→ <span class="tool">git_add</span>(poll.rs, CHANGELOG.md)']],
              ["09:43:45", "ok",   "tool",          ['← staged']],
              ["09:43:50", "warn", "gate",          ["awaiting integration · solana-devnet"]],
              ["09:43:55", "info", "handoff",       ['Morgan requested review from <strong>you</strong>']],
            ].map((row, i) => (
              <div key={i} className="log-row">
                <span className="log-ts">{row[0]}</span>
                <span className={`log-level ${row[1]}`}>{row[1]}</span>
                <span className="log-msg" dangerouslySetInnerHTML={{ __html: `<strong style="color:var(--accent-11);font-weight:500">${row[2]}</strong> ${row[3]}` }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---- Compose ----
const Tasks = ({ avatars = {} }) => {
  const agent = {
    name: "Angie",
    role: "agent architect",
    cli: "claude-code",
    task: "cto-pay / fix flaky settle test",
  };
  return (
    <div className="tasks3">
      <AgentPane agent={agent} avatarSrc={avatars.Angie} morganSrc={avatars.Morgan} />
      <DiffPane />
      <SCMPane />
    </div>
  );
};

Object.assign(window, { Tasks, AgentAvatar });
