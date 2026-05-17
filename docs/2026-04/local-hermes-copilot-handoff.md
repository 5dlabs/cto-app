# Local Hermes + Copilot handoff

This handoff pivots from the clean Kind/GitOps retry work to a focused local Hermes setup. The goal is to make Hermes the agent harness the user interacts with locally, authenticated through the same GitHub/Copilot path used by this Copilot CLI session, while keeping CTO Desktop's setup flow and GitOps-owned cluster state reproducible.

## Desired user-facing setup

Morgan should continue to lead first-run setup. The current intro copy is the right framing:

> Welcome to CTO. I am Morgan, and I will walk you through the local setup.

For the Hermes path, the intended choices are:

1. Source: GitHub, with the selected owner or org.
2. Harness: Hermes.
3. CLI surface: Copilot.
4. Provider/model: GitHub Copilot or the selected provider/model route that Copilot should use.
5. Auth: a GitHub token that can satisfy GitHub API, GitHub CLI, and Copilot CLI headless auth.
6. Tools: optional Exa, Firecrawl, Tavily, Brave, Perplexity, and Context7 keys through the existing tool-key screen.
7. Start: bootstrap the local Kind stack and let Argo own the rendered Hermes deployment.

Do not bypass the setup payload with manual cluster patches except as a temporary diagnostic. Durable changes should be in the repo, GitOps template, chart values, or Rust/UI setup code.

## Current state to inherit

- Clean GitOps validation is paused. The last retry failed before Kubernetes work because the Tauri MCP socket had no stable webview listener; the detached Tauri process later exited.
- No `kind-cto-app` cluster should be assumed to exist.
- The local desktop stack has moved to the `cto` namespace; do not reintroduce `cto-system`.
- Published chart pins in the embedded GitOps apps are currently:
  - `cto` chart: `0.1.12`
  - `agent` chart for Morgan: `0.1.15`
  - `qdrant` chart: `0.1.3`
  - `voice-bridge` chart: `0.1.3`
- `cto:0.1.12` added an MCP `npx` cache prewarm init container for `cto-tools`, but it has not yet been live-verified in a clean cluster.
- `agent:0.1.15` fixed the known OpenClaw config validation errors. Hermes mode exists in the same chart but still needs local validation.
- A local Hermes workstation install now exists outside the repo:
  - Binary: `~/.local/bin/hermes`, installed from `NousResearch/hermes-agent`.
  - CTO launcher: `~/.local/bin/hermes-cto`.
  - Hermes home: `~/.hermes`.
  - Provider: `copilot`, matching the cluster Hermes bots. The earlier `copilot-acp` path worked for one-shots but uses a short-lived ACP session per request and did not match the cluster bots' longer iterative behavior.
  - Default model: `gpt-5.5`.
  - Autonomy: launcher passes `--yolo`, `--accept-hooks`, `--toolsets all`, and preloads CTO local skills.
  - Autonomy budgets: `agent.max_turns: 240`, `terminal.timeout: 1200`, `terminal.lifetime_seconds: 7200`, `code_execution.timeout: 900`, `code_execution.max_tool_calls: 100`, `delegation.max_iterations: 180`, and `delegation.child_timeout_seconds: 3600`.
  - Cron safeguards: `cron.max_parallel_jobs: 1`, `HERMES_CRON_TIMEOUT=0`, and `HERMES_CRON_MAX_PARALLEL=1`.
  - Heartbeat: launchd service `ai.hermes.gateway` is installed/running; cron ticker wakes every 60 seconds; job `cto-e2e-autonomous-heartbeat` runs every 1 minute from `/Users/edge_kase/5dlabs/cto-app` with CTO bootstrap/autonomy/GitOps skills.
  - Discord gateway: Hermes is attached to the unused `metal` token from `ovh-cluster/cto/openclaw-discord-tokens:metal`. The gateway connected as `Metal#0685`.
  - Discord access: `DISCORD_ALLOW_ALL_USERS=true`, `DISCORD_REPLY_TO_MODE=first`, and `DISCORD_ALLOW_BOTS=mentions` are set in `~/.hermes/.env`. Tighten this to `DISCORD_ALLOWED_USERS` or `DISCORD_ALLOWED_ROLES` when the intended operator/user IDs are known.
  - CLI behavior: `hermes-cto -q ...` and cron jobs are one-shot runs by design. They create/finish a session per prompt. Longer iterative interaction should come from `ai.hermes.gateway` plus Discord, using the direct Hermes `copilot` provider.
  - Local skills: `cto-local-bootstrap`, `cto-morgan-setup-media`, `cto-hermes-copilot-autonomy`, and `cto-gitops-chart-release`.
  - Smoke result: `hermes-cto -Q -q 'Reply with exactly: OK-DEFAULT-GPT55'` succeeded.
