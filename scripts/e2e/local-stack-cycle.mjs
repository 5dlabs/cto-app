#!/usr/bin/env node
import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";
import { startKubernetesSmoke } from "./kind-platform-smoke.mjs";
import { writeDomSnapshotArtifact } from "./dom-snapshot-artifact.mjs";
import { evaluateSnapshotIntent } from "./intent-evaluator.mjs";

const args = new Set(process.argv.slice(2));
const shouldReset = args.has("--reset");
const shouldStart = args.has("--start");
const withK8sSmoke = args.has("--k8s-smoke");
const withIntentTest = args.has("--intent-test") || process.env.CTO_E2E_INTENT_TEST === "1";
const useDevNav = args.has("--dev-nav");
const useLegacyOpenClawPath = args.has("--legacy-openclaw") || process.env.CTO_E2E_LEGACY_OPENCLAW === "1";
const timeoutMs = Number(process.env.CTO_E2E_TIMEOUT_MS ?? "900000");
const tauriMcpIpcPath = process.env.TAURI_MCP_IPC_PATH ?? "/tmp/tauri-mcp.sock";
const tauriMcpReadyTimeoutMs = Number(process.env.CTO_E2E_TAURI_MCP_READY_TIMEOUT_MS ?? "10000");
const intentRun = withIntentTest ? createIntentRun() : null;

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

async function main() {
  let runError;
  try {
    await assertTauriMcpReady();
    await withQuietTauriMcp(async () => {
      await installBrowserDiagnostics();

      // If the app is already on a setup screen, skip the setup-gate checks.
      const heading = await headingText().catch(() => "");
      const alreadyOnSetup = /Saved access|Cloudflare|Source|Harnesses|ACP CLIs|Providers|Models|Harness routing|Provider auth|Tool keys|Agent tokens/i.test(heading);
      if (alreadyOnSetup) {
        console.log("[e2e] App is already on setup screen:", heading);
        const checkpoint = /Saved access/i.test(heading) ? "02-saved-access" : /Cloudflare/i.test(heading) ? "03-endpoint" : /Source/i.test(heading) ? "04-source-configured" : "02-saved-access";
        await captureDomSnapshot(checkpoint);
        await navigateToSource();
        await failOnBrowserConsoleErrors("source navigation");
      } else {
        await captureDomSnapshot("00-setup-gate-before");
        await ensureSetupGateVisible();
        await captureDomSnapshot("01-setup-gate-visible");
        await failOnBrowserConsoleErrors("setup gate");

        if (shouldReset) {
          cleanupLocalStack();
          await waitForText(/CTO|local stack|Setup needs attention/i, 60_000);
          await captureDomSnapshot("02-after-reset");
          await failOnBrowserConsoleErrors("post-reset");
        }

        if (!useDevNav) {
          await prepareClusterDependenciesIfVisible();
          await captureDomSnapshot("02-cluster-dependencies");
          await navigateToSource();
          await failOnBrowserConsoleErrors("source navigation");
        }
      }

      await driveSetupFlow();
      await captureDomSnapshot("90-ready-to-start");
      await failOnBrowserConsoleErrors("setup flow");

      if (shouldStart) {
        await clickByText(/^Start$/i);
        await captureDomSnapshot("91-start-clicked");
        const smoke = withK8sSmoke ? startSmokeWatcher() : null;
        await waitForText(/Ready|Setup needs attention|Timed out|Bootstrap run log/i, timeoutMs);
        await captureDomSnapshot("92-bootstrap-finished");
        const text = await pageText();
        if (/Setup needs attention|Timed out/i.test(text)) {
          smoke?.kill();
          throw new Error(`bootstrap failed:\n${text.slice(0, 2000)}`);
        }
        if (smoke) await waitForSmoke(smoke);
      } else {
        console.log("Setup cycle reached the Start step. Pass --start to run the real bootstrap.");
      }
    });
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    finalizeIntentRun(runError);
  }
}

