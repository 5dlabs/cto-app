import { useState } from "react";
import {
  IconCurrency,
  IconBolt,
  IconMic,
  IconCheck,
  IconSparkles,
  IconShield,
} from "./icons";
import { APPLICATIONS, type ExtensionModule } from "./data";

export function ExtensionsView() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(APPLICATIONS.map((module) => [module.key, !!module.active])),
  );

  return (
    <div className="section">
      <div className="chart-card">
        <div className="section__head">
          <div>
            <div className="section__eyebrow">Extensions catalog</div>
            <div className="section__title">Third-party and vertical packs</div>
            <div className="section__sub">
              Install optional extensions without mixing them into core runtime applications.
              Placeholder examples include RMS, Accounting, Legal, and Marketing.
            </div>
          </div>
        </div>
        <div className="ext-grid">
          {APPLICATIONS.map((module) => (
            <ExtCard
              key={module.key}
              module={module}
              on={enabled[module.key]}
              onToggle={(value) => setEnabled((previous) => ({ ...previous, [module.key]: value }))}
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
  onToggle: (value: boolean) => void;
}) {
  const Icon =
    module.key === "accounting"
      ? IconCurrency
      : module.key === "marketing"
        ? IconSparkles
        : module.key === "rms"
          ? IconBolt
          : module.key === "legal"
            ? IconShield
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
