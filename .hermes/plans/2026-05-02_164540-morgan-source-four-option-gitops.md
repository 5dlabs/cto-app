# Morgan Source Four-Option GitOps Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task with Copilot-backed subagents. Dispatch a fresh implementation subagent per task, then spec-review and quality-review before moving on.

**Goal:** Expand Morgan Source setup from three odd-looking choices to four balanced source-control install choices — GitHub, GitLab, Gitea, and CTO GitLab — while making cluster-first prerequisites explicit and routing installed/self-hosted paths through GitOps.

**Architecture:** Keep the first Source screen icon-first and low-cognition. Hosted providers mean "existing hosted account; install Morgan app/integration." Self-hosted means "existing instance; reveal a compact provider dropdown + URL/auth details only after Review details/selection." CTO-managed GitLab/Gitea means "ensure local Kind + core prerequisites first, add the provider app to the Argo/GitOps app set, wait for convergence, then create/install Morgan's provider app via API where supported."

**Tech Stack:** React/Tauri setup wizard (`ui/src/components/LocalStackBootstrap.tsx`), source-control provisioning API (`ui/src/api/sourceControlProvisioning.ts`, `src-tauri/src/scm_auth.rs`, `src-tauri/src/bootstrap.rs`), Argo CD GitOps manifests (`.gitops/apps`, `.gitops/template/.gitops/apps`), Helm charts, Node E2E/static intent tests, Tauri MCP verification.

---

## Product contract

### Top-level Source cards

Visible labels stay short:

1. `GitHub` — accessible action `Install Morgan on GitHub` — hosted existing account (`github.com`).
2. `GitLab` — accessible action `Install Morgan on GitLab` — hosted existing account (`gitlab.com`).
3. `Gitea` — accessible action `Install Morgan on Gitea` — existing hosted/self-hosted Gitea path, defaulting to existing instance details after click because there is no universal public hosted equivalent to GitHub/GitLab.
4. `CTO GitLab` — accessible action `Install GitLab on CTO` — CTO-managed GitLab, cluster-first GitOps install.

**Note:** If implementation research confirms CTO-managed Gitea should also be first-class now, do not add a fifth top-level card. Keep four cards and make Gitea's first follow-up a two-option compact selector: `Use existing Gitea` or `Install Gitea on CTO`.

### Install affordance

Replace the rejected up-arrow/upload badge with a desktop/window + down-arrow install badge. Do not use `IconUpload` anywhere in the Source install grid.

### Cluster-first boundary

Before any CTO-managed source-control install (GitLab now, Gitea if selected for CTO later), bootstrap only minimum dependencies:

- Kind cluster
- Argo CD
- CNI/networking if needed by current bootstrap
- ingress controller
- core namespace/secrets scaffolding

Everything beyond that provider stack must be represented as GitOps-owned Argo Applications, not ad hoc runtime patching.

---

## Task 1: Lock the four-card Source UX contract with failing tests

**Objective:** Update tests/docs first so implementation has a concrete target.

**Files:**
- Modify: `scripts/e2e/source-auth-install-actions.test.mjs`
- Modify: `scripts/e2e/source-auth-provider-separation.test.mjs`
- Modify: `scripts/e2e/source-icon-first-post-auth.test.mjs`
- Modify: `scripts/e2e/source-preview-layout.test.mjs`
- Modify: `docs/2026-04/morgan-setup-ux-principles.md`
- Modify: `docs/intent/morgan-setup/source.md`
- Modify: `ui/public/uploads/morgan/02_source/script.md`

**Steps:**
1. Change the install-actions test name from "exactly three" to "four balanced install actions".
2. Assert `data-testid="source-install-gitea"`, visible `Gitea`, `aria-label="Install Morgan on Gitea"`.
3. Assert `IconInstallDesktop` (or final chosen icon name) is present and `IconUpload` is absent inside the Source install grid.
4. Assert the Source install grid hides self-hosted URL fields, token fields, device code, PAT, and provider matrices until advanced/follow-up UI.
5. Update docs/narration to mention GitHub, GitLab, Gitea, and CTO GitLab, plus cluster-first minimum dependencies.
6. Run expected-fail command:

