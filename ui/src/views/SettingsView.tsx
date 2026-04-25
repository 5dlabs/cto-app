import { useState } from "react";
import {
  IconKey,
  IconEye,
  IconEyeOff,
  IconRefresh,
  IconLock,
  IconCheck,
} from "./icons";
import { SourceControlSettings } from "./SourceControlSettings";

interface ProviderKey {
  provider: string;
  placeholder: string;
  state: "active" | "missing" | "rotate-soon";
}

const INITIAL_KEYS: ProviderKey[] = [
  { provider: "Anthropic", placeholder: "sk-ant-••••••••••••••••b3f7", state: "active" },
  { provider: "OpenAI", placeholder: "sk-proj-••••••••••••9fAa", state: "active" },
  { provider: "Google AI", placeholder: "AIza••••••••••••cK2m", state: "rotate-soon" },
  { provider: "xAI", placeholder: "xai-••••••••••••7t2A", state: "active" },
  { provider: "Groq", placeholder: "gsk_••••••••••••x7yz", state: "missing" },
  { provider: "Perplexity", placeholder: "pplx-••••••••••••q9vN", state: "missing" },
  { provider: "OpenRouter", placeholder: "sk-or-••••••••••••z5bC", state: "active" },
  { provider: "HuggingFace", placeholder: "hf_••••••••••••mN4k", state: "active" },
];

type TabKey = "profile" | "keys" | "scm" | "shortcuts" | "themes" | "advanced";

export function SettingsView() {
  const [tab, setTab] = useState<TabKey>("keys");

  return (
    <div className="section">
      <div className="tabs">
        {(
          [
            ["keys", "API keys"],
            ["scm", "Source control"],
            ["profile", "Profile"],
            ["shortcuts", "Shortcuts"],
            ["themes", "Themes"],
            ["advanced", "Advanced"],
          ] as [TabKey, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`tab${tab === k ? " tab--active" : ""}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "keys" ? <KeysTab /> : null}
      {tab === "scm" ? <SourceControlSettings /> : null}
      {tab === "profile" ? <ProfileTab /> : null}
      {tab === "shortcuts" ? <ShortcutsTab /> : null}
      {tab === "themes" ? <ThemesTab /> : null}
      {tab === "advanced" ? <AdvancedTab /> : null}
    </div>
  );
}

function KeysTab() {
  const [keys, setKeys] = useState(INITIAL_KEYS);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  return (
    <>
      <div className="chart-card" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <IconLock size={16} />
        <div>
          <div className="section__title" style={{ fontSize: 14 }}>
            Secure credential management
          </div>
          <div className="section__sub">
            Keys are sealed in 5D VAULT at rest and in transit. Reveal shows a partial preview only —
            the full key is never rendered to the UI. Rotation cycles on your configured cadence.
          </div>
        </div>
      </div>

      <div className="keys-table">
        {keys.map((k) => (
          <div className="keys-row" key={k.provider}>
            <div>
              <div className="keys-row__provider">{k.provider}</div>
              <div className="tiny muted" style={{ marginTop: 2 }}>
                {k.state === "active"
                  ? "active · validated"
                  : k.state === "rotate-soon"
                    ? "rotate in 7d"
                    : "no key set"}
              </div>
            </div>
            <div className="row">
              <span className="keys-row__mask">
                <IconKey size={11} />
                {revealed[k.provider] ? k.placeholder.replace(/•/g, "x") : k.placeholder}
              </span>
              <span
                className={`chip chip--${k.state === "active" ? "success" : k.state === "rotate-soon" ? "warn" : "danger"}`}
              >
                {k.state === "active" ? (
                  <>
                    <IconCheck size={10} /> valid
                  </>
                ) : k.state === "rotate-soon" ? (
                  "rotate"
                ) : (
                  "missing"
                )}
              </span>
            </div>
            <div className="keys-row__actions">
              <button
                type="button"
                className="icon-btn"
                aria-label="Toggle preview"
                onClick={() =>
                  setRevealed((r) => ({ ...r, [k.provider]: !r[k.provider] }))
                }
              >
                {revealed[k.provider] ? <IconEyeOff size={12} /> : <IconEye size={12} />}
              </button>
              <button type="button" className="icon-btn" aria-label="Rotate">
                <IconRefresh size={12} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label="Delete"
                onClick={() =>
                  setKeys((cur) => cur.map((x) => (x.provider === k.provider ? { ...x, state: "missing" } : x)))
                }
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="chart-card">
        <div className="section__eyebrow">Add provider</div>
        <div className="field">
          <label className="field__label">Provider</label>
          <input className="field__input" placeholder="e.g. Mistral, Cohere, Fireworks" />
        </div>
        <div className="field">
          <label className="field__label">API key</label>
          <input
            className="field__input"
            placeholder="Paste key — it's sealed on save and never displayed again"
            type="password"
          />
          <span className="field__help">
            Sealed with 5D VAULT. Validation runs a no-cost ping to the provider before saving.
          </span>
        </div>
        <div className="row row--end">
          <button type="button" className="ghost-btn">
            Validate
          </button>
          <button type="button" className="primary-btn">
            Save
          </button>
        </div>
      </div>
    </>
  );
}

function ProfileTab() {
  return (
    <div className="chart-card">
      <div className="field-row">
        <div className="field">
          <label className="field__label">Name</label>
          <input className="field__input" defaultValue="Jonathon" />
        </div>
        <div className="field">
          <label className="field__label">Email</label>
          <input className="field__input" defaultValue="admin@5dlabs.ai" />
        </div>
      </div>
      <div className="field">
        <label className="field__label">Handle</label>
        <input className="field__input" defaultValue="jonathon" />
      </div>
      <div className="field">
        <label className="field__label">Timezone</label>
        <input className="field__input" defaultValue="America/Los_Angeles" />
      </div>
    </div>
  );
}

function ShortcutsTab() {
  const rows = [
    ["⌘K", "Open command palette"],
    ["⌘⇧N", "New agent"],
    ["⌘⇧P", "New project"],
    ["⌘,", "Settings"],
    ["⌘1–9", "Jump to sidebar item"],
  ];
  return (
    <div className="chart-card">
      <div className="mem-list">
        {rows.map(([k, v]) => (
          <div className="mem-list-item" key={k}>
            <span>{v}</span>
            <span className="count">{k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemesTab() {
  return (
    <div className="chart-card">
      <div className="section__eyebrow">Motif</div>
      <div className="row row--wrap" style={{ marginTop: 6 }}>
        {["cyan", "violet", "amber", "forest", "crimson"].map((m) => (
          <span className="chip" key={m}>
            {m}
          </span>
        ))}
      </div>
      <div className="tiny muted" style={{ marginTop: 10 }}>
        Motif swaps the accent hue & chroma tokens globally. Density, radius, and type scale live on
        separate axes.
      </div>
    </div>
  );
}

function AdvancedTab() {
  return (
    <div className="chart-card">
      <div className="mem-list">
        <div className="mem-list-item">
          <span>Telemetry</span>
          <span className="count">anonymized · on</span>
        </div>
        <div className="mem-list-item">
          <span>Crash reports</span>
          <span className="count">on</span>
        </div>
        <div className="mem-list-item">
          <span>Dev tools</span>
          <span className="count">off</span>
        </div>
        <div className="mem-list-item">
          <span>Experimental features</span>
          <span className="count">off</span>
        </div>
      </div>
    </div>
  );
}
