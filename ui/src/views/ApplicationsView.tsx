import { useState } from "react";
import {
  IconPuzzle,
  IconCurrency,
  IconBolt,
  IconMic,
  IconCheck,
  IconSparkles,
  IconActivity,
  IconCpu,
  IconDatabase,
  IconRefresh,
} from "./icons";
import { APPLICATIONS, type ExtensionModule } from "./data";

type Tab = "runtime" | "extensions";

type Pod = {
  name: string;
  namespace: string;
  containers: { name: string; status: "running" | "pending" | "error" }[];
  status: "Running" | "Pending" | "Error" | "CrashLoopBackOff";
  restarts: number;
  age: string;
};

const PODS: Pod[] = [
  {
    name: "narrator-85c64ccb7c-99glr",
    namespace: "cto",
    containers: [{ name: "narrator", status: "running" }],
    status: "Running",
    restarts: 0,
    age: "2h14m",
  },
  {
    name: "musetalk-worker-79f8b49d64-5trhf",
    namespace: "cto",
    containers: [{ name: "worker", status: "running" }],
    status: "Running",
    restarts: 0,
    age: "2h17m",
  },
  {
    name: "hunyuan-avatar-worker-5c7d9b-qk2fn",
    namespace: "cto",
    containers: [{ name: "worker", status: "running" }],
    status: "Running",
    restarts: 0,
    age: "2h19m",
  },
  {
    name: "rex-coderun-feat-narrator-a8f2",
    namespace: "cto",
    containers: [
      { name: "agent", status: "running" },
      { name: "code-server", status: "running" },
      { name: "narrator-musetalk", status: "running" },
      { name: "narrator-hunyuan", status: "running" },
    ],
    status: "Running",
    restarts: 0,
    age: "34m",
  },
  {
    name: "blaze-coderun-ui-tokens-4c1d",
    namespace: "cto",
    containers: [
      { name: "agent", status: "running" },
      { name: "code-server", status: "running" },
    ],
    status: "Running",
    restarts: 0,
    age: "12m",
  },
  {
    name: "morgan-intake-6b4f8c9d5-n2xqp",
    namespace: "cto",
    containers: [{ name: "moderator", status: "running" }],
    status: "Running",
    restarts: 1,
    age: "8h02m",
  },
];

const ARGO_APPS = [
  { name: "cto-controller", sync: "Synced", health: "Healthy" },
  { name: "openclaw-agent", sync: "Synced", health: "Healthy" },
  { name: "narrator-sidecar", sync: "Synced", health: "Healthy" },
  { name: "musetalk-worker", sync: "Synced", health: "Healthy" },
  { name: "hunyuan-avatar-worker", sync: "Synced", health: "Progressing" },
];

const LOG_LINES = [
  `{"ts":"17:42:03.812","lvl":"info","mod":"acp","session":"a8f2","msg":"session/prompt received (user)"}`,
  `{"ts":"17:42:03.891","lvl":"info","mod":"agent","session":"a8f2","tool":"view","path":"crates/acp-runtime/src/server.rs"}`,
  `{"ts":"17:42:04.104","lvl":"info","mod":"agent","session":"a8f2","tool":"edit","path":"crates/acp-runtime/src/server.rs","lines":18}`,
  `{"ts":"17:42:04.510","lvl":"info","mod":"narrator","backend":"musetalk","phrase":"I'm opening the ACP server to wire the interrupt channel."}`,
  `{"ts":"17:42:05.223","lvl":"info","mod":"agent","session":"a8f2","tool":"bash","cmd":"cargo check -p acp-runtime"}`,
  `{"ts":"17:42:11.447","lvl":"info","mod":"agent","session":"a8f2","tool":"bash","rc":0,"dur_ms":6104}`,
  `{"ts":"17:42:11.502","lvl":"info","mod":"narrator","backend":"musetalk","phrase":"Check passes — moving on to the CRD mirror."}`,
];