```bash
node --test scripts/e2e/source-auth-install-actions.test.mjs scripts/e2e/source-preview-layout.test.mjs
```

**Expected:** FAIL before implementation because Gitea and the new install icon do not exist yet.

---

## Task 2: Add install/download and Gitea icons

**Objective:** Provide visual assets consistent with the existing icon system.

**Files:**
- Modify: `ui/src/views/icons.tsx`
- Modify: `ui/src/components/LocalStackBootstrap.tsx` imports only after icon exists

**Steps:**
1. Add `IconInstallDesktop` using a monitor/window outline plus downward arrow. Base the path on a permissive/common metaphor, but keep it as local SVG JSX consistent with existing icons.
2. Add `IconGitea` if no existing local Gitea logo exists. Prefer a simple high-recognition Gitea cup/branch glyph or use an existing local public SVG asset if present; keep accessibility on the button, not the SVG.
3. Ensure both icons accept the same props convention as `IconGitHub`/`IconGitLab`.
4. Run:

```bash
npm --workspace ui run typecheck -- --pretty false
```

**Expected:** PASS after import wiring; no `IconUpload` import should remain in `LocalStackBootstrap.tsx` once Task 3 lands.

---

## Task 3: Implement four Source install cards

**Objective:** Replace the current three-card grid with GitHub, GitLab, Gitea, and CTO GitLab, keeping full action text in aria/title only.

**Files:**
- Modify: `ui/src/components/LocalStackBootstrap.tsx`
- Modify if needed: `ui/src/styles/bootstrap.css`

**Steps:**
1. Extend `ScmProvider` support in UI/API types only as far as needed for static UI: include `gitea` in `ui/src/api/sourceControlProvisioning.ts` and local Source provider label/default URL maps.
2. Add a Gitea card:
   - `data-testid="source-install-gitea"`
   - `data-intent="source-provider-gitea source-install-gitea"`
   - `aria-label="Install Morgan on Gitea"`
   - visible label `Gitea`
   - `IconGitea` + `IconInstallDesktop`
3. Replace all Source card `IconUpload` badges with `IconInstallDesktop`.
4. For GitHub click: hosted `github`, auth mode `github-oauth`, URL `https://github.com`.
5. For GitLab click: hosted `gitlab`, auth mode `gitlab-instance-oauth-app`, URL `https://gitlab.com`.
6. For Gitea click: provider `gitea`, host mode `self-hosted` unless a product decision adds hosted default; reveal next-step compact branch only after selection/advanced.
7. For CTO GitLab click: provider `gitlab`, host mode `self-hosted`, mark planned install target `cto-managed-gitlab` in UI state if available, otherwise document as follow-up state in Task 4.
8. Keep `Install me on your environment.` as Morgan prompt.
9. Keep advanced auth decision tree collapsed on first render.
10. Run:

```bash
node --test scripts/e2e/source-auth-install-actions.test.mjs scripts/e2e/source-preview-layout.test.mjs
npm --workspace ui run typecheck -- --pretty false
```

**Expected:** PASS.

---

## Task 4: Model source install modes explicitly

**Objective:** Stop overloading `sourceProvider + sourceHostMode` for hosted, existing self-hosted, and CTO-managed installs.

**Files:**
- Modify: `ui/src/components/LocalStackBootstrap.tsx`
- Modify: `ui/src/api/sourceControlProvisioning.ts`
- Modify: `src-tauri/src/scm_auth.rs`
- Modify: `src-tauri/src/bootstrap.rs`
- Add/modify tests under `scripts/e2e/` and Rust tests if present

**Steps:**
1. Add a frontend type such as:

```ts
type SourceInstallTarget =
  | "github-hosted"
  | "gitlab-hosted"
  | "gitea-existing"
  | "gitlab-cto-managed"
  | "gitlab-existing"
  | "gitea-cto-managed";
```

