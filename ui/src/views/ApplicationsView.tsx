import { useState } from "react";
import {
  IconApps,
  IconPuzzle,
  IconCurrency,
  IconBolt,
  IconMic,
  IconCheck,
  IconSparkles,
} from "./icons";
import { APPLICATIONS, type ExtensionModule } from "./data";

type Tab = "installed" | "extensions";

export function ApplicationsView() {
  const [tab, setTab] = useState<Tab>("extensions");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(APPLICATIONS.map((m) => [m.key, !!m.active])),
  );

  return (
    <div className="section">
      <div className="tabs">
        <button
          type="button"
          className={`tab${tab === "extensions" ? " tab--active" : ""}`}
          onClick={() => setTab("extensions")}
        >
          <IconPuzzle size={12} /> Extensions
          <span className="tab__count">{APPLICATIONS.length}</span>
        </button>
        <button
          type="button"
          className={`tab${tab === "installed" ? " tab--active" : ""}`}
          onClick={() => setTab("installed")}
        >
          <IconApps size={12} /> Deployed
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
        <div className="chart-card">
          <div className="section__head">
            <div>
              <div className="section__eyebrow">ArgoCD · deployed</div>
              <div className="section__title">Live applications</div>
            </div>
          </div>
          <div className="mem-list">
            {APPLICATIONS.filter((a) => enabled[a.key]).map((a) => (
              <div className="mem-list-item" key={a.key}>
                <span>{a.name}</span>
                <span className="count">running · auto-sync</span>
              </div>
            ))}
            {Object.values(enabled).every((v) => !v) ? (
              <div className="tiny muted">No extensions enabled yet.</div>
            ) : null}
          </div>
        </div>
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