- `~/.hermes/.env` contains GitHub/Copilot token material. Do not print it, commit it, or run Hermes status commands that echo raw environment values in shared logs.

## Existing Hermes and Copilot support

| Area | Current implementation |
| --- | --- |
| Setup UI | `ui/src/components/LocalStackBootstrap.tsx` defines harness IDs `openclaw` and `hermes`, and a Copilot CLI option. |
| Rust setup payload | `src-tauri/src/bootstrap.rs` accepts `BootstrapHarnessMode::Hermes` and maps Copilot input through `BootstrapAiCli::GitHubCli` with `alias = "copilot"`. |
| Agent chart | `.gitops/charts/agent/values.yaml` has `harness: openclaw` by default and supports `harness: hermes`. |
| Hermes home | `.gitops/charts/agent/templates/deployment.yaml` renders `/workspace/.hermes/config.yaml`, sets `HERMES_HOME=/workspace/.hermes`, and starts `hermes gateway` when `harness: hermes`. |
| CTO tools bridge | Hermes config includes a `cto_tools` MCP server when `toolServer.url` is set. Morgan desktop values point this at `http://cto-tools.cto.svc.cluster.local:3000/mcp`. |
| Copilot auth | The agent chart maps the `GITHUB_TOKEN` key from `cto-agent-keys` into `GITHUB_TOKEN`, `GH_TOKEN`, and `COPILOT_GITHUB_TOKEN`. |
| Copilot CLI config | The chart includes a Copilot backend config with `copilot --acp --yolo --no-ask-user --model claude-opus-4.7` for the OpenClaw ACP path; reuse this as the compatibility target when wiring Hermes-to-Copilot behavior. |

## Recommended implementation path

### 1. Confirm the Hermes runtime source

Before changing the default desktop harness, confirm where the `hermes` binary comes from in the runtime image or local workstation. The chart assumes this command exists:

```bash
hermes gateway
```

Run these checks without printing token values:

```bash
command -v hermes || true
hermes --version || true

# If validating inside the agent image, use a disposable shell and inspect only
# binary presence/version; do not mount or echo secrets.
```

If the binary is not present, decide on the durable install source before proceeding:

- Bake Hermes into the `ghcr.io/5dlabs/agents` image and keep the chart command as `hermes gateway`.
- Or add a chart init/install step only if the install is deterministic, pinned, and does not require secrets.
- Do not rely on an interactive workstation-only install for the Kind path.

### 2. Use the setup flow as the source of truth

The intended local selection should flow through the same payload as every other first-run choice:

```json
{
  "setup": {
    "harness": {
      "mode": "hermes",
      "clis": ["githubCli"],
      "providers": [
        {
          "id": "github-copilot",
          "models": ["claude-opus-4.7"]
        }
      ]
    }
  }
}
```

The exact serialized shape is built in `buildBootstrapRequest()` in `LocalStackBootstrap.tsx`; use that function rather than introducing a parallel config path.

### 3. Switch Morgan's local harness through GitOps values

For a durable local trial, switch the embedded Morgan Argo Application override from:

```yaml
valuesObject:
  harness: openclaw
```

to:

```yaml
valuesObject:
  harness: hermes
  hermes:
    gateway:
      mode: local
      command: "hermes gateway"
    model:
      provider: github-copilot
      default: claude-opus-4.7
```

Apply the same change to both:

- `.gitops/apps/morgan.yaml`
- `.gitops/template/.gitops/apps/morgan.yaml`

Keep `targetRevision: 0.1.15` unless the agent chart itself changes and a new chart is published to GHCR. A clean desktop install cannot reconcile against an unpublished chart version.

