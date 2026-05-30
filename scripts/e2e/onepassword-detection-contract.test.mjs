import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const rustSource = readFileSync(resolve(repoRoot, "src-tauri/src/bootstrap.rs"), "utf8");
const reactSource = readFileSync(resolve(repoRoot, "ui/src/components/LocalStackBootstrap.tsx"), "utf8");
const apiSource = readFileSync(resolve(repoRoot, "ui/src/api/sourceControlProvisioning.ts"), "utf8");

describe("1Password saved access readiness contract", () => {
  it("detects SDK auth, account exposure, and metadata access without default CLI probing", () => {
    assert.match(rustSource, /onepassword_sdk_auth_configured/);
    assert.match(rustSource, /OP_SERVICE_ACCOUNT_TOKEN/);
    assert.match(rustSource, /OP_ACCOUNT/);
    assert.match(rustSource, /fn preview_onepassword_sdk_matches/);
    assert.match(rustSource, /SECRET_SOURCE_SDK_BRIDGE/);
    const defaultDetection = rustSource.slice(
      rustSource.indexOf("fn detect_secret_sources_inner"),
      rustSource.indexOf("fn legacy_secret_sources_detection_inner"),
    );
    assert.doesNotMatch(defaultDetection, /"op"[\s\S]*"vault"[\s\S]*"list"[\s\S]*"--format"[\s\S]*"json"/);
  });

  it("exposes a connect-and-retry SDK path instead of installing provider CLIs", () => {
    assert.doesNotMatch(apiSource, /installOnePasswordCli/);
    assert.doesNotMatch(reactSource, /installOnePasswordCli/);
    assert.doesNotMatch(reactSource, /installSavedAccessCliAndRetry/);
    assert.doesNotMatch(reactSource, /action: "install-cli"/);
    assert.match(reactSource, /connectSavedAccessAndRetry/);
    assert.match(reactSource, /ONEPASSWORD_SDK_DOCS_URL/);
    assert.match(reactSource, /BITWARDEN_SECRETS_MANAGER_DOCS_URL/);
  });

  it("opens official SDK connection guidance when provider auth is missing", () => {
    assert.match(apiSource, /desktopAppIntegrationEnabled\?: boolean/);
    assert.match(rustSource, /desktop_app_integration_enabled: bool/);
    assert.match(rustSource, /ONEPASSWORD_SDK_AUTH_DOCS_URL/);
    assert.match(reactSource, /const providerLabel = provider === "bitwarden" \? "Bitwarden" : "1Password"/);
    assert.match(reactSource, /Connect \$\{providerLabel\}/);
    assert.match(reactSource, /openExternalUrl\(docsUrl\)/);
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
