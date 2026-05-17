# CTO level-set report (2026-05-16)

## Sync status

### cto-app ([5dlabs/cto-app](https://github.com/5dlabs/cto-app))

| Item | Status |
|------|--------|
| `main` | Synced with `origin/main` (`4a4c352`) |
| Open PRs | [#30](https://github.com/5dlabs/cto-app/pull/30) level-set local dev/gitops; [#29](https://github.com/5dlabs/cto-app/pull/29) Dependabot |
| Backup bundle | N/A (repo small) |

### cto ([5dlabs/cto](https://github.com/5dlabs/cto))

| Item | Status |
|------|--------|
| `main` | Current at `origin/main`; feature branch merged with `main` (`d085a910`) |
| Open PRs | [#4951](https://github.com/5dlabs/cto/pull/4951) Hermes chart/gitops follow-ups (rebases on merged `main`) |
| Offline backup | `~/cto-backup-20260516.bundle` |
| Primary checkout | `feat/hermes-presence-controller-ci` synced with `origin` |

## Branches kept vs deleted

### cto-app

- **Deleted:** `claude/beautiful-colden-3078f7` (merged), `fix/morgan-lemon-slice-agent-id` (superseded by `feat/levelset-local-dev-morgan`)
- **Kept (unmerged, local-only):** `feature/end-to-end-testing`, `fleet/remote-main-init` — have unique commits; push or archive if still needed
- **New:** `feat/levelset-local-dev-morgan` → PR #30

### cto

- **Pushed:** `feat/hermes-presence-controller-ci` (remote restored)
- **Backup:** `backup/hermes-presence-20260516` at pre-commit HEAD

## Worktrees

### Removed (prunable)

- `/private/tmp/cto-bclaws-disable`
- `/private/tmp/cto-hermes-coder-main`
- `/private/tmp/cto-hermes-github-workspace`
- `/private/tmp/cto-hermes-kubectl-workspace`
- `/private/tmp/cto-hermes-upgrade`

### Kept (unique commits not on `main`)

| Path | Branch | Notes |
|------|--------|-------|
| `cto-error-frame` | `feat/avatar-error-frame` | ERROR frame protocol |
| `cto-plan-layout` | `chore/plan-layout` | `.plan/` layout |
| `cto-hermes-support` | `hermes-oauth-wiring-fix` | Hermes OAuth env wiring |
| `cto-intake-video` | `hermes-allowed-users` | Discord allowlist work |
| `cto-avatar-scope-cleanup` | `main` (116 behind when last checked) | Pull `main` here to refresh |
| Copilot session worktrees | various `[gone]` | Safe to remove manually if dirs are stale |

## Morgan media policy (per level-set)

The desktop app loads **`/uploads/morgan/{slug}/{basename}.mp4`** (and matching `.vtt`) from `LocalStackBootstrap`. Active slugs are **`01_intro` through `13_install-start`** (e.g. `02_saved-access`, `04_source`, `10_provider-auth`), plus conditional basenames such as `onepassword-ready` and `cloudflare-login`.

**Ops / test only (not shipped in git):**

- `ab/`, `motion-prompt/`, `scenario-ledger.json`, and `*-ledger.json` — generation and comms experiments
- Legacy renumbered folders (`02_source`, `03_harness`, … `10_install-start`) — superseded by the 13-screen layout above
- All **MP4** lip-sync renders and non-`morgan` **MP3** clips — regenerate locally (voice-bridge + Pruna); runtime reads them from `ui/public/uploads/` on disk
- `.local/`, `.firecrawl/`, `.hermes/tmp/`, `.hermes/artifacts/`

**Versioned in [#30](https://github.com/5dlabs/cto-app/pull/30):** `script.md`, `captions.vtt`, `morgan.mp3`, and branch **`.md`/`.vtt`** for saved-access and endpoint conditions.

## Open work backlog (top items)

### cto-app

1. Merge [#30](https://github.com/5dlabs/cto-app/pull/30) after review (resolve overlap with merged #27 if CI flags duplicates)
2. Validate Hermes harness E2E — [`docs/2026-04/local-hermes-copilot-handoff.md`](../2026-04/local-hermes-copilot-handoff.md)
3. Close or merge Dependabot [#29](https://github.com/5dlabs/cto-app/pull/29)
4. Source four-option / Origin strategy — [`.hermes/plans/`](/.hermes/plans/) (plans only)
5. Billing UI — design scaffold only (`.task/.docs/design`)

### cto

1. Merge [#4951](https://github.com/5dlabs/cto/pull/4951) (branch now includes merged `origin/main`)
2. Pop stash `pre-levelset-avatar-wip-20260516` and branch avatar WIP if still active
3. Triage sibling worktrees (table above) — push or close per branch
4. Metal / coder bots — production GitOps in `infra/gitops/applications/workloads/metal-agent.yaml`

## GitHub org and bot credentials

### Humans

- `gh api orgs/5dlabs/members` returned **`kaseonedge`** only; org teams **`planning`**, **`qa`**, **`swe`** exist — grant team (or org-wide) access to `cto` and `cto-app` so collaborators are not limited to direct repo collaborators.
- Repo collaborator API lists **`kaseonedge`** only on both repos; use org/team permissions for the rest of the org.

### Bots and tokens

| Pattern | Where | Refresh |
|---------|-------|---------|
| GitHub App `5DLabs-{Agent}` | CodeRun / controller | Installation token (~1h) from app private key in cluster ExternalSecret |
| `GITHUB_TOKEN` / `COPILOT_GITHUB_TOKEN` | `cto/cto-agent-keys` (local Kind + agents) | Setup wizard or `CTO_GITHUB_PAT` for desktop bootstrap |
| Discord `metal` token | `openclaw-discord-tokens` secret | Cluster secret rotation |
| Metal agent | `cto-metal` Argo app → `metal-values.yaml` | Shares coder API keys + Discord projection |

**Cluster checks (when kubeconfig available):**

```bash
kubectl -n cto get externalsecret,secret | grep -i github
kubectl -n cto logs -l app.kubernetes.io/name=cto-metal --tail=50
```

### Billing follow-on

- GitHub org seats vs active members
- API keys: OpenRouter, Copilot, Exa/Firecrawl/Tavily — map to `cto-agent-keys` per [`docs/handoff-local-stack-setup.md`](../handoff-local-stack-setup.md)
- CTO Pay (USDC) — product not shipped in desktop UI yet
