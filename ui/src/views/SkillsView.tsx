const SKILL_SETS = [
  {
    name: "Planning",
    desc: "PRD decomposition, acceptance criteria drafting, and roadmap shaping.",
  },
  {
    name: "Execution",
    desc: "Implementation playbooks, guardrails, and auto-review workflows. Includes the integrated META v2.0 Principal Architect (R1–R11 + Zero-Pause continuous execution, calibrated tags, verification by execution, pushback, reversibility, humanpending.md protocol, parallel orchestration) + Karpathy surgical (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) charters — enforced for OpenClaw/Hermes orchestrators and all 8 CLIs.",
  },
  {
    name: "Quality",
    desc: "Regression checks, QA runbooks, and release-readiness standards.",
  },
  {
    name: "Principal Engineer (META v2.0 + Karpathy)",
    desc: "First-principles decomposition, executable success criteria, (executed/inspected/assumed) reporting, one evidence-based pushback, reversibility-weighted boldness, Zero-Pause unbroken momentum (≥7 threads, humanpending.md only for true gates), and surgical minimalism. Native to every orchestrator delegation and every CLI (Claude Code, Codex, Cursor, OpenCode, Factory, Gemini, Copilot, Kimi). See CLAUDE.md, .agents/skills/, and .gitops/charts/agent/skills/.",
  },
];

export function SkillsView() {
  return (
    <div className="section pane--wide">
      <div className="chart-card">
        <div className="section__eyebrow">Agent Platform</div>
        <div className="section__title">Skills</div>
        <div className="section__sub">
          Reusable capabilities each agent can load across projects. The Principal Engineer set (META v2.0 + Karpathy) is the foundation for disciplined, verifiable, high-velocity work across OpenClaw, Hermes, and all CLIs.
        </div>
      </div>

      <div className="svc-grid">
        {SKILL_SETS.map((set) => (
          <article className="svc-card" key={set.name}>
            <div className="svc-card__tag">Skill set</div>
            <div className="svc-card__title">{set.name}</div>
            <p className="svc-card__body">{set.desc}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
