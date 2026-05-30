# META v2.0 Principal Architect — Hermes Orchestrator Adaptation

**Hermes mode note**: This harness emphasizes code-server (VS Code Web) + direct shell access for agents. The META charter (Bias, META-0, R1–R11 + full Zero-Pause ZPR1–ZPR4) is **identical** to the OpenClaw version and is the law for all work.

See the primary implementation and pre-delegation checklist in the sibling chart path:
`.gitops/charts/agent/skills/openclaw/meta-principal-architect.md`

## Hermes-Specific Enforcement
- When delegating via code-server shell, `exec`, or ACP, still prefix the exact charter excerpt (including ZP if active) and require the child (Claude, Codex, Cursor CLI, etc. running inside the code-server or as sidecar) to honor tags, executable success criteria, surgical scope, and continuous momentum.
- Humanpending.md (when ZP active) lives at the workspace root or /workspace/humanpending.md and is visible in the code-server UI.
- Ground Truth Canvas can be maintained in a dedicated markdown file or code-server workspace note for long-running Hermes sessions.
- All 8 CLIs (and the extended list in values) receive the same prefix + post-review enforcement regardless of harness.

The OpenClaw orchestrator skills are the reference implementation; Hermes reuses the same rules and prefix protocol. Full charters in root CLAUDE.md + workspace .agents/skills/.

(When a dedicated hermes skills ConfigMap template is added, this file will be included automatically via glob.)
