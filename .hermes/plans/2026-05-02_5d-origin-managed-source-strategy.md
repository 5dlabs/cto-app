# 5D Origin managed source-control strategy

Date: 2026-05-02
Scope: Product strategy note for whether CTO should sell a managed source-control/CI/CD service, versus only installing Morgan apps into GitHub/GitLab.

> Practical product/technical strategy, not legal advice. Counsel review is required before shipping a fork/rebrand/managed service around Gitea, GitLab CE, or any third-party trademarks.

## Executive takeaways

1. **The lowest-friction default remains provider app install.** Most initial CTO users likely already live in GitHub or GitLab. The first-run Source step should recommend installing Morgan into the detected existing provider, not ask them to migrate before they have value.
2. **5D Origin should not initially mean “we sell both Gitea and GitLab as equal bundled products.”** It should mean: CTO-managed Git + agent operations plane. Under the hood, we can offer engines/flavors only when needed.
3. **The viable wedge is not generic source hosting.** GitHub/GitLab already win at generic repo hosting. CTO’s wedge is source control designed for autonomous agents: isolated workspaces, policy-gated PRs, secrets-safe CI, generated GitOps, reproducible CodeRun environments, and Morgan-managed migration/mirroring.
4. **Gitea/Forgejo-style lightweight Git is probably the best owned/default substrate if license/trademark review clears.** It is smaller, easier to operate in customer/desktop clusters, and Gitea Actions exists. Treat it as an agent-native control plane we can shape.
5. **GitLab CE is better as a compatibility/integration option than as our default owned product.** It brings mature CI/CD concepts and GitLab familiarity, but is heavier and more trademark/licensing sensitive. Position it as `GitLab-compatible [GitLab CE]` or a CTO-managed service/integration for teams already needing GitLab workflows.
6. **Migration has to be gradual.** The compelling path is `install app -> mirror selected repos -> prove agent/CI value -> optional cutover`, not `move all repos to CTO on day one`.

## What are we selling?

Sell **CTO-managed development operations**, not just repo hosting:

- Source-of-truth connections to GitHub/GitLab.
- Morgan/agent app install and permissions brokering.
- Agent workspaces and CodeRun execution connected to repos.
- Policy around PR creation/review/merge, branch protection, secrets, tools, model access, and deployment.
- Optional CTO-hosted source control for customers who need sovereignty, offline/local operation, lower cost, or agent-native flows.

In this framing, **5D Origin** is not “Gitea + GitLab.” It is the CTO-owned source/CI control surface with implementation choices:

- **Origin Connect**: stay on GitHub/GitLab; Morgan app installed; CTO operates around existing source.
- **Origin Standard**: CTO-managed lightweight Git service, likely Gitea/Forgejo-derived if approved, with agent-native defaults.
- **Origin GitLab-compatible**: self-managed GitLab CE path or GitLab-compatible migration target for teams that need GitLab-style CI/workflows.

The setup UI can still stay simple: `GitHub`, `GitLab`, `5D Origin`. Internally/product-wise, 5D Origin should be a destination/off-ramp plus operating layer, not a forced replacement.

## Why build a managed source-control lane at all?

Potential advantages:

- **Sovereignty/local-first:** CTO Desktop can run customer-controlled source + CI inside their CTO environment, not only SaaS GitHub/GitLab.
- **Agent security:** Easier to enforce least-privilege repo mirrors, ephemeral branches, redacted logs, approval gates, and non-human authoring policy.
- **Cost and packaging:** Customers may prefer bundled source/CI for smaller teams, private/internal projects, demos, regulated deployments, or air-gapped-ish environments.
- **GitOps ownership:** CTO can make generated repos, Argo apps, chart releases, and environment templates first-class without fighting provider differences.
- **Migration/off-ramp:** If CTO proves value around GitHub first, 5D Origin becomes a natural optional destination.

Risks:

- **Generic hosting is commoditized.** Competing with GitHub/GitLab on normal repo UX is a losing first wedge.
- **CI/CD depth is expensive.** GitLab CI is mature; matching it fully is a long road.
- **Operational burden:** Backups, upgrades, auth, runners, storage, webhooks, package registries, audit logs, and compliance become our support surface.
- **Trademark/licensing complexity:** Especially GitLab. Avoid rebranding GitLab as CTO-owned.

