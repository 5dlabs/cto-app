# CTO Desktop E2E

## Recommended stack

- **Linux/Windows CI:** use Tauri's supported WebDriver path with `tauri-driver` and Selenium.
- **macOS local development:** use the Tauri MCP cycle runner because Tauri WebDriver does not support macOS WKWebView.
- **BrowserStack:** useful for browser/mobile web coverage, but not for the full desktop Tauri binary flow. Use it later for browser-preview smoke tests, not as the primary desktop bootstrap runner.

## Commands

```bash
npm run e2e:tauri
npm run e2e:local-stack-cycle
npm run e2e:k8s-smoke -- --watch
```

On macOS, start the debug Tauri app first and keep it running while the MCP cycle runner executes:

```bash
npm run tauri:dev
npm run e2e:local-stack-cycle
```

The macOS runner expects the debug app's MCP socket at `/tmp/tauri-mcp.sock` by default. Override it with `TAURI_MCP_IPC_PATH` only if the Tauri plugin is configured to use a different socket path.

Pass `--start` to click **Start** and wait for a real Kind/GitOps bootstrap. Without it, the tests stop at the Start step.

Pass `--legacy-openclaw` or set `CTO_E2E_LEGACY_OPENCLAW=1` to exercise the older OpenClaw + Claude/OpenAI path. By default, the runner now follows the current Hermes + Copilot setup lane.

Use `CTO_E2E_GITHUB_OWNER` and `CTO_E2E_GITHUB_PAT` for test-only credentials when you want the real bootstrap path to create/update `cto-gitops`.

For a local full-cycle run that starts the Kubernetes smoke watcher at the same time as the UI-triggered bootstrap:

```bash
npm run e2e:local-stack-cycle -- --reset --start --k8s-smoke
```
