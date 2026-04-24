/**
 * Small inline pill that renders a project's current lifecycle phase as
 * reported by the sidecar via `.plan/status.txt`. Ships ahead of the
 * sidecar that populates `status` — when the field is absent or empty
 * the component returns `null`, so the card layout is unchanged until
 * the backend catches up.
 */

import type { ProjectStatus } from "../../api/projectApi";

type Props = { status: ProjectStatus | null | undefined };

type ChipVariant = "default" | "info" | "success" | "warn" | "teal";

const PHASE_VARIANT: Record<string, ChipVariant> = {
  new: "default",
  intake: "info",
  ready: "success",
  implementing: "warn",
  complete: "teal",
};

function titleCase(phase: string): string {
  if (!phase) return phase;
  return phase.charAt(0).toUpperCase() + phase.slice(1).toLowerCase();
}

function formatUpdated(updated: string | null): string | undefined {
  if (!updated) return undefined;
  const d = new Date(updated);
  if (Number.isNaN(d.getTime())) {
    return `Phase updated at ${updated}`;
  }
  return `Phase updated at ${d.toLocaleString()}`;
}

export function PhaseChip({ status }: Props) {
  if (!status) return null;
  const phase = (status.phase ?? "").trim();
  if (!phase) return null;

  const key = phase.toLowerCase();
  const variant = PHASE_VARIANT[key] ?? "default";
  const label = PHASE_VARIANT[key] ? titleCase(key) : phase;
  const className =
    variant === "default" ? "chip" : `chip chip--${variant}`;

  return (
    <span
      className={className}
      title={formatUpdated(status.updated)}
      aria-label={`Project phase: ${label}`}
    >
      {label}
    </span>
  );
}
