const SKILL_SETS = [
  {
    name: "Planning",
    desc: "PRD decomposition, acceptance criteria drafting, and roadmap shaping.",
  },
  {
    name: "Execution",
    desc: "Implementation playbooks, guardrails, and auto-review workflows.",
  },
  {
    name: "Quality",
    desc: "Regression checks, QA runbooks, and release-readiness standards.",
  },
];

export function SkillsView() {
  return (
    <div className="section pane--wide">
      <div className="chart-card">
        <div className="section__eyebrow">Agent Platform</div>
        <div className="section__title">Skills</div>
        <div className="section__sub">
          Reusable capabilities each agent can load across projects. This is a placeholder surface
          for skill libraries, versioning, and assignment policies.
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
