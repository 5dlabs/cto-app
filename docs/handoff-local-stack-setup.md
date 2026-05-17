# CTO Desktop handoff: local stack, setup wizard, and web UI

## Current state

This branch moves CTO Desktop from a desktop-only bootstrap flow toward a designable browser UI plus a richer first-run setup path.

- **Kind/local stack bootstrap:** Rust bootstrap now installs/recovers the Kind cluster, applies ingress/Argo CD apps, handles metrics-server setup for Lens/`metrics.k8s.io`, persists setup choices, and recovers an existing Kind cluster after host reboot by restarting nodes and refreshing kubeconfig.
- **Source control setup:** The first-run flow collects source-control provider, owner/group, hosted/self-hosted URL, and stores a draft SCM connection through the Rust-backed source-control provisioning path.
- **Credential/setup wizard:** `LocalStackBootstrap` now starts with a large animated 5D hero, then moves to source + CLI + provider/model profile selection, then finishes with an OpenCLAW/Hermes harness choice.
- **CLI/provider profile model:** The UI represents all eight researched CLI surfaces: OpenCLAW, Codex, Claude Code, Gemini CLI, OpenCode, Qwen Code, GitHub CLI, and GitLab CLI. GitHub CLI and GitLab CLI are source-control helpers and do not filter AI providers.
- **Provider/model stress case:** OpenRouter has a larger hardcoded model list for layout stress testing. Provider cards support multiple selected models and scroll internally so large catalogs do not push actions off-screen.
- **Browser-only design mode:** `npm run web:dev` serves the React UI directly in a browser and skips the Rust/Kind bootstrap gate outside Tauri. The same bypass can be forced with `VITE_CTO_SKIP_LOCAL_STACK_BOOTSTRAP=1`.
- **Browser init preview (wizard UI):** `npm run web:init:dev` serves the bootstrap hero plus setup screens (`VITE_CTO_INIT_PREVIEW=1`) without calling Rust provisioning; use port **5174** by default (`web:dev` stays on **5173**).
- **Morgan/voice UI:** Morgan has local avatar/voice bridge integration work in progress, with a new voice-bridge chart and local ingress paths under `/morgan`.
- **Research MCP routing:** Local Morgan routes research MCP tools through the central `cto-tools` service. The `cto` chart now starts Exa, Firecrawl, and Tavily MCP servers there, and Morgan requests them through `remoteTools` globs instead of per-agent local MCP entries.
- **Tools SDK path:** Morgan now renders `/workspace/.cto-tools/mcp.mjs`/`mcp.ts` from the agent chart. Code-execution tasks can import `callTool`, `listTools`, `describeTool`, and `escalate` to call the central `cto-tools` service without relying on native tool-call plumbing. The SDK is Node-compatible because the desktop agent image has Node 22 but not Deno.
- **Tool API keys:** The setup wizard includes common tool keys for Exa, Firecrawl, Tavily, Brave Search, Perplexity, and Context7. Non-empty values are applied to the local `cto/cto-agent-keys` Secret and patched into the local `cto` Argo Application values so Kind desired state owns the same keys.
- **Generated CTO config:** The setup wizard now sends selected source, harness, CLI, provider, model, routing, and non-secret provider connection details to Rust. The bootstrap patches this into the `cto` chart as `valuesObject.ctoConfig`, which renders `/config/CTO-config.json` from `task-controller-config`. Provider/model data is intentionally repeated under each selected compatible CLI so Morgan and runtime code can read a single CLI subtree without joining against separate selection tables.

## Tool secret input requirements for Codex

Codex UI work should keep the setup wizard's tool-secret contract intact while refining the screen. The implementation lives in `ui/src/components/LocalStackBootstrap.tsx`: `TOOL_API_KEYS` defines the fields, `ToolApiKeyName` defines the allowlist, and `buildBootstrapRequest()` serializes the values.

| UI label | Secret key | Placeholder | Purpose |
| --- | --- | --- | --- |
| Exa | `EXA_API_KEY` | `exa_...` | Enables the central Exa MCP server, whose current tools include `web_search_exa` and `web_fetch_exa`. |
| Firecrawl | `FIRECRAWL_API_KEY` | `fc-...` | Enables Firecrawl search, scrape, crawl, map, extract, and browser tools through `cto-tools`. |
| Tavily | `TAVILY_API_KEY` | `tvly-...` | Enables Tavily search, extract, crawl, map, and research MCP tools through `cto-tools`. |
| Brave Search | `BRAVE_API_KEY` | `BSA...` | Provides a grounded web-search key for OpenCLAW/search provider integrations. |
| Perplexity | `PERPLEXITY_API_KEY` | `pplx-...` | Provides a Perplexity/Sonar research key for OpenCLAW/search provider integrations. |
| Context7 | `CONTEXT7_API_KEY` | `ctx7-...` | Provides a documentation lookup key for library/API research. |

Payload requirement:

```json
{
  "tools": {
    "apiKeys": [
      { "name": "EXA_API_KEY", "value": "..." }
    ]
  }
}
```

UI requirements:

- Render these as optional password inputs with `autoComplete="off"`; a blank field is omitted from the request.
- Send only non-empty trimmed values in `tools.apiKeys`; never send placeholder text or masked display values.
- Use the exact uppercase `ToolApiKeyName` values above. The Rust side rejects unknown names.
- Keep tool keys out of the persisted `setup` profile and out of local/browser storage. They must not be written to `setup.json`.
- Preserve environment-derived defaults returned by `local_stack_bootstrap_defaults()` unless the user edits that field.
- Surface the destination clearly in the UI: Kubernetes Secret `cto/cto-agent-keys`, consumed by the central `cto-tools` service via environment variables.
- Values must be single-line secrets. The Rust bootstrap rejects control characters/newlines; the UI should avoid multiline controls and should not silently coerce invalid input into success.

