import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const rustSource = readFileSync(resolve(repoRoot, "src-tauri/src/bootstrap.rs"), "utf8");
const reactSource = readFileSync(resolve(repoRoot, "ui/src/components/LocalStackBootstrap.tsx"), "utf8");
const apiSource = readFileSync(resolve(repoRoot, "ui/src/api/sourceControlProvisioning.ts"), "utf8");

describe("1Password saved access readiness contract", () => {
  it("detects desktop, CLI, account exposure, and vault metadata access separately", () => {
    assert.match(rustSource, /desktop_installed: bool/);
    assert.match(rustSource, /cli_installed: bool/);
    assert.match(rustSource, /cli_access_ready: bool/);
    assert.match(rustSource, /account_configured: bool/);
    assert.match(rustSource, /"op"[\s\S]*"vault"[\s\S]*"list"[\s\S]*"--format"[\s\S]*"json"/);
    assert.match(rustSource, /no accounts configured/);
    assert.match(rustSource, /turn on the 1password desktop app integration/);
  });

  it("exposes an install-and-retry path for missing CLI", () => {
    assert.match(apiSource, /installOnePasswordCli/);
    assert.match(apiSource, /install_onepassword_cli/);
    assert.match(reactSource, /installOnePasswordCli/);
    assert.match(reactSource, /installSavedAccessCliAndRetry/);
    assert.match(reactSource, /action: "install-cli"/);
    assert.match(reactSource, /await previewSavedAccess\(detection\)/);
  });

  it("opens official 1Password app integration guidance when desktop integration is off", () => {
    assert.match(apiSource, /desktopAppIntegrationEnabled\?: boolean/);
    assert.match(rustSource, /desktop_app_integration_enabled: bool/);
    assert.match(rustSource, /onepassword_desktop_app_integration_enabled/);
    assert.match(reactSource, /ONEPASSWORD_DESKTOP_CLI_SETTINGS_URL/);
    assert.match(reactSource, /onePassword\?\.cliInstalled && onePassword\?\.desktopAppIntegrationEnabled === false/);
    assert.match(reactSource, /openExternalUrl\(ONEPASSWORD_DESKTOP_CLI_SETTINGS_URL\)/);
  });

  it("maps deterministic readiness branches to the compact bar and Morgan cues", () => {
    for (const branch of ["missing-desktop", "missing-cli", "desktop-integration", "needs-access", "no-account", "ready"]) {
      assert.match(reactSource, new RegExp(`case "${branch}"|onepassword-${branch}\\.mp3|is-${branch}`));
    }
    assert.match(reactSource, /data-testid="saved-access-readiness"/);
    assert.match(reactSource, /data-state=\{savedAccessCue\}/);
    assert.doesNotMatch(reactSource, /savedAccessCapabilityCards|saved-access-capability/);
  });
});
