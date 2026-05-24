# Karpathy Surgical Guidelines — Hermes Orchestrator Adaptation

**Hermes mode note**: The four Karpathy principles (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) are identical to the OpenClaw version.

Primary definition: `.gitops/charts/agent/skills/openclaw/karpathy-surgical-guidelines.md`

## Hermes-Specific Notes
- In code-server sessions, the "surgical" audit is easier visually (diffs, file explorer). Still enforce: child must not touch unrelated files; every change must trace to the request.
- When the child is a CLI launched inside the code-server workspace (claude, codex, cursor-agent, etc.), the same prefix + "define success criteria first, tag claims, minimal surgical edits" instruction applies.
- Goal-Driven Execution pairs naturally with code-server's built-in test runner / task UI.

Reuses the OpenClaw enforcement model. See root CLAUDE.md for the merged full text that both CLIs and humans load.

(Prepared for future hermes-specific ConfigMap glob in the chart templates.)