export function ApplicationsView() {
  const [tab, setTab] = useState<Tab>("runtime");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(APPLICATIONS.map((m) => [m.key, !!m.active])),
  );
  const [selectedPod, setSelectedPod] = useState<string>(PODS[3]!.name);
  const [selectedContainer, setSelectedContainer] = useState<string>("agent");
  const [nsFilter, setNsFilter] = useState<string>("all");

  const pods = nsFilter === "all" ? PODS : PODS.filter((p) => p.namespace === nsFilter);
  const activePod = PODS.find((p) => p.name === selectedPod) ?? PODS[0]!;
  const runningCount = PODS.filter((p) => p.status === "Running").length;
  const pendingCount = PODS.filter((p) => p.status === "Pending").length;
  const errorCount = PODS.length - runningCount - pendingCount;

  return (
    <div className="section">
      <div className="tabs">
        <button
          type="button"
          className={`tab${tab === "runtime" ? " tab--active" : ""}`}
          onClick={() => setTab("runtime")}
        >
          <IconActivity size={12} /> Runtime
          <span className="tab__count">{PODS.length}</span>
        </button>
        <button
          type="button"
          className={`tab${tab === "extensions" ? " tab--active" : ""}`}
          onClick={() => setTab("extensions")}
        >
          <IconPuzzle size={12} /> Extensions
          <span className="tab__count">{APPLICATIONS.length}</span>
        </button>
      </div>

      {tab === "extensions" ? (
        <>
          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">Applications store</div>
                <div className="section__title">Extensions you can deploy</div>
                <div className="section__sub">
                  Optional vertical packs — each ships with its own agents, prompts, and dashboards.
                  Enable to install into this workspace; disable to archive without losing state.
                </div>
              </div>
            </div>
            <div className="ext-grid">
              {APPLICATIONS.map((m) => (
                <ExtCard
                  key={m.key}
                  module={m}
                  on={enabled[m.key]}
                  onToggle={(v) =>
                    setEnabled((prev) => ({ ...prev, [m.key]: v }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">Build your own</div>
                <div className="section__title">Publish an extension</div>
                <div className="section__sub">
                  Bundle agents, skills, and dashboards as a signed 5D extension package. Optionally
                  publish on-chain for verified distribution.
                </div>
              </div>
              <div className="row">
                <button type="button" className="ghost-btn">
                  <IconSparkles size={12} /> Docs
                </button>
                <button type="button" className="primary-btn">
                  New extension
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="runtime-stats">
            <div className="runtime-stat">
              <div className="runtime-stat__eyebrow">Pods</div>
              <div className="runtime-stat__value">{PODS.length}</div>
              <div className="runtime-stat__sub">
                <span className="dot dot--ok" /> {runningCount} running
                {pendingCount ? <> · <span className="dot dot--warn" /> {pendingCount} pending</> : null}
                {errorCount ? <> · <span className="dot dot--err" /> {errorCount} error</> : null}
              </div>
            </div>
            <div className="runtime-stat">
              <div className="runtime-stat__eyebrow">CPU · cluster</div>
              <div className="runtime-stat__value">18.4<span className="runtime-stat__unit"> cores</span></div>
              <div className="runtime-stat__sub">of 32 · 57%</div>
            </div>
            <div className="runtime-stat">
              <div className="runtime-stat__eyebrow">Memory · cluster</div>
              <div className="runtime-stat__value">84.2<span className="runtime-stat__unit"> GiB</span></div>
              <div className="runtime-stat__sub">of 192 · 43%</div>
            </div>
            <div className="runtime-stat">
              <div className="runtime-stat__eyebrow">ArgoCD</div>
              <div className="runtime-stat__value">{ARGO_APPS.filter((a) => a.sync === "Synced").length}<span className="runtime-stat__unit"> / {ARGO_APPS.length}</span></div>
              <div className="runtime-stat__sub">synced</div>
            </div>
          </div>

          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">Cluster · cto namespace</div>
                <div className="section__title">Pods</div>
              </div>
              <div className="row">
                <select
                  className="ghost-btn"
                  value={nsFilter}
                  onChange={(e) => setNsFilter(e.target.value)}
                >
                  <option value="all">All namespaces</option>
                  <option value="cto">cto</option>
                </select>
                <button type="button" className="ghost-btn">
                  <IconRefresh size={12} /> Refresh
                </button>
              </div>
            </div>
            <div className="pod-table">
              <div className="pod-table__head">
                <span>Name</span>
                <span>Namespace</span>
                <span>Containers</span>
                <span>Status</span>
                <span className="pod-table__num">Restarts</span>
                <span className="pod-table__num">Age</span>
              </div>
              {pods.map((p) => (
                <button
                  type="button"
                  key={p.name}
                  className={`pod-table__row${p.name === selectedPod ? " pod-table__row--active" : ""}`}
                  onClick={() => {
                    setSelectedPod(p.name);
                    setSelectedContainer(p.containers[0]?.name ?? "");
                  }}
                >
                  <span className="pod-table__name">{p.name}</span>
                  <span className="muted tiny">{p.namespace}</span>
                  <span className="pod-table__dots">
                    {p.containers.map((c) => (
                      <span
                        key={c.name}
                        className={`dot dot--${c.status === "running" ? "ok" : c.status === "pending" ? "warn" : "err"}`}
                        title={`${c.name} · ${c.status}`}
                      />
                    ))}
                  </span>
                  <span className={`chip chip--${p.status === "Running" ? "success" : p.status === "Pending" ? "warn" : "danger"}`}>
                    {p.status}
                  </span>
                  <span className="pod-table__num tiny muted">{p.restarts}</span>
                  <span className="pod-table__num tiny muted">{p.age}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">
                  <IconCpu size={10} /> Logs · {activePod.name}
                </div>
                <div className="section__title">Container output</div>
              </div>
              <div className="row">
                <select
                  className="ghost-btn"
                  value={selectedContainer}
                  onChange={(e) => setSelectedContainer(e.target.value)}
                >
                  {activePod.containers.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <button type="button" className="ghost-btn">
                  <IconRefresh size={12} /> Tail
                </button>
              </div>
            </div>
            <pre className="log-panel">
              {LOG_LINES.map((l, i) => (
                <div key={i} className="log-line">{l}</div>
              ))}
            </pre>
          </div>

          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">
                  <IconDatabase size={10} /> ArgoCD · applications
                </div>
                <div className="section__title">Sync &amp; health</div>
              </div>
            </div>
            <div className="argo-grid">
              {ARGO_APPS.map((a) => (
                <div className="argo-card" key={a.name}>
                  <div className="argo-card__name">{a.name}</div>
                  <div className="argo-card__row">
                    <span className={`chip chip--${a.sync === "Synced" ? "success" : "warn"}`}>
                      <IconCheck size={10} /> {a.sync}
                    </span>
                    <span className={`chip chip--${a.health === "Healthy" ? "success" : "warn"}`}>
                      {a.health}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ExtCard({
  module,
  on,
  onToggle,
}: {
  module: ExtensionModule;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  const Icon =
    module.key === "accounting"
      ? IconCurrency
      : module.key === "marketing"
        ? IconSparkles
        : module.key === "rms"
          ? IconBolt
          : IconMic;
  return (
    <div className="ext-card">
      <div className="ext-card__head">
        <div className="ext-card__icon">
          <Icon size={18} />
        </div>
        <div>
          <div className="ext-card__name">{module.name}</div>
          <div className="tiny muted">{module.short}</div>
        </div>
      </div>
      <p className="ext-card__desc">{module.description}</p>
      <div className="ext-card__foot">
        <span className={`chip chip--${on ? "success" : "warn"}`}>
          {on ? (
            <>
              <IconCheck size={10} /> Enabled
            </>
          ) : (
            "Disabled"
          )}
        </span>
        <button
          type="button"
          className={on ? "ghost-btn" : "primary-btn"}
          onClick={() => onToggle(!on)}
        >
          {on ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  );
}