async function driveSetupFlow() {
  await leaveIntroIfNeeded();

  if (useDevNav) {
    for (let index = 0; index < 11; index += 1) {
      await clickByAriaLabel(/Next setup screen/i);
      await delay(250);
    }
    return;
  }

  await configureSourceIfVisible();
  await captureDomSnapshot("04-source-configured");
  await ensureGithubAuthorizationIfNeeded();
  await captureDomSnapshot("05-source-authorized");
  await continueToHeading(/Continue to harness selection/i, /Harnesses/i);
  await captureDomSnapshot("10-harnesses");
  if (useLegacyOpenClawPath) {
    await clickByText(/OpenClaw/i).catch(() => undefined);
    await captureDomSnapshot("11-harness-selected");
    await continueToHeading(/Continue to ACP CLIs/i, /ACP CLIs/i);
    await captureDomSnapshot("20-acp-clis");
    await selectChoice("Claude");
    await captureDomSnapshot("21-acp-cli-selected");
    await continueToHeading(/Continue to providers/i, /Providers/i);
    await captureDomSnapshot("30-providers");
    await selectChoice("OpenAI");
    await captureDomSnapshot("31-provider-selected");
  } else {
    await clickByText(/Hermes/i).catch(() => undefined);
    await captureDomSnapshot("11-harness-selected");
    await continueToHeading(/Continue to ACP CLIs/i, /ACP CLIs/i);
    await captureDomSnapshot("20-acp-clis");
    await selectChoice("Copilot");
    await captureDomSnapshot("21-acp-cli-selected");
    await continueToHeading(/Continue to providers/i, /Providers/i);
    await captureDomSnapshot("30-providers");
    await selectChoice("GitHub Copilot");
    await captureDomSnapshot("31-provider-selected");
  }
  await continueToHeading(/Configure provider authentication/i, /Models/i);
  await captureDomSnapshot("40-models");
  await continueToHeading(/Choose harness routing/i, /Harness routing/i);
  await captureDomSnapshot("50-harness-routing");
  await continueToHeading(/Configure provider authentication/i, /Provider auth/i);
  await captureDomSnapshot("60-provider-auth");
  await continueToHeading(/Configure tool API keys/i, /Tool keys/i);
  await captureDomSnapshot("70-tool-keys");
  await continueToHeading(/Configure agent Discord tokens/i, /Agent tokens/i);
  await captureDomSnapshot("80-agent-tokens");
  await waitForText(/Agent Discord bots|Start/i, 30_000);
}

async function captureDomSnapshot(label) {
  try {
    const raw = await executeJs(`(() => JSON.stringify({
      label: ${JSON.stringify("__LABEL__")},
      capturedAt: new Date().toISOString(),
      url: location.href,
      title: document.title,
      heading: document.querySelector('h1')?.textContent ?? '',
      text: document.body?.innerText ?? '',
      buttons: Array.from(document.querySelectorAll('button')).map((button) => ({
        text: (button.textContent || '').trim(),
        title: button.getAttribute('title') || '',
        aria: button.getAttribute('aria-label') || '',
        testId: button.getAttribute('data-testid') || '',
        disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
        visible: button.getClientRects().length > 0,
      })),
      inputs: Array.from(document.querySelectorAll('input, textarea, select')).map((input) => ({
        tag: input.tagName.toLowerCase(),
        type: input.getAttribute('type') || '',
        name: input.getAttribute('name') || '',
        placeholder: input.getAttribute('placeholder') || '',
        testId: input.getAttribute('data-testid') || '',
        value: input.value || '',
        visible: input.getClientRects().length > 0,
      })),
      selected: Array.from(document.querySelectorAll('[aria-pressed="true"], [aria-selected="true"], input:checked')).map((element) => ({
        text: (element.textContent || element.getAttribute('aria-label') || '').trim(),
        name: element.getAttribute('name') || '',
        value: element.value || element.getAttribute('value') || '',
        testId: element.getAttribute('data-testid') || '',
        visible: element.getClientRects().length > 0,
      })),
      controls: Array.from(document.querySelectorAll('button, input, textarea, select, [role="button"], [role="option"], [role="radio"], [role="checkbox"]')).map((element) => ({
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || '',
        text: (element.textContent || '').trim(),
        aria: element.getAttribute('aria-label') || '',
        title: element.getAttribute('title') || '',
        testId: element.getAttribute('data-testid') || '',
        name: element.getAttribute('name') || '',
        type: element.getAttribute('type') || '',
        value: 'value' in element ? element.value || '' : element.getAttribute('value') || '',
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        selected: Boolean(element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-selected') === 'true' || element.checked),
        visible: element.getClientRects().length > 0,
      })),
    }))()`.replace("__LABEL__", label));
    const parsed = JSON.parse(String(raw || "{}"));
    const artifact = writeDomSnapshotArtifact(label, parsed);
    recordIntentSnapshot(label, parsed, artifact);
    console.log(`[snapshot] ${artifact.svg}`);
  } catch (error) {
    console.warn(`[snapshot:${label}] failed: ${error instanceof Error ? error.message : error}`);
  }
}

