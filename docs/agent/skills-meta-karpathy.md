# Agent Skills: META v2.0 + Karpathy Surgical Guidelines

This document describes how the integrated META v2.0 Principal Architect (11 rules + Zero-Pause) and Karpathy (4 principles) charters are delivered and enforced across the 5D Labs CTO agent platform for **all 8+ CLIs** and both harnesses (OpenClaw primary, Hermes).

**Golden Rule**: The OpenClaw (and Hermes) orchestrator is the universal enforcement layer. It guarantees the charters travel to every CLI regardless of native support.

## Workspace / Local Loading (applies to all CLIs that read root or cwd files)
- `CLAUDE.md` (root) — merged full charter; auto-loaded by Claude Code, many Cursor sessions, some others.
- `.agents/skills/meta-principal-architect/SKILL.md` and `karpathy-guidelines/SKILL.md` — Cursor local agent skill format (frontmatter + content).
- `.cursor/rules/karpathy-guidelines.mdc` and `meta-principal-architect.mdc` — Cursor IDE project rules (alwaysApply).
- `skills-lock.json` — registers the local skills for the Cursor environment.

## OpenClaw Harness (Primary Orchestrator)
- Skills mounted at `/workspace/.openclaw/skills/` via ConfigMap (see `templates/configmap-openclaw-skills.yaml` glob `skills/openclaw/*.md`).
- New files:
  - `openclaw/meta-principal-architect.md`
  - `openclaw/karpathy-surgical-guidelines.md`
- The orchestrator skill (`orchestrator.md`) now references them and requires pre-delegation checklist + prefix for **every** child invocation (exec, ACP, direct CLI).
- `values.yaml` + `ci/values-morgan.yaml` now document `tools.principalEngineer.prefixExcerpt` (short form used in dispatch).
- All 12+ agents listed in acp.allowedAgents (claude, codex, opencode, gemini, kimi, copilot, cursor, pi, droid, kilocode, kiro, qwen, iflow, ...) receive the same treatment.

## Hermes Harness
- Equivalent skills under `skills/hermes/` (pointers + Hermes-specific notes for code-server context).
- Same prefix + review protocol when delegating from Hermes orchestrator instances.
- Code-server sidecar makes visual surgical audits easier; charters still mandatory.

## Primary CLIs with Tailored Support
- **Claude Code**: `skills/claude-code/general-coding.md` updated with charter section + reference to openclaw/ files. Also loads root CLAUDE.md.
- **Codex / codex-acp**: `skills/codex/meta-karpathy.md` + codexPlugin comments + principalEngineer prefix in ACP paths.
- **Cursor (CLI + IDE)**: Covered by .cursor/rules/ + .agents/skills/ + CLAUDE.md + orchestrator prefix when invoked inside pods.

## Remaining / Agnostic CLIs (OpenCode, Factory, Gemini, Copilot, Kimi, and future)
- **Universal fallback**: `skills/cli-agnostic/meta-karpathy-universal.md`
  - Plain markdown excerpt (self-contained, prefix-friendly).
  - Orchestrator cats or injects this (or the principalEngineer prefixExcerpt) into any exec / ACP session start / --system for CLIs lacking native .md or CLAUDE.md loading.
- **Per-CLI activation notes** (orchestrator implements; documented here for transparency):
  - **Gemini CLI** (`gemini --experimental-acp ...`): Pass charter via any `--system` / prompt prefix flag if supported by the version; otherwise rely 100% on orchestrator prefix + post-audit.
  - **Copilot CLI** (`copilot --acp --yolo ...`): yolo/non-interactive modes still receive the prefix; orchestrator audits the produced patches for (executed) evidence, surgical scope, and tags.
  - **Kimi / OpenCode / Factory / others**: Same — prefix at launch + orchestrator review is the contract. When the CLI supports a system prompt or instruction file, the universal.md or full CLAUDE.md excerpt is supplied.
  - **"pi", "droid", "kilocode", "kiro", "qwen", "iflow"** (extended list in morgan CI): Treated identically via the allowedAgents ACP path and the same prefix mechanism.

## GitOps Template Sync
All new skill files under `.gitops/charts/agent/skills/{openclaw,hermes,claude-code,codex,cli-agnostic}/` are mirrored into `.gitops/template/.gitops/charts/agent/skills/...` so new CTO instances generated from the template receive the charters automatically.

## UI Exposure
The Skills view in the CTO Desktop app lists "Principal Engineer (META v2.0 + Karpathy)" as a core skill set under Execution (see `ui/src/views/SkillsView.tsx`).

## Morgan / Setup Narration
The 06_clis screen already correctly lists the 8 CLIs that CTO coordinates. No narration change required; the charters are an internal enforcement upgrade.

## Verification (in-cluster)
After deploy:
```bash
# Inside an agent pod
ls /workspace/.openclaw/skills/ | grep -E 'meta|karpathy|universal'
cat /workspace/.openclaw/skills/openclaw/meta-principal-architect.md | head -20
# Check that a delegated Claude/Codex/etc. session received the prefix (logs or ACP stream)
```

## References
- Full META v2.0: https://github.com/entropyvortex/meta-llm-charter (CLAUDE.md, evals/)
- Full Karpathy: https://github.com/multica-ai/andrej-karpathy-skills
- Platform AGENTS.md (now includes the charters as Required Rule #1)
- Root CLAUDE.md (the single source of truth for merged text)

**OpenClaw everything**: The orchestrator layer + universal prefix + workspace drop-ins + ConfigMap mounting = 100% coverage for all CLIs and both harnesses with minimal per-CLI code. Discipline and velocity, everywhere.
