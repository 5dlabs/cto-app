import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import { Builder, Capabilities } from "selenium-webdriver";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const appBinary = path.join(
  repoRoot,
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32" ? "cto-app.exe" : "cto-app",
);
const startRealBootstrap = process.env.CTO_E2E_START_BOOTSTRAP === "1";
const resetBeforeRun = process.env.CTO_E2E_RESET === "1";
const testTimeoutMs = Number(process.env.CTO_E2E_TIMEOUT_MS ?? "900000");

let driver;
let tauriDriver;
let intentionalShutdown = false;

before(async function setupTauriDriver() {
  this.timeout(180_000);

  if (process.platform === "darwin") {
    throw new Error(
      "Tauri WebDriver is not supported on macOS WKWebView. Use `npm run e2e:local-stack-cycle` locally.",
    );
  }

  const build = spawnSync("npm", ["run", "tauri", "--", "build", "--debug", "--no-bundle"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_CTO_MORGAN_AUTOSTART: process.env.VITE_CTO_MORGAN_AUTOSTART ?? "0",
      VITE_CTO_FORCE_LOCAL_STACK_BOOTSTRAP:
        process.env.VITE_CTO_FORCE_LOCAL_STACK_BOOTSTRAP ?? "1",
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  expect(build.status).to.equal(0);

  const tauriDriverBinary =
    process.env.TAURI_DRIVER ??
    path.join(os.homedir(), ".cargo", "bin", process.platform === "win32" ? "tauri-driver.exe" : "tauri-driver");

  tauriDriver = spawn(tauriDriverBinary, [], {
    stdio: ["ignore", process.stdout, process.stderr],
  });
  tauriDriver.on("error", (error) => {
    console.error("tauri-driver error:", error);
    process.exit(1);
  });
  tauriDriver.on("exit", (code) => {
    if (!intentionalShutdown) {
      console.error("tauri-driver exited unexpectedly:", code);
      process.exit(1);
    }
  });

  const capabilities = new Capabilities();
  capabilities.set("tauri:options", { application: appBinary });
  capabilities.setBrowserName("wry");

  driver = await new Builder()
    .withCapabilities(capabilities)
    .usingServer(`http://127.0.0.1:${process.env.TAURI_DRIVER_PORT ?? "4444"}/`)
    .build();
});

after(async function teardownTauriDriver() {
  await closeTauriDriver();
});

describe("local stack setup", () => {
  it("can cycle through the first-run setup flow", async function testSetupCycle() {
    this.timeout(testTimeoutMs);

    await waitForText(/CTO|local stack|Setup needs attention/i, 60_000);

    if (resetBeforeRun) {
      await executeDom("window.confirm = () => true;");
      await clickByAriaLabel(/Start over and clear the local CTO stack/i);
      await waitForText(/Source|GitHub owner|local stack/i, 180_000);
    }

    await driveSetupFlow();

    if (startRealBootstrap) {
      await clickByText(/^Start$/i);
      await waitForText(/Ready|Setup needs attention|Timed out|Bootstrap run log/i, testTimeoutMs);
      const text = await bodyText();
      expect(text).not.to.match(/Setup needs attention|Timed out/i);
    }
  });
});

async function driveSetupFlow() {
  await leaveIntroIfNeeded();
  await configureSourceIfVisible();
  await continueFrom(/Continue to harness selection/i);
  await clickByText(/^OpenClaw$/i).catch(() => undefined);
  await continueFrom(/Continue to ACP CLIs/i);
  await clickByText(/^Claude$/i).catch(() => undefined);
  await continueFrom(/Continue to providers/i);
  await clickProvider("OpenAI");
  await continueFrom(/Configure provider authentication/i);
  await continueFrom(/Choose harness routing/i);
  await continueFrom(/Configure provider authentication/i);
  await continueFrom(/Configure tool API keys/i);
  await continueFrom(/Configure agent Discord tokens/i);
  await waitForText(/Agent Discord bots|Start/i, 30_000);
}

async function leaveIntroIfNeeded() {
  if (/Start setup/i.test(await bodyText())) {
    await clickByText(/Start setup/i);
  }
}

async function configureSourceIfVisible() {
  if (!/GitHub owner or org/i.test(await bodyText())) return;

  const owner = process.env.CTO_E2E_GITHUB_OWNER ?? process.env.CTO_GITHUB_OWNER;
  if (owner) {
    await setInputValue('input[placeholder="5DLabsInc"]', owner);
  }

  const token = process.env.CTO_E2E_GITHUB_PAT ?? process.env.CTO_GITHUB_PAT ?? process.env.GITHUB_TOKEN;
  if (token) {
    await clickByText(/Personal access token/i);
    await setInputValue('input[placeholder="github_pat_..."]', token);
  }
}

async function continueFrom(titlePattern) {
  await clickByTitle(titlePattern);
}

async function clickProvider(name) {
  await waitForDom(
    (providerName) => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === providerName,
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    },
    [name],
    `provider not found: ${name}`,
  );
}

async function clickByText(pattern) {
  await waitForDom(
    (source, flags) => {
      const regex = new RegExp(source, flags);
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        regex.test(candidate.textContent?.trim() ?? ""),
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    },
    [pattern.source, pattern.flags],
    `button text not found: ${pattern}`,
  );
}

async function clickByTitle(pattern) {
  await waitForDom(
    (source, flags) => {
      const regex = new RegExp(source, flags);
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        regex.test(candidate.getAttribute("title") ?? ""),
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
  await waitForDom(
    (source, flags) => {
      const regex = new RegExp(source, flags);
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        regex.test(candidate.getAttribute("aria-label") ?? ""),
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
  await waitForDom(
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
  while (Date.now() < deadline) {
    if (pattern.test(await bodyText())) return;
    await delay(500);
  }
  throw new Error(`text not found: ${pattern}`);
}

async function waitForDom(fn, fnArgs, message) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await executeFunction(fn, fnArgs)) return;
    await delay(300);
  }
  throw new Error(message);
}

async function bodyText() {
  return driver.executeScript("return document.body?.innerText ?? '';");
}

async function executeFunction(fn, fnArgs) {
  return driver.executeScript(`return (${fn.toString()})(...arguments);`, ...fnArgs);
}

async function executeDom(script) {
  return driver.executeScript(script);
}

async function closeTauriDriver() {
  intentionalShutdown = true;
  await driver?.quit().catch(() => undefined);
  tauriDriver?.kill();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(signal, () => {
    void closeTauriDriver().finally(() => process.exit());
  });
}