function createIntentRun() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(process.cwd(), ".local", "e2e-intent-runs", runId);
  mkdirSync(runDir, { recursive: true });
  const contract = JSON.parse(readFileSync(new URL("./intent/morgan-setup.intent.json", import.meta.url), "utf8"));
  return { runId, runDir, contract, checkpoints: [], results: [] };
}

function recordIntentSnapshot(label, snapshot, artifact) {
  if (!intentRun) return;
  const screen = intentRun.contract.screens.find((candidate) => candidate.checkpoint === label);
  const result = screen ? evaluateSnapshotIntent(screen, snapshot) : null;
  const checkpoint = { label, artifact, snapshot, ...(result ? { intent: result } : {}) };
  intentRun.checkpoints.push(checkpoint);
  if (result) intentRun.results.push(result);
}

function finalizeIntentRun(error) {
  if (!intentRun) return;
  const failedResults = intentRun.results.filter((result) => result.status === "failed");
  const status = failedResults.length > 0 ? "failed" : error ? "blocked" : "passed";
  const manifest = {
    runId: intentRun.runId,
    status,
    error: error ? String(error instanceof Error ? error.message : error).slice(0, 3000) : null,
    completedCheckpoints: intentRun.checkpoints.map((checkpoint) => checkpoint.label),
    checkpoints: intentRun.checkpoints,
    results: intentRun.results,
  };
  writeFileSync(join(intentRun.runDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(intentRun.runDir, "report.md"), renderIntentReport(manifest));
  console.log(`[intent] ${join(intentRun.runDir, "report.md")}`);
}

function renderIntentReport(manifest) {
  const lines = [
    `# Morgan Setup Intent Test Report`,
    "",
    `- Run: ${manifest.runId}`,
    `- Status: ${manifest.status}`,
    `- Manifest: ${join(intentRun.runDir, "manifest.json")}`,
    "",
  ];
  if (manifest.error) lines.push("## Blocker", "", "```text", manifest.error, "```", "");
  lines.push("## Intent Results", "");
  for (const result of manifest.results) {
    lines.push(`### ${result.screen} · ${result.status}`, "");
    for (const assertion of result.assertions) {
      lines.push(`- ${assertion.status === "passed" ? "✅" : "❌"} ${assertion.name}${assertion.note ? ` — ${assertion.note}` : ""}`);
    }
    lines.push("");
  }
  lines.push("## Captured Checkpoints", "");
  for (const checkpoint of manifest.checkpoints) {
    lines.push(`- ${checkpoint.label}: ${checkpoint.artifact?.svg ?? checkpoint.artifact?.json ?? "artifact unavailable"}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function installBrowserDiagnostics() {
  await executeFunction(() => {
    if (window.__ctoE2eDiagnosticsInstalled) return true;
    const diagnostics = (window.__ctoE2eDiagnostics = window.__ctoE2eDiagnostics ?? {
      errors: [],
      warnings: [],
      network: [],
    });
    const push = (kind, value) => diagnostics[kind].push(String(value).slice(0, 1000));

    for (const level of ["error", "warn"]) {
      const original = console[level];
      console[level] = (...args) => {
        push(level === "error" ? "errors" : "warnings", args.map(String).join(" "));
        return original.apply(console, args);
      };
    }

    window.addEventListener("error", (event) => push("errors", event.message ?? "window error"));
    window.addEventListener("unhandledrejection", (event) => push("errors", event.reason?.message ?? event.reason ?? "unhandled rejection"));

    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = class CtoE2eWebSocket extends OriginalWebSocket {
      constructor(url, protocols) {
        super(url, protocols);
        const label = String(url);
        this.addEventListener("error", () => push("network", `WebSocket error: ${label}`));
        this.addEventListener("close", (event) => {
          if (!event.wasClean) push("network", `WebSocket close ${event.code}: ${label}`);
        });
      }
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    Object.defineProperty(window.WebSocket, "CONNECTING", { value: OriginalWebSocket.CONNECTING });
    Object.defineProperty(window.WebSocket, "OPEN", { value: OriginalWebSocket.OPEN });
    Object.defineProperty(window.WebSocket, "CLOSING", { value: OriginalWebSocket.CLOSING });
    Object.defineProperty(window.WebSocket, "CLOSED", { value: OriginalWebSocket.CLOSED });
    window.__ctoE2eDiagnosticsInstalled = true;
    return true;
  }, []);
}

async function drainBrowserDiagnostics() {
  return executeJs(`(() => {
    const diagnostics = window.__ctoE2eDiagnostics ?? { errors: [], warnings: [], network: [] };
    const snapshot = {
      errors: [...(diagnostics.errors ?? [])],
      warnings: [...(diagnostics.warnings ?? [])],
      network: [...(diagnostics.network ?? [])],
    };
    diagnostics.errors = [];
    diagnostics.warnings = [];
    diagnostics.network = [];
    return JSON.stringify(snapshot);
  })()`).then((value) => JSON.parse(String(value || "{}")));
}

async function failOnBrowserConsoleErrors(label) {
  const diagnostics = await drainBrowserDiagnostics();
  const failures = [...(diagnostics.errors ?? []), ...(diagnostics.network ?? [])].filter(
    (failure) => !isExpectedPreBootstrapNetworkDiagnostic(failure),
  );
  if (failures.length > 0) {
    throw new Error(`Browser diagnostics failed during ${label}:\n${failures.join("\n").slice(0, 3000)}`);
  }
  for (const warning of diagnostics.warnings ?? []) {
    console.warn(`[browser:${label}] ${warning}`);
  }
}

function isExpectedPreBootstrapNetworkDiagnostic(message) {
  return /WebSocket (?:error|close 1006): ws:\/\/localhost:8080\/morgan\/voice\/ws/.test(String(message));
}

async function withQuietTauriMcp(action) {
  const originalError = console.error;
  console.error = (...args) => {
    const message = args.map(String).join(" ");
    if (
      message.startsWith("Creating IPC socket client") ||
      message.startsWith("Connecting to ") ||
      message.startsWith("Connected to Tauri socket server") ||
      message.startsWith("Sending request:") ||
      message.startsWith("Received ") ||
      message.startsWith("Processing JSON response") ||
      message.startsWith("Socket connection closed")
    ) {
      return;
    }
    originalError(...args);
  };
  try {
    return await action();
  } finally {
    console.error = originalError;
    socketClient.client?.end?.();
  }
}

async function leaveIntroIfNeeded() {
  const heading = await headingText().catch(() => "");
  if (!heading) {
    await clickByText(/Start setup/i).catch(() => undefined);
  }
}

async function prepareClusterDependenciesIfVisible() {
  const text = await pageText().catch(() => "");
  const heading = await headingText().catch(() => "");
  if (/Source|Cloudflare|Saved access/i.test(heading)) return;
  if (!/Client Cluster|Local cluster|Prepare local cluster dependencies|Prepare Client Cluster baseline|Cluster baseline/i.test(text)) return;

  const canContinue = await executeFunction(() =>
    Array.from(document.querySelectorAll("button")).some(
      (candidate) => /Continue to saved access|Continue to Cloudflare|Continue to Source/i.test(candidate.getAttribute("title") ?? candidate.textContent ?? "") && !candidate.disabled,
    ),
  [],);
  if (canContinue) {
    await clickByText(/Continue/i);
    await waitForText(/Cloudflare|Source|Repository authorization/i, 60_000);
    return;
  }

  // If a Prepare/Retry/Start button is visible on the setup gate, click it immediately
  // so the bootstrap begins and waitForText can match progressing state.
  const canPrepareNow = await executeFunction(() => {
    const prepareButton = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /^(Prepare|Retry|Start)$/i.test(candidate.textContent?.trim() ?? ""),
    );
    return Boolean(prepareButton && !prepareButton.disabled);
  }, []);
  if (canPrepareNow) {
    await clickByText(/^(Prepare|Retry|Start)$/i);
  }

  await waitForText(/Cluster baseline ready|Continue to saved access|Continue to Cloudflare|Continue to Source|Cloudflare|Saved access|Source|Setup needs attention|Preparing/i, timeoutMs);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await executeFunction(() => {
      const text = document.body?.innerText ?? "";
      const prepareButton = Array.from(document.querySelectorAll("button")).find((candidate) =>
        /^(Prepare|Retry|Start)$/i.test(candidate.textContent?.trim() ?? ""),
      );
      const continueButton = Array.from(document.querySelectorAll("button")).find((candidate) =>
        /Continue to saved access|Continue to Cloudflare|Continue to Source/i.test(candidate.getAttribute("title") ?? candidate.textContent ?? ""),
      );
      return {
        failed: /Setup needs attention/i.test(text),
        source: /Source|Cloudflare|Saved access/i.test(document.querySelector("h1")?.textContent ?? ""),
        canPrepare: Boolean(prepareButton && !prepareButton.disabled),
        canContinue: Boolean(continueButton && !continueButton.disabled),
      };
    }, []);
    if (state.source) return;
    if (state.failed) {
      const afterText = await pageText();
      throw new Error(`cluster dependency preparation failed:\n${afterText.slice(0, 2000)}`);
    }
    if (state.canContinue) {
      await clickByText(/Continue/i);
      await waitForText(/Cloudflare|Saved access|Source|Repository authorization/i, 60_000);
      return;
    }
    if (state.canPrepare) {
      await clickByText(/^(Prepare|Retry|Start)$/i);
    }
    await delay(1000);
  }
  throw new Error("cluster dependency preparation stayed busy before Source became available");
}

async function ensureSetupGateVisible() {
  const text = await pageText().catch(() => "");
  if (/CTO|local stack|Setup needs attention/i.test(text)) return;

  const reset = await resetCompletedBootstrapViaDevControl();
  if (!reset) {
    throw new Error(
      "local stack setup gate is not visible; expected first-run setup or a development reset control after completed bootstrap.",
    );
  }

  await waitForText(/CTO|local stack|Setup needs attention/i, 60_000);
}

async function resetCompletedBootstrapViaDevControl() {
  return executeFunction(() => {
    const isVisible = (candidate) => candidate.getClientRects().length > 0;
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) =>
        isVisible(candidate) &&
        !candidate.disabled &&
        /Start over and clear the local CTO stack/i.test(candidate.getAttribute("aria-label") ?? ""),
    );
    if (!button) return false;
    window.confirm = () => true;
    button.click();
    return true;
  }, []);
}

async function navigateToSource() {
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const heading = await headingText();
      if (/Source/i.test(heading)) return;
      if (/Cloudflare/i.test(heading)) {
        await captureDomSnapshot("03-endpoint");
        await chooseEndpointIfVisible();
        await continueToHeading(/Continue to Source/i, /Source/i);
        continue;
      }
      if (/Saved access/i.test(heading)) {
        await captureDomSnapshot("02-saved-access");
        await chooseSavedAccessIfVisible();
        await continueToHeading(/Continue to Cloudflare/i, /Cloudflare/i);
        continue;
      }
      await clickByAriaLabel(/Previous setup screen/i);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  const suffix = lastError instanceof Error ? `; last navigation read failed: ${lastError.message}` : "";
  throw new Error(`could not navigate back to Source setup screen${suffix}`);
}

async function chooseEndpointIfVisible() {
  const heading = await headingText().catch(() => "");
  if (!/Cloudflare/i.test(heading)) return;
  await clickByTestId("cloudflare-endpoint-local").catch(() => clickByTestId("cloudflare-endpoint-cloudflare"));
}

async function chooseSavedAccessIfVisible() {
  const heading = await headingText().catch(() => "");
  if (!/Saved access/i.test(heading)) return;
  await clickByTestId("saved-access-skip").catch(() => clickByText(/Continue without saved access|Continue/i));
}

async function configureSourceIfVisible() {
  const heading = await headingText().catch(() => "");
  if (!/Source/i.test(heading)) return;

  const defaults = githubCredentialsForE2e();
  if (defaults.owner) {
    await setInputValue('input[placeholder="5DLabsInc"]', defaults.owner).catch(() => {
      console.log("[e2e] GitHub owner input not found; skipping source auto-fill");
    });
  }

  if (defaults.token) {
    await clickByText(/Review details/i).catch(() => undefined);
    await clickByTestId("source-auth-github-pat").catch(() => clickByText(/Use a personal access token instead/i).catch(() => undefined));
    await setInputValue('input[placeholder="github_pat_..."]', defaults.token).catch(() => {
      console.log("[e2e] GitHub PAT input not found; skipping token auto-fill");
    });
  }
}

function githubCredentialsForE2e() {
  const owner = process.env.CTO_E2E_GITHUB_OWNER ?? process.env.CTO_GITHUB_OWNER ?? githubOwnerFromCli();
  const token = githubTokenFallbackDisabled()
    ? undefined
    : (process.env.CTO_E2E_GITHUB_PAT ??
        process.env.CTO_GITHUB_PAT ??
        process.env.GITHUB_TOKEN ??
        githubTokenFromCli());
  return { owner, token };
}

function githubTokenFallbackDisabled() {
  return process.env.CTO_E2E_DISABLE_GITHUB_TOKEN_FALLBACK === "1";
}

function githubTokenFromCli() {
  const result = spawnSync("gh", ["auth", "token", "--hostname", "github.com"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return undefined;
  const token = result.stdout.trim();
  return token.length > 0 ? token : undefined;
}

function githubOwnerFromCli() {
  const result = spawnSync("gh", ["api", "user", "--jq", ".login"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return undefined;
  const owner = result.stdout.trim();
  return owner.length > 0 ? owner : undefined;
}

async function ensureGithubAuthorizationIfNeeded() {
  const heading = await headingText().catch(() => "");
  if (!/Source/i.test(heading)) return;

  const sourceReady = await executeFunction(() => {
    const continueButton = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /Continue to harness selection/i.test(candidate.getAttribute("title") ?? ""),
    );
    return Boolean(continueButton && !continueButton.disabled);
  }, []);
  if (sourceReady) return;

  const browserAutomation = maybeStartGithubDeviceBrowserAutomation();
  let authorizeClicked = false;
  try {
    authorizeClicked = await executeFunction(() => {
      const isVisible = (candidate) => candidate.getClientRects().length > 0;
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) =>
          isVisible(candidate) &&
          !candidate.disabled &&
          /Authorize with GitHub/i.test(
            `${candidate.textContent ?? ""} ${candidate.getAttribute("title") ?? ""} ${candidate.getAttribute("aria-label") ?? ""}`,
          ),
      );
      if (!button) return false;
      button.click();
      return true;
    }, []);

    if (!authorizeClicked) {
      throw new Error(
        "GitHub source is not ready and no token exists; expected an enabled Authorize with GitHub button.",
      );
    }

    await waitForText(
      /GitHub OAuth connected|GitHub credentials are already configured|Select the user or org|GitHub authorization timed out|GitHub OAuth task failed|gh auth token/i,
      180_000,
    );
    const text = await pageText();
    if (/GitHub authorization timed out|GitHub OAuth task failed|gh auth token/i.test(text)) {
      throw new Error(`GitHub authorization failed before setup could continue:\n${text.slice(0, 2000)}`);
    }
  } finally {
    browserAutomation?.kill?.();
  }
}

function maybeStartGithubDeviceBrowserAutomation() {
  if (process.env.CTO_E2E_GITHUB_BROWSER_AUTOMATION === "0") return null;
  if (process.env.CI && process.env.CTO_E2E_GITHUB_BROWSER_AUTOMATION !== "1") return null;

  const script = String.raw`
set -euo pipefail
for i in $(seq 1 240); do
  clip="$(pbpaste 2>/dev/null || true)"
  if printf '%s' "$clip" | grep -Eq '^[A-Z0-9]{4}-[A-Z0-9]{4}$|^[A-Z0-9-]{8,}$'; then
    code="$clip"
    osascript -e 'tell application "Google Chrome" to activate' \
      -e 'tell application "System Events" to keystroke "'"$code""'"' \
      -e 'tell application "System Events" to key code 36'
    sleep 2
    osascript -e 'tell application "Google Chrome" to activate' \
      -e 'tell application "System Events" to key code 36'
    exit 0
  fi
  sleep 1
done
exit 0
`;
  try {
    const child = spawn("bash", ["-lc", script], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return child;
  } catch {
    return null;
  }
}

async function continueFrom(titlePattern) {
  await clickByTitle(titlePattern);
  await delay(500);
}

async function continueTo(titlePattern, nextPattern) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await continueFrom(titlePattern);
    } catch (error) {
      lastError = error;
    }
    try {
      await waitForText(nextPattern, 10_000);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`text not found after ${titlePattern}: ${nextPattern}`);
}

async function continueToHeading(titlePattern, nextPattern) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (nextPattern.test(await headingText())) return;
    } catch (error) {
      lastError = error;
    }
    try {
      await continueFrom(titlePattern);
    } catch (error) {
      lastError = error;
    }
    try {
      await waitForHeading(nextPattern, 10_000);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`heading not found after ${titlePattern}: ${nextPattern}`);
}

async function selectChoice(name) {
  await waitForJs(
    (choiceName) => {
      const isVisible = (candidate) => candidate.getClientRects().length > 0;
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) =>
          isVisible(candidate) &&
          Array.from(candidate.querySelectorAll("strong")).some(
            (label) => label.textContent?.trim() === choiceName,
          ),
      );
      if (!button) return false;
      if (
        button.classList.contains("is-selected") ||
        button.closest(".is-selected") ||
        button.getAttribute("aria-pressed") === "true"
      ) {
        return true;
      }
      if (button.disabled) return false;
      button.click();
      return true;
    },
    [name],
    `choice not found: ${name}`,
  );
}

async function clickByText(pattern) {
  await waitForJs(
    (source, flags) => {
      const regex = new RegExp(source, flags);
      const isVisible = (candidate) => candidate.getClientRects().length > 0;
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        isVisible(candidate) &&
        (regex.test(candidate.textContent?.trim() ?? "") ||
          regex.test(candidate.getAttribute("title") ?? "") ||
          regex.test(candidate.getAttribute("aria-label") ?? "")),
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    },
    [pattern.source, pattern.flags],
    `button text not found: ${pattern}`,
  );
}

async function clickByTestId(testId) {
  await waitForJs(
    (id) => {
      const isVisible = (candidate) => candidate.getClientRects().length > 0;
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) => isVisible(candidate) && candidate.getAttribute("data-testid") === id,
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    },
    [testId],
    `button test id not found: ${testId}`,
  );
}

async function clickByTitle(pattern) {
  await waitForJs(
    (source, flags) => {
      const regex = new RegExp(source, flags);
      const isVisible = (candidate) => candidate.getClientRects().length > 0;
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        isVisible(candidate) &&
        (regex.test(candidate.getAttribute("title") ?? "") ||
          regex.test(candidate.getAttribute("aria-label") ?? "") ||
          regex.test(candidate.textContent?.trim() ?? "")),
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    },
    [pattern.source, pattern.flags],
    `button title not found: ${pattern}`,
  );
}

async function clickByAriaLabel(pattern) {
  await waitForJs(
    (source, flags) => {
      const regex = new RegExp(source, flags);
      const isVisible = (candidate) => candidate.getClientRects().length > 0;
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        isVisible(candidate) && regex.test(candidate.getAttribute("aria-label") ?? ""),
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    },
    [pattern.source, pattern.flags],
    `button aria-label not found: ${pattern}`,
  );
}

async function setInputValue(selector, value) {
  await waitForJs(
    (inputSelector, nextValue) => {
      const input = document.querySelector(inputSelector);
      if (!input) return false;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      descriptor?.set?.call(input, nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    [selector, value],
    `input not found: ${selector}`,
  );
}

async function waitForText(pattern, timeout) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (pattern.test(await pageText())) return;
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  const suffix = lastError instanceof Error ? `; last page read failed: ${lastError.message}` : "";
  throw new Error(`text not found: ${pattern}${suffix}`);
}

async function waitForHeading(pattern, timeout) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (pattern.test(await headingText())) return;
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  const suffix = lastError instanceof Error ? `; last heading read failed: ${lastError.message}` : "";
  throw new Error(`heading not found: ${pattern}${suffix}`);
}

async function waitForJs(fn, fnArgs, message) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await executeFunction(fn, fnArgs)) return;
    } catch (error) {
      lastError = error;
    }
    await delay(300);
  }
  const suffix = lastError instanceof Error ? `; last JS failed: ${lastError.message}` : "";
  throw new Error(`${message}${suffix}`);
}

async function pageText() {
  return String(await executeJs("document.body?.innerText ?? ''"));
}

async function headingText() {
  return String(await executeJs("document.querySelector('h1')?.textContent ?? ''"));
}

async function executeJs(code) {
  try {
    const result = await socketClient.sendCommand("execute_js", {
      window_label: "main",
      code,
    });
    return result.result ?? result.content;
  } catch (error) {
    socketClient.client?.end?.();
    socketClient.client = undefined;
    throw error;
  }
}

async function executeFunction(fn, fnArgs) {
  const source = `(${fn.toString()})(...${JSON.stringify(fnArgs)})`;
  const result = await executeJs(source);
  return result === true || result === "true" || result?.value === true;
}

async function assertTauriMcpReady() {
  const deadline = Date.now() + tauriMcpReadyTimeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      await probeTauriMcpSocket();
      return;
    } catch (error) {
      lastError = error;
      await delay(300);
    }
  }

  const suffix = lastError instanceof Error ? ` Last socket error: ${lastError.message}` : "";
  throw new Error(
    `Tauri MCP socket is not reachable at ${tauriMcpIpcPath}. ` +
      `Start the debug desktop app before running this macOS E2E runner, for example: ` +
      `npm run tauri:dev. ` +
      `The runner will not start a detached Tauri process because the webview listener must stay stable for the full setup flow.` +
      suffix,
  );
}

function probeTauriMcpSocket() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: tauriMcpIpcPath });
    socket.once("connect", () => {
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
    socket.setTimeout(1_000, () => {
      socket.destroy();
      reject(new Error("socket probe timed out"));
    });
  });
}

function cleanupLocalStack() {
  const result = spawnSync("scripts/cleanup-local-stack.sh", ["--yes", "--remove-bootstrap-profile"], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`local stack cleanup failed with exit ${result.status ?? 1}`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startSmokeWatcher() {
  const smoke = startKubernetesSmoke(["--timeout-ms", String(timeoutMs)]);
  smoke.stdout.on("data", (chunk) => process.stdout.write(`[k8s-smoke] ${chunk}`));
  smoke.stderr.on("data", (chunk) => process.stderr.write(`[k8s-smoke] ${chunk}`));
  return smoke;
}

function waitForSmoke(smoke) {
  return new Promise((resolve, reject) => {
    smoke.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Kubernetes smoke watcher exited with ${code}`));
    });
  });
}