### 4. Keep Copilot credentials secret-backed

The setup token must continue to land in `cto/cto-agent-keys` as `GITHUB_TOKEN`. The chart already mirrors that key to:

- `GITHUB_TOKEN`
- `GH_TOKEN`
- `COPILOT_GITHUB_TOKEN`

For local-only host experiments, use shell env vars and never write the token to repo files:

```bash
export GITHUB_TOKEN="$(gh auth token)"
export GH_TOKEN="$GITHUB_TOKEN"
export COPILOT_GITHUB_TOKEN="$GITHUB_TOKEN"
export HERMES_HOME="$HOME/.cto/hermes"
```

For the Kind path, prefer the setup wizard or Rust bootstrap secret renderer over direct `kubectl create secret` commands.

### 5. Validate the render before booting Kind

Use render checks before another full desktop bootstrap:

```bash
helm lint .gitops/charts/agent

helm template morgan .gitops/charts/agent \
  -f .gitops/charts/agent/ci/values-morgan.yaml \
  --set harness=hermes \
  --set namespace=cto \
  --set global.namespace=cto \
  --set toolServer.url=http://cto-tools.cto.svc.cluster.local:3000/mcp \
  | rg 'HERMES_HOME|hermes gateway|COPILOT_GITHUB_TOKEN|cto-tools.cto.svc'
```

Also keep the usual UI/Rust checks when setup payload code changes:

```bash
npm --workspace ui run typecheck
PATH="$(/opt/homebrew/bin/rustup which cargo | xargs dirname):$PATH" \
  cargo test --manifest-path src-tauri/Cargo.toml bootstrap::tests -- --nocapture
```

### 6. Live validation checklist

After the render path is correct, run a clean local bootstrap and check:

```bash
kubectl --context kind-cto-app -n argocd get applications
kubectl --context kind-cto-app -n cto get pods
kubectl --context kind-cto-app -n cto get secret cto-agent-keys
kubectl --context kind-cto-app -n cto logs statefulset/openclaw-gateway-morgan -c agent --tail=200
kubectl --context kind-cto-app -n cto exec statefulset/openclaw-gateway-morgan -c agent -- \
  sh -lc 'test -f /workspace/.hermes/config.yaml && sed -n "1,120p" /workspace/.hermes/config.yaml && pgrep -af "hermes.*gateway"'
```

Expected outcomes:

- Argo apps are `Synced` and `Healthy`.
- Morgan's agent container starts Hermes instead of OpenClaw.
- `/workspace/.hermes/config.yaml` exists and includes the `cto_tools` MCP endpoint.
- The pod has `GITHUB_TOKEN`, `GH_TOKEN`, and `COPILOT_GITHUB_TOKEN` populated from `cto-agent-keys`; do not print their values.
- The `cto-tools` service becomes ready after the `cto:0.1.12` prewarm path.

## Standalone local Hermes experiment

If the goal is to interact with Hermes before the full Kind bootstrap is stable, use the existing local CTO launcher and keep it separate from the GitOps-owned install:

```bash
hermes-cto
```

The launcher defaults to `hermes chat` in `/Users/edge_kase/5dlabs/cto-app`, uses Hermes' direct Copilot provider with `gpt-5.5`, enables autonomous approvals, and preloads the CTO bootstrap/autonomy skills.

Only use a manual standalone gateway if a long-running local Hermes service is explicitly needed:

```bash
export HERMES_HOME="$HOME/.cto/hermes"
export GITHUB_TOKEN="$(gh auth token)"
export GH_TOKEN="$GITHUB_TOKEN"
export COPILOT_GITHUB_TOKEN="$GITHUB_TOKEN"
mkdir -p "$HERMES_HOME"/{memories,skills,sessions,logs}

# Only run this after confirming the Hermes binary install source.
hermes gateway
```

If `cto-tools` is running in Kind later, port-forward it and point Hermes at the forwarded endpoint:

```bash
kubectl --context kind-cto-app -n cto port-forward svc/cto-tools 3000:3000
```

Then use `http://127.0.0.1:3000/mcp` as the local MCP server URL in Hermes config. Keep that as a local experiment until the chart-driven path is validated.

## End-to-end testing path

