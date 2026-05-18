# Morgan Setup UX Principles

Date: 2026-05-01

## Current status

The repository did not contain a single canonical visual style guide. Existing guidance is distributed across:

- `AGENTS.md` — icon-first UI affordances and Morgan media rules.
- `docs/intent/morgan-setup/*.md` — screen-level intent and visual expectations.
- `docs/2026-04/morgan-intent-test-mode.md` — deterministic validation and reviewable artifacts.
- `docs/handoff-local-stack-setup.md` — notes on browser-only visual iteration and setup flow refinement.
- `ui/src/components/LocalStackBootstrap.tsx` — the actual setup UI patterns: Morgan-led panels, icon cards, short help text, redacted secrets, one-page actions.

This file is the working source of truth for Morgan setup UX until a formal product design system exists.

## Guiding principles

1. **Ask the user's intent, not implementation details.**
   - Start Source with three recognizable choices: **GitHub**, **GitLab**, or **5D Origin**.
   - Assume most users already have source control. Morgan should infer likely GitHub/GitLab usage from legitimate local signals such as Git remotes/config and installed/authenticated provider CLIs, then recommend that hosted app-install path first.
   - GitHub/GitLab mean Morgan installs into an existing hosted provider account/org/group and detects accessible repos/projects after approval.
   - 5D Origin is CTO-managed source and CI for agent-native development: mirror first, run private agent jobs, then migrate/cut over only when the user is ready. It is not a forced GitHub/GitLab replacement.
   - Its implementation choices are **Gitea** for the lightweight Git server and **GitLab** for teams that need GitLab CE / GitLab-style CI workflows. Do not hide these behind invented “Standard” or “compatible” labels; the user should know which server they are choosing.
   - Avoid showing OAuth/PAT/app-manifest/API-path choices as first-class decisions unless the default app flow fails or the tenant type requires it.
   - Finer-grained security policy, central approval workflows, and cross-org governance belong in paid-tier setup; the free path should stay icon-first provider actions plus provider-native permission granularity.

2. **Progressive disclosure over matrices.**
   - Initialize the local CTO cluster before the deeper setup prompts so later wizard steps can add components progressively instead of waiting for one giant final bootstrap.
   - The first Source step should be: recommend existing GitHub/GitLab usage when detected → install Morgan on that hosted provider → detect accounts/projects → offer mirror/migration into 5D Origin only when useful.
   - GitHub.com defaults to one-click app install: click GitHub, browser pops up, approve user/org/repo access, return.
   - GitLab.com defaults to the same product intent: install/authorize Morgan on GitLab, approve access, return, and let Morgan detect groups/projects. If a hosted GitLab app flow is unavailable in an environment, manual token becomes a `Review details` fallback, not the primary UX.
   - 5D Origin reveals implementation choices only as a sub-choice after intent: **Gitea** for the lightweight mirror/agent-native default, or **GitLab** for teams that need GitLab CE / GitLab-style CI workflows.
   - GitHub Enterprise and self-managed GitLab reveal base URL only after the user clicks the contextual secondary branch.
   - OAuth, device-code, PAT, and manual token fallbacks stay behind `Review details` or failure recovery links.

3. **Let Morgan handle optionality in the flow.**
   - Org-vs-user should be selected only after authentication exposes account choices.
   - Base URLs, namespaces, and fallback tokens should appear only when needed.
   - Successful auth should narrow the remaining choices instead of expanding them.

4. **Morgan says it; the UI shows it.**
   - If a paragraph is needed to explain the screen, the UI has failed.
   - Move explanation into Morgan narration, captions, hover/details, or docs; keep the visible UI as visual choices plus one short prompt.
   - Default visible copy budget: one short question, one primary action, optional one-line status. Everything else should be progressive disclosure.
   - Prefer status chips, icons, checkmarks, provider marks, and clear spatial grouping over instructional text.