2. Include the selected target in `buildSetupProfile` output and Tauri setup payload.
3. Add backend serde structs/enums for this target. Preserve backward compatibility by deriving old behavior when missing.
4. Make `sourceProvider`, `sourceHostMode`, `baseUrl`, `owner`, and auth strategy derived from the target where possible.
5. Tests should assert hosted paths do not request cluster provider install, while CTO-managed targets do.
6. Run:

```bash
npm --workspace ui run typecheck -- --pretty false
cargo check --manifest-path src-tauri/Cargo.toml
```

**Expected:** PASS.

---

## Task 5: Add existing self-hosted source-control follow-up selector

**Objective:** Provide the user's requested easy dropdown/selection for already-provisioned self-hosted source control.

**Files:**
- Modify: `ui/src/components/LocalStackBootstrap.tsx`
- Modify: `scripts/e2e/source-auth-provider-separation.test.mjs`
- Modify: `scripts/e2e/source-icon-first-post-auth.test.mjs`

**Steps:**
1. Behind `Review details` or after selecting `Gitea`/self-hosted, render a compact selector with options:
   - Existing GitHub Enterprise Server
   - Existing GitLab self-managed
   - Existing Gitea
2. Do not show this selector on first Source render.
3. Only after selecting an existing self-hosted option, show a single base URL input and provider-appropriate auth CTA/token fallback.
4. Ensure switching provider clears stale GitHub OAuth prompt/busy/timeout and token state.
5. Add tests that GitHub hosted/GitLab hosted/Gitea/CTO GitLab branches do not leak each other's provider-specific controls.
6. Run Source regression suite:

```bash
node --test   scripts/e2e/source-auth-install-actions.test.mjs   scripts/e2e/source-auth-two-button-inference.test.mjs   scripts/e2e/source-auth-provider-separation.test.mjs   scripts/e2e/source-icon-first-post-auth.test.mjs   scripts/e2e/github-one-click-auth-ux.test.mjs   scripts/e2e/real-source-ui-auth.test.mjs   scripts/e2e/source-auth-intent.test.mjs   scripts/e2e/source-preview-layout.test.mjs
```

**Expected:** PASS.

---

## Task 6: Define GitOps app manifests for CTO-managed GitLab and Gitea

**Objective:** Make CTO-managed source-control installs durable and Argo-owned.

**Files:**
- Modify/create: `.gitops/apps/gitlab.yaml`
- Modify/create: `.gitops/apps/gitea.yaml`
- Modify/create: `.gitops/template/.gitops/apps/gitlab.yaml`
- Modify/create: `.gitops/template/.gitops/apps/gitea.yaml`
- Modify/create charts if repo-owned charts exist or add pinned upstream Helm references per current GitOps pattern
- Modify: `.gitops/apps/README.md`
- Modify: `src-tauri/src/bootstrap.rs`

**Steps:**
1. Inspect existing Argo app patterns (`cto.yaml`, `morgan.yaml`, `qdrant.yaml`, `voice-bridge.yaml`).
2. Add disabled-by-default or conditionally-applied app definitions for GitLab and Gitea. Do not make clean installs pull unpublished local chart versions.
3. For GitLab, use the existing CTO-managed GitLab direction already implied by UI. Pin a published chart/version or document chart-release prerequisite.
4. For Gitea, spike the smallest viable chart path: upstream Gitea Helm chart pinned to a tested version, or a repo-owned wrapper chart if values need CTO defaults.
5. Wire bootstrap so the minimal cluster comes up first, Argo installs, then selected source-control app manifests apply.
6. Add static render/lint tests for both manifests.
7. Run:

```bash
helm lint .gitops/charts/cto
helm lint .gitops/charts/agent
# plus helm template/lint for any new wrapper chart
node --check scripts/e2e/kind-platform-smoke.mjs
```

**Expected:** PASS for static checks. Full Kind convergence waits until chart refs are published/reachable.

---

## Task 7: Implement provider app creation/probing for GitLab and Gitea APIs

**Objective:** Determine how far Morgan can automate app creation after CTO-managed provider install.

**Files:**
- Modify: `src-tauri/src/scm_auth.rs`
- Modify: `ui/src/api/sourceControlProvisioning.ts`
- Add: docs/API notes under `docs/2026-04/` or `docs/intent/morgan-setup/source.md`
- Add: redacted probe scripts under `.hermes/tmp/` only if needed (do not commit secrets)

