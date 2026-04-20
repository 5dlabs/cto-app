import { useState } from "react";
import {
  IconClose,
  IconUpload,
  IconPlus,
  IconCheck,
  IconExternal,
  IconSparkles,
  IconGit,
  IconLock,
  IconUsers,
} from "./icons";
import { AGENT_ASSETS } from "./data";

interface NewAgentModalProps {
  open: boolean;
  onClose: () => void;
}

type ManifestState = "valid" | "missing" | "unsupported";

export function NewAgentModal({ open, onClose }: NewAgentModalProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [manifest, setManifest] = useState<Record<string, ManifestState>>(() =>
    Object.fromEntries(AGENT_ASSETS.map((a) => [a.name, a.required ? "missing" : "missing"])),
  );
  const [publishing, setPublishing] = useState(false);
  const [phantomStatus, setPhantomStatus] = useState<
    "idle" | "connecting" | "connected" | "unavailable"
  >("idle");

  if (!open) return null;

  const requiredMissing = AGENT_ASSETS.filter(
    (a) => a.required && manifest[a.name] !== "valid",
  ).length;

  const markAsset = (name: string, state: ManifestState) =>
    setManifest((cur) => ({ ...cur, [name]: state }));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    dropped.forEach((f) => {
      const match = AGENT_ASSETS.find((a) => a.name.toLowerCase() === f.name.toLowerCase());
      if (match) {
        markAsset(match.name, "valid");
      } else if (
        f.name.toLowerCase().endsWith(".md") ||
        f.name.toLowerCase().endsWith(".txt")
      ) {
        markAsset("System prompt", "valid");
      }
    });
  };

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setAvatar(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <IconSparkles size={14} />
          <div className="modal__title">New agent</div>
          <div className="modal__sub">Define persona, tools, and assets</div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <IconClose size={14} />
          </button>
        </div>

        <div className="modal__body">
          {/* Identity */}
          <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
            <label className="avatar-drop" style={{ cursor: "pointer" }}>
              {avatar ? (
                <img src={avatar} alt="avatar" />
              ) : (
                <div style={{ textAlign: "center", color: "var(--fg-muted)" }}>
                  <IconUpload size={18} />
                  <div className="tiny" style={{ marginTop: 4 }}>
                    Upload
                  </div>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleAvatar}
              />
            </label>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field">
                <label className="field__label">Name</label>
                <input
                  className="field__input"
                  placeholder="e.g. Cipher, Blaze, Atlas"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label">Role / tagline</label>
                <input
                  className="field__input"
                  placeholder="Security lead · vuln triage and remediation"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* GitHub tool URLs */}
          <div className="field">
            <label className="field__label">GitHub tool URLs</label>
            <div className="url-list">
              {urls.map((u, i) => (
                <div className="url-list__item" key={i}>
                  <input
                    className="field__input"
                    placeholder="https://github.com/org/tool"
                    value={u}
                    onChange={(e) =>
                      setUrls((cur) => cur.map((x, idx) => (idx === i ? e.target.value : x)))
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label="Remove URL"
                    onClick={() =>
                      setUrls((cur) => (cur.length > 1 ? cur.filter((_, idx) => idx !== i) : cur))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ghost-btn"
                style={{ alignSelf: "flex-start" }}
                onClick={() => setUrls((cur) => [...cur, ""])}
              >
                <IconPlus size={12} /> Add URL
              </button>
            </div>
            <span className="field__help">
              One per line. Agents inherit these as default tool entry points — validated on save.
            </span>
          </div>

          {/* Assets drop */}
          <div className="field">
            <label className="field__label">OpenClaw / OpenCode assets</label>
            <div
              className={`dropzone${dragOver ? " dropzone--over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <div className="dropzone__icon">
                <IconUpload size={24} />
              </div>
              Drag AGENTS.md, SOUL.md, SKILL.md, system prompt, IDENTITY.md, TOOLS.md…
              <div className="dropzone__hint">
                Or click to browse. Unknown filenames are flagged as unsupported.
              </div>
            </div>

            <div className="manifest">
              {AGENT_ASSETS.map((a) => {
                const state = manifest[a.name];
                return (
                  <div
                    key={a.name}
                    className={`manifest__row manifest__row--${state}`}
                  >
                    {state === "valid" ? <IconCheck size={12} /> : <span />}
                    <div>
                      <span className="manifest__name">{a.name}</span>
                      <span className="tiny muted" style={{ marginLeft: 8 }}>
                        {a.blurb}
                      </span>
                    </div>
                    <span className="manifest__state">
                      {state === "valid" ? "✓ valid" : a.required ? "required" : "optional"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* On-chain publish */}
          <div className="chart-card" style={{ borderColor: "var(--accent-border)" }}>
            <div className="section__head">
              <div>
                <div className="section__eyebrow">
                  <IconLock size={11} /> Publish on-chain
                </div>
                <div className="section__title">Solana · Phantom wallet</div>
                <div className="section__sub">
                  Optionally publish a verified manifest of this agent to Solana. Phantom behavior in
                  desktop context is currently unverified — if Phantom is unavailable we'll fall back
                  to the 5D-signed registry.
                </div>
              </div>
              <div className="row">
                <span
                  className={`chip chip--${phantomStatus === "connected" ? "success" : phantomStatus === "unavailable" ? "danger" : phantomStatus === "connecting" ? "warn" : "accent"}`}
                >
                  {phantomStatus === "idle"
                    ? "not connected"
                    : phantomStatus === "connecting"
                      ? "connecting…"
                      : phantomStatus === "connected"
                        ? "connected"
                        : "fallback · 5D-signed"}
                </span>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setPhantomStatus("connecting");
                    setTimeout(() => setPhantomStatus("unavailable"), 1000);
                  }}
                >
                  <IconExternal size={11} /> Connect Phantom
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal__foot">
          <div className="row">
            <span className="tiny muted">
              {requiredMissing > 0
                ? `${requiredMissing} required asset${requiredMissing === 1 ? "" : "s"} missing`
                : "All required assets present"}
            </span>
          </div>
          <div className="row">
            <button type="button" className="ghost-btn" onClick={onClose}>
              Save as draft
            </button>
            <button type="button" className="ghost-btn">
              <IconUsers size={12} /> Create
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={requiredMissing > 0 || publishing}
              onClick={() => {
                setPublishing(true);
                setTimeout(() => {
                  setPublishing(false);
                  onClose();
                }, 900);
              }}
            >
              <IconGit size={12} /> {publishing ? "Publishing…" : "Publish on-chain"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
