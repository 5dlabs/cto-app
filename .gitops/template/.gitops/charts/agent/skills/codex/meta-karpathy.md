# Codex CLI — META v2.0 + Karpathy Surgical Charter Adaptation

Codex (and codex-acp) instances running inside the agent platform **must** follow the full integrated META v2.0 Principal Architect + Karpathy surgical guidelines.

## Core Requirements (Identical to Claude Code Path)
- **META v2.0** (R1–R11 + Zero-Pause): See primary definition in `.gitops/charts/agent/skills/openclaw/meta-principal-architect.md` and the merged text in root `CLAUDE.md`. Key for Codex: first-principles before edits, executable success criteria defined upfront, every claim tagged (executed/inspected/assumed), one pushback when warranted, reversibility checks, and (when ZP language present) continuous unbroken momentum with humanpending.md protocol + parallel threads.
- **Karpathy 4 principles**: Think Before Coding, Simplicity First, Surgical Changes (touch *only* the request), Goal-Driven Execution with verifiable checks. Primary: `.gitops/charts/agent/skills/openclaw/karpathy-surgical-guidelines.md`.

## Codex-Specific Invocation Notes
- When launched via ACP (`codex-acp`) or direct `codex` / `codex-cli` (see cliBackends and codexPlugin in values), the orchestrator or ACP dispatcher **prefixes** the session with the charter excerpt (from principalEngineer config).
- In non-interactive / yolo modes common for Codex, the prefix + the fact that the orchestrator will audit returned patches for tags, criteria evidence, and surgical scope provides the enforcement.
- Codex should produce minimal diffs that exactly match the scoped request; no drive-by refactors.
- When Zero-Pause is active in the task, Codex must ship incremental, runnable progress without artificial pauses or extra confirmation requests.

## Loading
- Workspace `CLAUDE.md` (if Codex reads root instructions).
- Explicit prefix from OpenClaw/Hermes dispatch.
- This file (mounted via future codex skills ConfigMap or referenced by orchestrator).

All 8+ CLIs in the platform (including Codex) receive uniform charter enforcement through the orchestrator layer. See also the claude-code/ skills for closely related inner-agent guidance.
