import { useEffect, useId, useRef, useState } from "react";
import { useProjects } from "../state/projectContext";
import type { ProjectDescriptor } from "../api/projectApi";
import { IconPlus } from "./icons";

const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/;

export function NewProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: ProjectDescriptor) => void;
}) {
  const { createProject, projects } = useProjects();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    setName("");
    setErr(null);
    setBusy(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const trimmed = name.trim();
  const slugOk = SLUG_RE.test(trimmed);
  const duplicate = projects.some((p) => p.name === trimmed);
  const validationMsg = !trimmed
    ? null
    : !slugOk
      ? "Use lowercase letters, numbers, dots, dashes, or underscores."
      : duplicate
        ? `\"${trimmed}\" already exists in the repos folder.`
        : null;
  const canSubmit = !busy && slugOk && !duplicate;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const project = await createProject(trimmed);
      onCreated?.(project);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="modal"
      >
        <div className="modal__head">
          <div>
            <div className="section__eyebrow">New project</div>
            <div id={`${id}-title`} className="section__title">
              Start a new project
            </div>
            <div className="section__sub">
              Morgan will check GitHub for{" "}
              <span className="mono">5dlabs/&lt;name&gt;</span> — clones if it
              exists, otherwise initializes a fresh repo on the workspace PVC.
            </div>
          </div>
        </div>

        <div className="modal__body">
          <label className="field">
            <span className="field__label">Project name</span>
            <input
              ref={inputRef}
              className="field__input"
              placeholder="e.g. merkle-voice"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) {
                  e.preventDefault();
                  void submit();
                }
              }}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="field__hint">
              {validationMsg ? (
                <span style={{ color: "#f87171" }}>{validationMsg}</span>
              ) : (
                <>
                  Maps to{" "}
                  <span className="mono">
                    /workspace/repos/{trimmed || "<name>"}
                  </span>{" "}
                  on the Morgan pod.
                </>
              )}
            </span>
          </label>

          {err ? (
            <div
              className="tiny"
              style={{
                color: "#f87171",
                padding: "10px 12px",
                border: "1px solid rgba(248,113,113,0.35)",
                borderRadius: 8,
                background: "rgba(248,113,113,0.08)",
              }}
            >
              {err}
            </div>
          ) : null}
        </div>

        <div className="modal__foot">
          <button
            type="button"
            className="ghost-btn"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            <IconPlus size={12} /> {busy ? "Working…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