5. **One obvious primary action.**
   - Each setup screen should have a single dominant next action.
   - Secondary actions are fallbacks, reset controls, or advanced alternatives.

6. **Icon-first, accessible affordances.**
   - Use recognizable provider/action icons instead of redundant visible labels where possible.
   - Preserve `title`, `aria-label`, or screen-reader-only text for accessibility.

7. **Plain language before backend terms.**
   - UI copy can say “Authenticate with GitHub Enterprise”; detailed implementation such as `/api/v3/app-manifests` belongs in small hints or docs.
   - Secret-like values must remain redacted in artifacts.

8. **Intent tests are part of the design system.**
   - Public intent docs plus machine-readable tests define whether the UI communicates the intended flow.
   - If the UI becomes confusing, add or update intent tests before broadening options.

## Reactive conversation model

The target setup experience is a **single Morgan conversation**, not a stack of dense wizard pages or a costly video for every branch. Keep one polished Morgan visual anchor, then use economical ElevenLabs audio from local `voice-bridge` for short reactive acknowledgement turns.

- User clicks an intent card.
- Morgan gives a short reactive acknowledgement in the approved ElevenLabs Morgan voice.
- The UI swaps only the next decision card after the acknowledgement starts or completes.
- Full lip-synced video remains for anchor moments: intro, install start, major completion, or marketing-grade demos.
- Routine setup branches should use audio/caption cues plus the live Morgan avatar/presence, avoiding per-branch video generation cost.

Design rule: one visible Morgan conversation shell, one active prompt, and one small set of high-confidence cards. Details move into `Review details`, captions, or the next decision only when the user’s prior selection makes them relevant.

## Source setup target flow

1. Morgan asks: **Install me on your environment.**
2. The only top-level choices are **GitHub**, **GitLab**, and **5D Origin**.
3. Morgan infers likely source-control usage from legitimate local signals where available:
   - Git remotes/config that point to GitHub, GitLab.com, or known self-managed GitLab domains
   - installed/authenticated CLIs such as `gh` or `glab`
   - previously saved CTO setup profile/provider state
4. Morgan defaults to the hosted service for existing-provider paths:
   - GitHub → `github.com`
   - GitLab → `gitlab.com`
5. 5D Origin is CTO-managed source and CI for agent-native development. It should be presented as mirror/import/private-agent-jobs first, with migration/cutover later when the user is ready. It has two engine flavors:
   - **Gitea** for the lightweight default
   - **GitLab** for teams that need GitLab CE / GitLab-style CI workflows
6. Morgan reveals contextual secondary branches only after provider selection and behind `Review details` or failure recovery:
   - GitHub: **Using GitHub Enterprise?** and **Use a personal access token instead**
   - GitLab: **Use existing self-hosted GitLab** and **Use a manual token instead**
   - 5D Origin: mirror/import/private-agent-jobs guidance first; engine details and later cutover/rollback details after intent
7. Enterprise/self-managed existing-provider branches ask for the server URL.
8. Morgan asks for the namespace only when needed; authenticated account choices can replace free text.
9. Morgan presents one primary action:
   - GitHub.com: **Install Morgan on GitHub**
   - GitHub Enterprise Server: **Install Morgan on GitHub Enterprise**
   - GitLab.com: **Install Morgan on GitLab**
   - Self-managed GitLab: **Install Morgan on self-managed GitLab**
   - 5D Origin Gitea: **Prepare 5D Origin**
10. After provider approval, Morgan can offer the off-ramp into 5D Origin: mirror selected repos, migrate selected repos, create a new repo, or move from Gitea to GitLab with redirects/mirrors until cutover is verified.

## Open design-system work

- Extract recurring colors, spacing, typography, cards, and button states from `ui/src` into a formal design token/reference doc.
- Add before/after Source screen snapshots to the intent artifacts so confusing-option regressions are visible.
- Consider a small `docs/design/` section once more Morgan screens converge on stable patterns.