Backend/cluster requirements:

- Rust applies non-empty keys to `cto/cto-agent-keys` and patches the local `cto` Argo Application at `spec.source.helm.valuesObject.agentKeys`.
- The chart renders only non-empty `agentKeys` into the Secret, and `cto-tools` consumes that Secret with `envFrom`.
- Do not add per-agent local MCP entries for Exa, Firecrawl, or Tavily. They should stay centralized behind `cto-tools`; Morgan and SDK access should use `remoteTools` globs (`firecrawl_*`, `tavily_*`, and `web_*_exa` for Exa).

## Source-control auth constraints

- **GitHub.com and GitHub Enterprise Server:** Use tenant-owned GitHub App credentials for unattended repository automation. OAuth/device flows are useful for user sign-in or one-time setup, but OAuth tokens are not a PAT-generation mechanism. A GitHub App private key can mint installation access tokens as needed; those installation tokens expire after one hour and should be regenerated by runtime code.
- **GitLab.com:** Treat OAuth as a user session flow. GitLab OAuth access tokens are short-lived (`expires_in` is 7200 seconds in current GitLab docs) and refresh-token rotation is required. For unattended agents on hosted GitLab.com, collect a manually created project, group, or service-account token and store it in the tenant-owned Kubernetes Secret.
- **GitLab Self-Managed/Dedicated:** Admin APIs can create instance applications and user/impersonation/service tokens, but this requires administrator access on that instance. The setup flow should keep hosted GitLab.com on the manual-token path and only enable API-created GitLab app/token provisioning when a self-managed/Dedicated instance and admin credentials are explicitly provided.
- **Hosted enterprise testing:** GitLab Dedicated behavior should be validated against the documented API contract and a self-managed GitLab test instance unless a paid Dedicated tenant is available; the setup UI should not assume CTO can create a GitLab.com instance OAuth app.

## CTO-config.json contract

`CTO-config.json` is system-managed and may be verbose. Its top-level `clis` object is keyed by selected CLI. Each CLI contains the providers and models that are valid for that CLI, duplicating provider data where needed for straightforward runtime lookup. Secret values are never written to this file; provider credentials reference `cto/cto-agent-keys` keys such as `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or generated provider-specific key names.

## How to run

```bash
# Browser-only UI for design work (shell; skips bootstrap wizard)
npm run web:dev

# Browser-only first-run wizard (no Rust provisioning)
npm run web:init:dev

# Full desktop app with Rust/Tauri bootstrap
PATH="$(/opt/homebrew/bin/rustup which cargo | xargs dirname):$PATH" npm run tauri:dev

# Controller-only bootstrap for local chart/controller validation
CTO_BOOTSTRAP_TEST_MODE=controller-only npm run tauri:dev

# Reset the local Kubernetes stack before an end-to-end bootstrap retry
scripts/cleanup-local-stack.sh --yes

# Also remove the persisted first-run setup choices
scripts/cleanup-local-stack.sh --yes --remove-bootstrap-profile
```

The browser-only UI should be the default handoff path for visual iteration in Codex/Claude because it avoids the local Kind/Rust provisioning work.

## Validation run

```bash
npm --workspace ui run typecheck
npm run build
PATH="$(/opt/homebrew/bin/rustup which cargo | xargs dirname):$PATH" cargo test --manifest-path src-tauri/Cargo.toml bootstrap::tests -- --nocapture
```

`npm run web:dev` was also started and confirmed to serve the Vite index with `VITE_CTO_SKIP_LOCAL_STACK_BOOTSTRAP=1` injected.

## Known caveats

- Brandfetch MCP is configured in the user-level Copilot MCP config, not this repository. It still needs `BRANDFETCH_API_KEY` and `BRANDFETCH_CLIENT_ID` before brand assets can be fetched.
- Exa, Firecrawl, and Tavily MCP tools need `EXA_API_KEY`, `FIRECRAWL_API_KEY`, and `TAVILY_API_KEY` in the local `cto-agent-keys` Secret before provider calls succeed. The wizard can also collect `BRAVE_API_KEY`, `PERPLEXITY_API_KEY`, and `CONTEXT7_API_KEY` for OpenCLAW web/docs research providers.
- Exa's MCP server currently exposes `web_search_exa` and `web_fetch_exa`, so the Morgan `remoteTools` allowlist includes `web_*_exa` in addition to the compatibility `exa_*` glob.
- The current provider/model catalog is intentionally hardcoded for review. Long term, OpenRouter and other broad catalogs should be dynamically fetched or summarized instead of maintained inline.
- Tauri/browser automation was flaky in this environment, so visual layout review should continue in the browser-only mode.
- GitHub/GitLab CLI are selected as CLI surfaces for source-control compatibility but should not be treated as AI provider launchers.
- OpenCLAW appears both as a CLI surface and as a harness concept. Keep the final harness choice separate from the earlier CLI/profile selection.
- Desktop bootstrap Argo Applications must point to chart versions that are already published to `ghcr.io/5dlabs/helm-charts`. A clean Kind cluster cannot reconcile unpublished local chart versions.

## Suggested next work

- Replace interim inline icon marks with real brand assets once Brandfetch credentials are available.
- Continue visual refinement of the hero-to-wizard transition and responsive setup layout in browser-only mode.
- Move the hardcoded provider/model catalog behind a dynamic catalog source before production.
- Finish wiring selected setup profile values into agent/harness initialization after the desktop flow is approved.