The E2E harness now has three layers. Use them in this order so failures are easy to isolate:

1. Browser/setup flow only, no real bootstrap:

   ```bash
   npm run tauri:dev
   npm run e2e:local-stack-cycle
   ```

   This drives the first-run setup to the Start step through the Tauri MCP socket. It is the preferred local macOS flow because Tauri WebDriver does not support macOS WKWebView. Keep the debug Tauri app running for the whole runner; the cycle runner only connects to an existing stable webview listener and will fail fast if `/tmp/tauri-mcp.sock` (or `TAURI_MCP_IPC_PATH`) is not reachable.

2. Full local desktop bootstrap with Kubernetes smoke running at the same time:

   ```bash
   npm run e2e:local-stack-cycle -- --reset --start --k8s-smoke
   ```

   This removes the local Kind cluster and persisted setup profile, drives the setup flow, clicks Start, and runs `scripts/e2e/kind-platform-smoke.mjs` until the platform converges or times out. Set these only when exercising the real GitHub GitOps repo path:

   ```bash
   export CTO_E2E_GITHUB_OWNER=<owner-or-org>
   export CTO_E2E_GITHUB_PAT=<test-only-token>
   ```

   Do not echo token values. The bootstrap should persist secrets through Kubernetes Secret objects, not repo files.

3. Kubernetes-only smoke after a manual or UI-triggered bootstrap:

   ```bash
   npm run e2e:k8s-smoke -- --watch
   ```

   This checks the `kind-cto-app` context, namespace `cto`, Argo Applications `cto`, `qdrant`, `morgan`, and `voice-bridge`, expected workloads, required secrets, tool config, and `cto-tools` service readiness.

For Linux/Windows CI, keep `npm run e2e:tauri` as the Tauri WebDriver/Selenium path. For macOS local work, continue using `npm run e2e:local-stack-cycle` because the WebDriver path is intentionally skipped there.

Before each full E2E retry, validate static surfaces first:

```bash
npm --workspace ui run typecheck
npm run build
PATH="$(/opt/homebrew/bin/rustup which cargo | xargs dirname):$PATH" \
  cargo test --manifest-path src-tauri/Cargo.toml bootstrap::tests -- --nocapture
helm lint .gitops/charts/cto
helm lint .gitops/charts/agent
```

If a full E2E run fails, collect durable diagnostics before changing code:

```bash
kubectl --context kind-cto-app -n argocd get applications
kubectl --context kind-cto-app -n cto get pods
kubectl --context kind-cto-app -n cto logs deployment/cto-tools --tail=200
kubectl --context kind-cto-app -n cto logs statefulset/openclaw-gateway-morgan -c agent --tail=200
```

Do not fix failures with ad hoc cluster patches unless clearly marked as diagnostics. Persist fixes in Rust bootstrap code, UI setup payload code, `.gitops/apps`, `.gitops/template`, Helm chart values/templates, or published chart versions.

## Risks and open questions

- The local Hermes binary source is verified for the workstation install, but the agent image still needs durable Hermes availability if the Kind/GitOps path is switched to `harness: hermes`.
- Hermes remote gateway mode is intentionally unvalidated. Use `hermes.gateway.mode: local` for this lane.
- Copilot headless behavior should be validated with the current token shape. Do not run `gh auth login` inside the pod; use the secret-backed token env vars.
- `cto-tools` first-run readiness is still the most important platform dependency. If Hermes starts but tools are unavailable, inspect `prewarm-mcp-cache` and `cto-tools` logs before changing Hermes.
- Do not publish a new chart just to switch Morgan from OpenClaw to Hermes if the existing published chart already renders the desired mode. Publish only when chart templates or defaults change.

## Suggested next prompt for the implementation agent

Read `docs/2026-04/local-hermes-copilot-handoff.md` and `e2e/README.md`. Continue from the verified local `hermes-cto` install, then resume E2E testing by first running the setup-flow-only cycle and then the full `npm run e2e:local-stack-cycle -- --reset --start --k8s-smoke` path. If the Kind/GitOps run fails, diagnose Argo, `cto-tools`, and Morgan/Hermes logs, and persist fixes in repo-owned bootstrap/chart/template code rather than applying ad hoc cluster patches.
