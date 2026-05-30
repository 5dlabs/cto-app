#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
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
const visualRun = createVisualRun();

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
      const alreadyOnSetup = /Secrets|Saved access|Cloudflare|Source|Harnesses|ACP CLIs|Providers|Models|Harness routing|Provider auth|Tool keys|Agent tokens/i.test(heading);
      if (alreadyOnSetup) {
        console.log("[e2e] App is already on setup screen:", heading);
        const checkpoint = /Secrets|Saved access/i.test(heading)
          ? "02-saved-access"
          : /Cloudflare/i.test(heading)
            ? "03-endpoint"
            : /Source/i.test(heading)
              ? "04-source-configured"
              : "00-current-setup-screen";
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
    await captureDevNavCheckpoint("02-saved-access");
    await captureDevNavCheckpoint("03-endpoint");
    await captureDevNavCheckpoint("04-source-configured");
    await captureDevNavCheckpoint("10-harnesses");
    await captureDevNavCheckpoint("20-acp-clis");
    await captureDevNavCheckpoint("30-providers");
    await captureDevNavCheckpoint("40-models");
    await captureDevNavCheckpoint("50-harness-routing");
    await captureDevNavCheckpoint("60-provider-auth");
    await captureDevNavCheckpoint("70-tool-keys");
    await captureDevNavCheckpoint("80-agent-tokens");
    return;
  }

  await configureSourceIfVisible();
  await captureDomSnapshot("04-source-configured");
  await ensureGithubAuthorizationIfNeeded();
  await captureDomSnapshot("05-source-authorized");
  await ensureCurrentHeading(/Source/i, "source authorization");
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
        className: button.getAttribute('class') || '',
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
        className: element.getAttribute('class') || '',
        visible: element.getClientRects().length > 0,
      })),
    }))()`.replace("__LABEL__", label));
    const parsed = typeof raw === "string" ? JSON.parse(String(raw || "{}")) : (raw ?? {});
    const visualArtifact = await captureVisualFeedbackArtifact(label, parsed);
    if (visualArtifact) parsed.visualArtifact = visualArtifact;
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

function createVisualRun() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(process.cwd(), ".local", "e2e-visual-runs", runId);
  mkdirSync(runDir, { recursive: true });
  return { runId, runDir, artifacts: [] };
}

async function captureVisualFeedbackArtifact(label, snapshot = {}) {
  const safeLabel = label.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const mediaState = await captureMediaState(label).catch((error) => ({
    label,
    capturedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  }));
  const screenshotPath = join(visualRun.runDir, `${safeLabel}.png`);
  let screenshot = null;
  try {
    const result = await sendTauriMcpCommand("take_screenshot", { window_label: "main" });
    const raw = result?.screenshot ?? result?.image ?? result?.data ?? result?.content ?? result?.result ?? result;
    const base64 = typeof raw === "string" && raw.startsWith("data:") ? raw.split(",").pop() : raw;
    if (typeof base64 === "string" && base64.length > 0) {
      writeFileSync(screenshotPath, Buffer.from(base64, "base64"));
      screenshot = screenshotPath;
    }
  } catch (error) {
    screenshot = { error: error instanceof Error ? error.message : String(error) };
  }
  const artifact = {
    label,
    capturedAt: new Date().toISOString(),
    heading: snapshot.heading ?? null,
    screenshot,
    mediaState,
  };
  const artifactPath = join(visualRun.runDir, `${safeLabel}.media-state.json`);
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  visualRun.artifacts.push({ label, screenshot, mediaState: artifactPath });
  console.log(`[visual] ${artifactPath}${typeof screenshot === "string" ? ` ${screenshot}` : ""}`);
  return { json: artifactPath, screenshot };
}

async function captureMediaState(label) {
  const raw = await executeJs(`(() => {
    const video = document.querySelector('.local-bootstrap__avatar video, video[data-morgan-media-key], video');
    const audio = document.querySelector('.local-bootstrap__avatar audio, audio');
    return JSON.stringify({
      label: ${JSON.stringify("__LABEL__")},
      capturedAt: new Date().toISOString(),
      href: location.href,
      heading: document.querySelector('h1')?.textContent?.trim() ?? null,
      hasFallbackImage: Boolean(document.querySelector('.local-bootstrap__avatar img')),
      mediaState: {
        video: video ? {
          src: video.currentSrc || video.src || '',
          key: video.dataset?.morganMediaKey ?? null,
          readyState: video.readyState,
          networkState: video.networkState,
          muted: video.muted,
          defaultMuted: video.defaultMuted,
          attrMuted: video.hasAttribute('muted'),
          volume: video.volume,
          paused: video.paused,
          ended: video.ended,
          currentTime: video.currentTime,
          duration: Number.isFinite(video.duration) ? video.duration : null,
          width: video.videoWidth,
          height: video.videoHeight,
          error: video.error ? { code: video.error.code, message: video.error.message } : null,
        } : null,
        audio: audio ? {
          src: audio.currentSrc || audio.src || '',
          paused: audio.paused,
          currentTime: audio.currentTime,
          duration: Number.isFinite(audio.duration) ? audio.duration : null,
          error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
        } : null,
      },
      consoleEvents: (window.__ctoConsoleEvents || []).slice(-50),
    });
  })()`.replace("__LABEL__", label));
  return typeof raw === "string" ? JSON.parse(String(raw || "{}")) : (raw ?? {});
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
  const actionableResults = intentRun.results.filter((result) => result.screen !== "saved-access");
  const failedResults = actionableResults.filter((result) => result.status === "failed");
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
    window.__ctoConsoleEvents = window.__ctoConsoleEvents ?? [];
    const push = (kind, value) => diagnostics[kind].push(String(value).slice(0, 1000));
    const pushConsoleEvent = (level, args) => {
      window.__ctoConsoleEvents.push({
        ts: new Date().toISOString(),
        level,
        message: Array.from(args).map((arg) => {
          try {
            return typeof arg === "string" ? arg : JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }).join(" ").slice(0, 1000),
      });
      if (window.__ctoConsoleEvents.length > 200) {
        window.__ctoConsoleEvents.splice(0, window.__ctoConsoleEvents.length - 200);
      }
    };

    for (const level of ["log", "info", "debug", "error", "warn"]) {
      const original = console[level];
      console[level] = (...args) => {
        pushConsoleEvent(level, args);
        if (level === "error" || level === "warn") push(level === "error" ? "errors" : "warnings", args.map(String).join(" "));
        return original.apply(console, args);
      };
    }

    window.addEventListener("error", (event) => {
      push("errors", event.message ?? "window error");
      pushConsoleEvent("uncaught-error", [event.message ?? "window error"]);
    });
    window.addEventListener("unhandledrejection", (event) => {
      const message = event.reason?.message ?? event.reason ?? "unhandled rejection";
      push("errors", message);
      pushConsoleEvent("unhandledrejection", [message]);
    });

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
  })()`).then((value) => (typeof value === "string" ? JSON.parse(String(value || "{}")) : (value ?? {})));
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
  return (
    /WebSocket (?:error|close 1006): ws:\/\/localhost:8080\/morgan\/voice\/ws/.test(String(message)) ||
    /Morgan (?:MP4 playback failed|visual video failed to load) \[object Object\]/.test(String(message))
  );
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
    closeSocketClient();
  }
}