## Gitea vs GitLab CE as substrate

### Gitea / Forgejo-style lightweight Git

Good for:

- CTO-owned branded experience.
- Desktop/local/customer cluster operation.
- Lightweight resource footprint.
- Simple Git hosting, PRs, webhooks, orgs, API automation.
- Building agent-native additions around the edges.

CI/CD status:

- Gitea has Actions support, compatible with GitHub Actions concepts, using runners.
- It is likely enough for a first CTO-managed CI lane if we scope narrowly: agent jobs, tests, builds, GitOps sync, release packaging.
- It is not GitLab-level out of the box for the full DevSecOps/product suite.

### GitLab CE

Good for:

- Teams already oriented around GitLab workflows.
- Mature CI/CD mental model and `.gitlab-ci.yml` compatibility.
- Existing import/migration paths from GitLab.com/self-managed GitLab.

Concerns:

- Heavier footprint and more operational complexity.
- More trademark/product constraints.
- CE vs EE feature split matters. Some features customers expect from “GitLab” may require paid EE/Ultimate/Premium paths.
- Better positioned as compatibility or managed integration, not the primary CTO-owned identity.

## Recommended product posture

### Near-term

Keep the Source setup happy path:

1. Detect local signals: git remotes/config, `gh`, `glab`, previous provider state.
2. Recommend GitHub or GitLab app install.
3. After app approval, list accessible orgs/repos and let Morgan recommend what to connect.
4. Offer 5D Origin as:
   - create new CTO-managed repo/org
   - mirror selected repos
   - migrate later
   - run agent jobs/CI in CTO without moving source yet

### Mid-term

Build **Origin Standard** as an agent-native managed Git + CI lane:

- Gitea/Forgejo-derived Git hosting if license/trademark review clears.
- Gitea Actions or compatible runner layer for basic pipelines.
- CTO-specific agent job runner integration rather than full generic CI parity.
- First-class GitOps templates, policy files, Morgan app/service account, branch protections, and audit logs.
- Backup/restore and migration tooling from GitHub/GitLab.

### Later / enterprise

Offer **Origin GitLab-compatible** when needed:

- Install/administer GitLab CE for customers who require GitLab CI syntax/workflows.
- Provide migration/import guidance and CTO policy overlays.
- If customers need EE features, integrate with their valid GitLab subscription rather than rebranding/reselling EE.

## User journey recommendation

Do not ask: “Which source-control system do you want to adopt?”

Ask/act like:

1. “I found GitHub/GitLab activity. Install Morgan there?”
2. “Want CTO to mirror these repos into 5D Origin for faster agent runs/backups/private CI?”
3. “Keep GitHub as source of truth, or switch origin when you are ready?”
4. “If your team needs GitLab-style CI, choose GitLab-compatible. Otherwise Standard is lighter.”

This keeps friction low and creates a credible migration path without forcing a strategic infrastructure decision on first run.

## Migration/off-ramp requirements

A compelling CTO-managed source lane needs:

- Mirror/import repos with branches, tags, default branch, protected branch metadata where possible.
- Preserve issue/PR links back to original provider when full migration is not performed.
- Map users/orgs/teams and service accounts.
- Keep source provider as read-only upstream or bidirectional mirror during evaluation.
- Generate CI translation guidance:
  - GitHub Actions -> Origin Standard/Gitea Actions-compatible jobs where possible.
  - GitLab CI -> Origin GitLab-compatible path when translation is too lossy.
- Remote URL cutover with rollback plan.
- Agent policy portability: repo permissions, tool/model access, secrets mapping, environment approvals.
- Redacted migration logs and dry-run reports.

## Strategic bet

The strongest opportunity is **agent-native source operations**, not another GitHub clone.

If CTO can make source control feel like:

- “Morgan installs into my existing GitHub in one click,” then
- “Morgan safely mirrors and runs work in CTO,” then
- “I can move private/internal/agent-heavy work into 5D Origin when ready,”

then 5D Origin is viable. If we lead with “switch from GitHub to our Git server,” friction will be too high.