**Steps:**
1. GitLab: verify API route for application creation is available for admin/root on self-managed GitLab. Expected area: Applications API / OAuth applications. Determine required scope and token type.
2. Gitea: verify OAuth2 application API availability for admin/user. Determine whether app creation is API-supported or requires manual UI.
3. Implement provisioning plan statuses:
   - `api-app-create-supported`
   - `manual-app-create-required`
   - `admin-token-required`
4. Redact every token/secret in logs and docs.
5. Add tests for plan generation and UI copy. If API cannot be fully automated, Morgan should say exactly what is needed and keep it behind follow-up details.

**Expected:** Hosted GitHub/GitLab remain one-click app installs; CTO-managed GitLab/Gitea either auto-create apps through API or clearly fall back to a guided admin step.

---

## Task 8: End-to-end validation and preview

**Objective:** Prove the UI and setup plumbing through static tests, build, Tauri MCP, and public preview.

**Files:**
- Update `.hermes/tmp/verify-source-install-actions-desktop.mjs` for four cards.
- Update `.hermes/tmp/capture-source-install-actions-svg.mjs` if artifact names/copy change.

**Steps:**
1. Run full focused validation:

```bash
node --test   scripts/e2e/source-auth-install-actions.test.mjs   scripts/e2e/source-auth-two-button-inference.test.mjs   scripts/e2e/source-auth-provider-separation.test.mjs   scripts/e2e/source-icon-first-post-auth.test.mjs   scripts/e2e/github-one-click-auth-ux.test.mjs   scripts/e2e/real-source-ui-auth.test.mjs   scripts/e2e/source-auth-intent.test.mjs   scripts/e2e/source-preview-layout.test.mjs   scripts/e2e/morgan-reactive-conversation.test.mjs   scripts/e2e/morgan-card-swap-regression.test.mjs
npm --workspace ui run typecheck -- --pretty false
npm --workspace ui run build
cargo check --manifest-path src-tauri/Cargo.toml
```

2. Verify Tauri MCP socket, then run desktop Source verification.
3. Refresh Cloudflare/Vite preview if already running; visually verify four cards are not clipped at 1280x633.
4. Attach a screenshot/DOM artifact if native capture remains blocked.

**Expected:** Four balanced cards visible; no up-arrow upload icon; hosted paths stay low-cognition; self-hosted details only appear after selection; CTO-managed install path is GitOps-owned.

---

## Fleet execution plan

Use this task split for subagents:

1. **UX/test subagent:** Tasks 1, 3, 5 UI tests and Source JSX/CSS.
2. **Icon subagent:** Task 2 icons plus icon contract tests.
3. **Tauri/schema subagent:** Task 4 setup payload/source install target modeling.
4. **GitOps subagent:** Task 6 Argo app/chart path for GitLab/Gitea.
5. **API research subagent:** Task 7 GitLab/Gitea app-creation API spike with redacted notes.
6. **Verification subagent:** Task 8 final static/Tauri/preview validation.

Avoid parallel edits to the same file. Start with UX/test + API research in parallel only if UX subagent does not touch backend files. Run final integration review after all subagents report PASS.

---

## Risks and open questions

- Gitea public-hosted semantics are not equivalent to GitHub.com/GitLab.com; likely treat top-level `Gitea` as existing Gitea by default, then offer `Install Gitea on CTO` as a compact follow-up if product wants it now.
- Self-managed GitLab app creation may require admin/root token and may not be safe to automate without explicit approval.
- Gitea OAuth app creation may not be API-supported in all versions; fallback may need guided manual admin UI.
- GitLab/Gitea Helm charts may be too heavy for the minimum local Kind footprint. If so, plan must add resource warnings and only install when selected.
- Clean installs require published chart versions if using repo-owned charts. Do not rely on unpublished local chart refs.
- Source-control provider installs must never print or commit admin tokens, app secrets, OAuth client secrets, private keys, or generated manifests containing secrets.