async function leaveIntroIfNeeded() {
  const heading = await headingText().catch(() => "");
  if (!heading || /CTO|Welcome/i.test(heading)) {
    await advanceDevNavScreen();
    await waitForText(/Secrets|Saved access|Cloudflare|Source|Repository authorization|Harnesses|Prepare local cluster/i, 60_000).catch(() => undefined);
  }
}

async function advanceDevNavScreen() {
  return executeFunction(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const button = buttons.find((candidate) => {
      if (candidate.disabled || candidate.getClientRects().length === 0) return false;
      const label = `${candidate.getAttribute("aria-label") ?? ""} ${candidate.getAttribute("title") ?? ""} ${candidate.textContent ?? ""}`;
      return /Next setup screen|Start setup|Get started|Continue|Prepare/i.test(label);
    });
    if (!button) return false;
    button.click();
    return true;
  }, []);
}

async function captureDevNavCheckpoint(label) {
  if (!useDevNav) return;
  const screen = label.split("-").slice(1).join("-");
  const changed = await executeFunction((targetScreen) => {
    const search = new URLSearchParams(window.location.search);
    search.set("setup", "1");
    search.set("setupScreen", targetScreen);
    window.history.replaceState({}, "", `${window.location.pathname}?${search.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return true;
  }, [screen]).catch(() => false);
  if (!changed) {
    await advanceDevNavScreen();
  }
  await delay(500);
  await captureDomSnapshot(label);
}

async function prepareClusterDependenciesIfVisible() {
  const text = await pageText().catch(() => "");
  const heading = await headingText().catch(() => "");
  if (/Source|Cloudflare|Secrets|Saved access/i.test(heading)) return;
  if (!/CTO|Client Cluster|Local cluster|Prepare local cluster dependencies|Prepare Client Cluster baseline|Cluster baseline/i.test(text)) return;

  const canPrepareNow = await executeFunction(() => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /^(Prepare|Retry|Start)$/i.test(candidate.textContent?.trim() ?? ""),
    );
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, []);

  if (!canPrepareNow) {
    const advanced = await executeFunction(() => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        /Continue to saved access|Continue to Cloudflare|Continue to Source/i.test(candidate.getAttribute("title") ?? candidate.textContent ?? "") && !candidate.disabled,
      );
      if (!button) return false;
      button.click();
      return true;
    }, []);
    if (advanced) {
      await waitForText(/Secrets|Cloudflare|Saved access|Source|Repository authorization/i, 60_000);
      return;
    }
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await executeJs(`(() => {
      const text = document.body?.innerText ?? "";
      const heading = document.querySelector("h1")?.textContent ?? "";
      const prepareButton = Array.from(document.querySelectorAll("button")).find((candidate) =>
        /^(Prepare|Retry|Start)$/i.test(candidate.textContent?.trim() ?? ""),
      );
      const continueButton = Array.from(document.querySelectorAll("button")).find((candidate) =>
        /Continue to saved access|Continue to Cloudflare|Continue to Source/i.test(candidate.getAttribute("title") ?? candidate.textContent ?? ""),
      );
      const baselineReady = /Client Cluster baseline is ready|Cluster baseline ready/i.test(text);
      const onNextScreen = /Secrets|Saved access|Cloudflare|Source/i.test(heading);
      if (onNextScreen) return { done: true, failed: false, heading };
      if (/Setup needs attention/i.test(text)) return { done: false, failed: true, heading };
      if ((baselineReady || continueButton) && continueButton && !continueButton.disabled) {
        continueButton.click();
        return { done: false, failed: false, clicked: "continue", heading };
      }
      if (baselineReady) {
        const fallback = Array.from(document.querySelectorAll("button")).find((candidate) =>
          !candidate.disabled && /Start|Continue/i.test((candidate.textContent ?? "") + " " + (candidate.getAttribute("title") ?? "")),
        );
        fallback?.click();
        return { done: false, failed: false, clicked: fallback ? "fallback" : "none", heading };
      }
      if (prepareButton && !prepareButton.disabled) {
        prepareButton.click();
        return { done: false, failed: false, clicked: "prepare", heading };
      }
      return { done: false, failed: false, heading };
    })()`);
    if (state?.done) return;
    if (state?.failed) {
      const afterText = await pageText();
      throw new Error(`cluster dependency preparation failed:\n${afterText.slice(0, 2000)}`);
    }
    await delay(1000);
  }
  throw new Error("cluster dependency preparation stayed busy before Source became available");
}

async function ensureSetupGateVisible() {
  const text = await pageText().catch(() => "");
  if (/CTO|local stack|Setup needs attention|Secrets|Cloudflare|Saved access|Source/i.test(text)) return;

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
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      const state = await executeFunction(() => {
        const heading = document.querySelector("h1")?.textContent ?? "";
        const text = document.body?.innerText ?? "";
        const buttons = Array.from(document.querySelectorAll("button"));
        const visible = (candidate) => candidate.getClientRects().length > 0;
        const clickByTestId = (testId) => {
          const button = buttons.find((candidate) => candidate.getAttribute("data-testid") === testId && visible(candidate) && !candidate.disabled);
          if (!button) return false;
          button.click();
          return true;
        };
        const clickMatching = (pattern) => {
          const button = buttons.find((candidate) => {
            const label = (candidate.textContent ?? "") + " " + (candidate.getAttribute("title") ?? "") + " " + (candidate.getAttribute("aria-label") ?? "");
            return visible(candidate) && !candidate.disabled && pattern.test(label);
          });
          if (!button) return false;
          button.click();
          return true;
        };
        if (/Source/i.test(heading)) return { done: true, heading };
        if (/Agent tokens/i.test(heading)) {
          clickMatching(/Back to tool API keys/i);
          return { done: false, clicked: "agent-tokens-back", heading };
        }
        if (/Tool keys/i.test(heading)) {
          clickMatching(/Back to provider authentication/i);
          return { done: false, clicked: "tool-keys-back", heading };
        }
        if (/Provider auth/i.test(heading)) {
          clickMatching(/Back to harness routing/i);
          return { done: false, clicked: "provider-auth-back", heading };
        }
        if (/Harness routing/i.test(heading)) {
          clickMatching(/Back to provider models/i);
          return { done: false, clicked: "harness-routing-back", heading };
        }
        if (/Models/i.test(heading)) {
          clickMatching(/Back to providers/i);
          return { done: false, clicked: "models-back", heading };
        }
        if (/Providers/i.test(heading)) {
          clickMatching(/Back to ACP CLIs/i);
          return { done: false, clicked: "providers-back", heading };
        }
        if (/ACP CLIs/i.test(heading)) {
          clickMatching(/Back to harness selection/i);
          return { done: false, clicked: "clis-back", heading };
        }
        if (/Harnesses/i.test(heading)) {
          clickMatching(/Back to source/i);
          return { done: false, clicked: "harnesses-back", heading };
        }
        if (/Cloudflare/i.test(heading)) {
          clickByTestId("cloudflare-endpoint-local") || clickByTestId("cloudflare-endpoint-cloudflare");
          clickMatching(/Continue to Source/i);
          return { done: false, clicked: "endpoint", heading };
        }
        if (/Secrets/i.test(heading)) {
          const clickedSkip = clickByTestId("saved-access-skip") || clickMatching(/Continue without a secret manager|Continue without saved access/i);
          const modalContinue = buttons.find((candidate) => visible(candidate) && !candidate.disabled && /Continue to Cloudflare/i.test(candidate.getAttribute("title") ?? ""));
          modalContinue?.click();
          return { done: false, clicked: modalContinue ? "saved-access-modal-continue" : clickedSkip ? "saved-access" : "none", heading };
        }
        clickMatching(/Previous setup screen/i);
        return { done: false, clicked: "previous", heading, text: text.slice(0, 160) };
      }, []);
      if (state?.done) return;
      const heading = await headingText().catch(() => "");
      if (/Cloudflare/i.test(heading)) await captureDomSnapshot("03-endpoint");
      if (/Secrets/i.test(heading)) await captureDomSnapshot("02-saved-access");
    } catch (error) {
      lastError = error;
    }
    await delay(1000);
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
  if (!/Secrets/i.test(heading)) return;
  await executeFunction(() => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      candidate.getAttribute("data-testid") === "saved-access-skip" && !candidate.disabled,
    );
    button?.click();
    const modalContinue = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /Continue to Cloudflare/i.test(candidate.getAttribute("title") ?? ""),
    );
    modalContinue?.click();
    return true;
  }, []);
}

async function configureSourceIfVisible() {
  const heading = await headingText().catch(() => "");
  if (!/Source/i.test(heading)) return;

  const defaults = githubCredentialsForE2e();
  if (defaults.owner || defaults.token) {
    await executeFunction((owner, token) => {
      window.__ctoE2eSourceDefaults = { owner, token };
      const visible = (candidate) => candidate.getClientRects().length > 0;
      const click = (pattern) => {
        const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
          visible(candidate) &&
          !candidate.disabled &&
          pattern.test(`${candidate.textContent ?? ""} ${candidate.getAttribute("title") ?? ""} ${candidate.getAttribute("aria-label") ?? ""}`),
        );
        if (!button) return false;
        button.click();
        return true;
      };
      if (token) click(/Paste token/i);
      return true;
    }, [defaults.owner ?? "", defaults.token ?? ""]);
    await delay(750);
    const configured = await executeFunction(() => {
      const values = window.__ctoE2eSourceDefaults ?? {};
      const setValue = (selector, value) => {
        if (!value) return true;
        const input = document.querySelector(selector);
        if (!input) return false;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };
      let changed = false;
      if (values.owner) changed = setValue('input[placeholder="5DLabsInc"]', values.owner) || changed;
      if (values.token) changed = setValue('input[placeholder="github_pat_..."]', values.token) || changed;
      return changed;
    }, []);
    if (!configured) console.log("[e2e] GitHub source auto-fill controls not found; continuing with visible defaults");
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

  const readiness = await executeFunction(() => {
    const continueButton = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /Continue to harness selection/i.test(candidate.getAttribute("title") ?? ""),
    );
    const text = document.body?.innerText ?? "";
    const authorized = /GitHub OAuth connected|GitHub credentials are already configured|Select the user or org|GITHUB PAT/i.test(text);
    return { ready: Boolean(continueButton && !continueButton.disabled), authorized, continueDisabled: Boolean(continueButton?.disabled) };
  }, []);
  if (readiness?.ready && readiness?.authorized) return;
  if (readiness?.ready && !readiness?.authorized) {
    throw new Error("Source Continue is enabled before visible authorization evidence; refusing to advance from unauthenticated Source state.");
  }

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

async function ensureCurrentHeading(pattern, label) {
  const heading = await headingText().catch(() => "");
  if (pattern.test(heading)) return;
  const text = await pageText().catch(() => "");
  throw new Error(`expected ${label} heading ${pattern}, saw ${JSON.stringify(heading)}: ${text.slice(0, 500)}`);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitForHeadingChange(previousHeading, timeout = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const nextHeading = await headingText().catch(() => "");
    if (nextHeading && nextHeading !== previousHeading) return nextHeading;
    await delay(100);
  }
  throw new Error(`heading did not change from ${previousHeading || "<empty>"}`);
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

function parseExecuteResult(result) {
  const value = result?.result ?? result?.content;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

async function executeJs(code) {
  const result = await sendTauriMcpCommand("execute_js", {
    window_label: "main",
    code,
  });
  return parseExecuteResult(result);
}

async function sendTauriMcpCommand(command, payload = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await sendTauriMcpCommandOnce(command, payload);
    } catch (error) {
      lastError = error;
      if (!/Timeout waiting for JS execution|Request timed out/i.test(String(error?.message ?? error))) throw error;
      await sleep(250);
    }
  }
  throw lastError;
}

async function sendTauriMcpCommandOnce(command, payload = {}) {
  const requestId = `${Date.now()}${Math.random().toString(36).slice(2)}`;
  const request = JSON.stringify({ command, payload, id: requestId }) + "\n";
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: tauriMcpIpcPath });
    let buffer = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Request timed out after 30 seconds"));
    }, 30_000);
    socket.on("connect", () => socket.write(request));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.trim()) continue;
        let response;
        try {
          response = JSON.parse(line);
        } catch (error) {
          clearTimeout(timeout);
          socket.destroy();
          reject(error);
          return;
        }
        if (response.id && response.id !== requestId) continue;
        clearTimeout(timeout);
        socket.end();
        if (!response.success) {
          reject(new Error(response.error || "Command failed without specific error"));
        } else {
          resolve(response.data);
        }
        return;
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function closeSocketClient() {
  // No-op: the runner uses short-lived per-command socket clients to avoid
  // the plugin client's automatic reconnect loop after MCP timeouts.
}

async function executeFunction(fn, fnArgs) {
  const source = `(${fn.toString()})(...${JSON.stringify(fnArgs)})`;
  return executeJs(source);
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
