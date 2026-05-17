# Morgan CTO Desktop E2E Completion Plan

> **For Hermes:** Continue autonomously until these acceptance criteria are complete, non-visual validation passes, and only then run desktop visual E2E evidence.

**Goal:** Finish CTO Desktop/Morgan setup so saved-access quick connect, GitLab-backed agent CodeRun/source auth, and both 5D Origin self-hosted provisioning lanes are durable, testable, and app-creatable from source.

**Architecture:** Keep hosted GitHub/GitLab as the fastest first-run path. Add 1Password as an optional approval-first import source into CTO-managed Kubernetes/OpenBao-bound secrets. Add 5D Origin as a post-source, mirror-first optional layer with two implementation choices: Gitea and GitLab. Self-hosted engine provisioning must be represented by source-owned Argo Applications plus Tauri/API dry-run and apply contracts.

**Tech Stack:** Rust/Tauri commands in `src-tauri/src`, React setup UI in `ui/src/components/LocalStackBootstrap.tsx`, TypeScript API wrappers, Node E2E/intent tests in `scripts/e2e`, Argo Applications under `.gitops/apps` and `.gitops/template/.gitops/apps`, Helm/GitOps validation through `helm`, `kubectl`, and `node --test`.

---

## Outstanding Acceptance Criteria

### A. Already completed / verified

- Client Cluster baseline exists locally: Kind context, Argo CD, ingress-nginx, `cto` and `qdrant` apps verified healthy in prior run.
- Source top-level UI uses exactly `GitHub`, `GitLab`, `5D Origin` with icon-first low-cognition cards.
- Existing tests cover source install actions, hosted-first copy, provider separation, and GitLab token chart wiring.

### B. Preserved active tasks

1. **1Password quick connect**
   - Detect local single-user 1Password CLI/Desktop integration without requiring setup.
   - Metadata/listing only before approval.
   - Preview recognizable candidate secrets for canonical purposes.
   - Require explicit approval before reading selected fields.
   - Apply selected secrets only to CTO-managed runtime destination; never persist/log raw values.
   - Manual paste remains available and setup is not blocked when 1Password is missing.

2. **GitLab CodeRun/source auth spike**
   - Define static API/auth contract for GitLab-backed Rex/Blaze/Pass/Cipher-style agent jobs.
   - Provide a redacted GitLab API probe using approved token/API flow.
   - Wire canonical `GITLAB_TOKEN` behavior without logging/persisting the token.

### C. Previously glossed-over self-hosted Origin criteria

3. **Origin transfer dry-run contract**
   - Add `prepare_origin_transfer` Tauri command/API.
   - Require an existing GitHub/GitLab source connection.
   - Default mode is `mirror`, not migration/cutover.
   - Map engines to stable app names: `origin-standard`, `origin-gitlab-compatible`.
   - Return redacted manifest/action preview and warnings.

4. **5D Origin Gitea provisioning**
   - Add source-owned optional Argo app for Gitea.
   - Include GitOps template copy.
   - Add app creation wiring from Tauri so the desktop app can create/apply the Argo Application after approval.
   - Keep out of Client Cluster baseline.

5. **5D Origin GitLab provisioning**
   - Add source-owned optional Argo app for GitLab.
   - Include GitOps template copy.
   - Add app creation wiring from Tauri so the desktop app can create/apply the Argo Application after approval.
   - Keep out of Client Cluster baseline; warn about heavier footprint.

6. **Morgan UI progressive disclosure**
   - Offer Origin as mirror-first/migrate-later, not as a first forced migration decision.
   - Show engine selection under 5D Origin with clear OSS attribution.
   - Show app-creation review before provisioning.
   - Keep full action language in `aria-label`/`title` where icon-first visible labels are short.

7. **Non-visual validation before any visual test**
   - Node intent/static tests pass.
   - Rust unit tests / Tauri command registration checks pass.
   - Helm/GitOps manifests render/lint where applicable.
   - Redaction scans/tests confirm canary secrets do not appear in reports/manifests/log-shaped output.

8. **Final visual desktop E2E only after all above are complete**
   - Use real Tauri desktop path, not browser-only, because Rust utilities and bootstrap/app creation are involved.
   - Do not start this until implementation and non-visual validation are complete.

## Execution Plan

### Task 1: Add 1Password quick-connect command contracts

- Modify `src-tauri/src/bootstrap.rs` to add `detect_secret_sources`, `preview_secret_source_matches`, and `apply_secret_source_matches`.
- Modify `src-tauri/src/lib.rs` to register the commands.
- Modify `ui/src/api/tauri.ts` and add a small TS wrapper for preview/mock mode.
- Update `scripts/e2e/intent/morgan-setup.intent.json` quick-connect metadata.
- Validate with `node --test scripts/e2e/secret-source-tauri-api.test.mjs scripts/e2e/secret-sources-intent.test.mjs`.

### Task 2: Add GitLab CodeRun auth/probe contract

- Add redacted GitLab probe request/result types and command in `src-tauri/src/scm_auth.rs`.
- Register in `lib.rs` and expose through TS API.
- Add docs/tests for CodeRun contract and redaction.
- Validate with focused Node/Rust tests.

### Task 3: Add Origin transfer dry-run/app creation commands

- Add engine/mode/repository request/result types.
- Add `prepare_origin_transfer` and `provision_origin_application` commands.
- Ensure dry-run requires GitHub/GitLab connection and defaults to `mirror`.
- Ensure result previews contain no raw credentials.

### Task 4: Add optional Origin Argo Applications

- Add `.gitops/apps/origin-standard.yaml` and `.gitops/apps/origin-gitlab-compatible.yaml`.
- Add matching `.gitops/template/.gitops/apps/*` files and include them in the GitOps template file list.
- Update `.gitops/apps/README.md` and template README.
- Validate YAML and `kubectl --dry-run=client` where possible.

### Task 5: Wire Morgan UI review

- Extend Source UI/API usage to call Origin dry-run and show app creation review for each engine.
- Keep hosted Source as recommended first path; do not force Origin.
- Add/extend Node tests for Origin engine app names and app creation controls.

### Task 6: Full non-visual validation

Run the focused suite first, then broader checks:

```bash
node --test scripts/e2e/secret-source-tauri-api.test.mjs scripts/e2e/secret-sources-intent.test.mjs
node --test scripts/e2e/source-auth-install-actions.test.mjs scripts/e2e/source-auth-provider-separation.test.mjs scripts/e2e/source-auth-two-button-inference.test.mjs scripts/e2e/agent-gitlab-token-chart.test.mjs
cargo test --manifest-path src-tauri/Cargo.toml
helm lint .gitops/charts/cto
helm lint .gitops/charts/agent
kubectl --context kind-cto-app -n argocd get applications -o wide
```

### Task 7: Final desktop visual E2E

Only after Tasks 1-6 pass, run the real Tauri app/MCP path and capture final evidence.
