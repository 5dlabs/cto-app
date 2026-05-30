import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const contract = JSON.parse(
  readFileSync(new URL("./intent/morgan-setup.intent.json", import.meta.url), "utf8"),
);

const docs = readFileSync(
  new URL("../../docs/intent/morgan-setup/saved-access.md", import.meta.url),
  "utf8",
);
const endpointDocs = readFileSync(
  new URL("../../docs/intent/morgan-setup/endpoint.md", import.meta.url),
  "utf8",
);
const localStackBootstrap = readFileSync(
  new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url),
  "utf8",
);

const secretSourceScreen = contract.screens.find((screen) => screen.id === "saved-access");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("Morgan secret-source intent", () => {
  it("adds a secret-source screen that is optional and low-cognition", () => {
    assert.ok(secretSourceScreen, "secret-source screen contract exists");
    assert.equal(secretSourceScreen.heading, "Saved access");
    assert.deepEqual(secretSourceScreen.requiredText, []);
    assert.ok(secretSourceScreen.rules.includes("optional-secret-source"));
    assert.ok(secretSourceScreen.rules.includes("manual-fallback-visible"));
    assert.ok(secretSourceScreen.rules.includes("secrets-redacted"));
  });

  it("represents 1Password and Bitwarden as equal SDK-backed saved-access providers", () => {
    assert.deepEqual(secretSourceScreen.requiredControls, [
      "Use 1Password for secrets",
      "Use Bitwarden for secrets",
      "Continue without saved access",
      "Continue to Cloudflare",
    ]);
    assert.ok(secretSourceScreen.secretSources.some((source) => source.id === "onepassword"));
    const onePassword = secretSourceScreen.secretSources.find((source) => source.id === "onepassword");
    assert.equal(onePassword.availability, "sdk-connect");
    assert.equal(onePassword.backend, "sdk");
    assert.equal(onePassword.requiresCli, false);
    const bitwarden = secretSourceScreen.secretSources.find((source) => source.id === "bitwarden");
    assert.ok(bitwarden, "Bitwarden should be represented as a first-view saved-access provider");
    assert.equal(bitwarden.availability, "sdk-connect");
    assert.equal(bitwarden.backend, "sdk");
    assert.equal(bitwarden.requiresCli, false);
    assert.equal(bitwarden.priority, "peer");
    assert.equal(bitwarden.firstView, true);
    for (const source of secretSourceScreen.secretSources) {
      assert.notEqual(source.rawSecretAccess, true, `${source.id} must not imply raw secret access`);
    }
  });

  it("captures SDK/no-CLI default and approval safety for both providers", () => {
    const bitwarden = secretSourceScreen.secretSources.find((source) => source.id === "bitwarden");
    assert.ok(bitwarden?.sdk, "Bitwarden SDK contract should be explicit");
    assert.equal(bitwarden.sdk.package, "@bitwarden/sdk-napi");
    assert.deepEqual(bitwarden.sdk.auth, ["BWS_ACCESS_TOKEN", "organizationId"]);
    assert.equal(bitwarden.sdk.metadataPreview, "client.secrets().list(organizationId)");
    assert.equal(bitwarden.sdk.approvedRead, "client.secrets().get(secretId)");
    assert.match(bitwarden.safetyNotes.join("\n"), /Do not ask for.*master password/i);
    assert.match(bitwarden.safetyNotes.join("\n"), /Do not require.*bw.*CLI/i);
    assert.match(bitwarden.safetyNotes.join("\n"), /Do not read secret values before approval/i);
    assert.deepEqual(secretSourceScreen.quickConnect.providers, ["onepassword", "bitwarden"]);
  });

  it("declares conditional media keys for saved-access and Cloudflare branches", () => {
    assert.deepEqual(secretSourceScreen.conditionalMedia, [
      "onepassword-ready",
      "onepassword-missing-desktop",
      "onepassword-missing-cli",
      "onepassword-desktop-integration",
      "onepassword-needs-access",
      "onepassword-no-account",
      "bitwarden-detected",
      "bitwarden-locked",
      "bitwarden-unlocked",
    ]);
    const endpointScreen = contract.screens.find((screen) => screen.id === "endpoint");
    assert.deepEqual(endpointScreen.conditionalMedia, [
      "cloudflare-login",
      "cloudflare-saved-access",
      "cloudflare-quick-tunnel",
      "cloudflare-local",
    ]);
    assert.match(docs, /bitwarden-detected\.mp3/);
    assert.match(endpointDocs, /cloudflare-saved-access\.mp3/);
  });


  it("requires actual 1Password detection, metadata review, approval, and redacted apply APIs", () => {
    assert.ok(secretSourceScreen.quickConnect, "quickConnect contract exists");
    assert.deepEqual(secretSourceScreen.quickConnect.apis, [
      "detect_secret_sources",
      "preview_secret_source_matches",
      "apply_secret_source_matches",
    ]);
    assert.deepEqual(secretSourceScreen.quickConnect.providers, ["onepassword", "bitwarden"]);
    assert.equal(secretSourceScreen.quickConnect.discovery, "metadata-only");
    assert.equal(secretSourceScreen.quickConnect.approvalRequired, true);
    assert.deepEqual(secretSourceScreen.quickConnect.targets, [
      "GITHUB_TOKEN",
      "GITLAB_TOKEN",
      "OPENAI_API_KEY",
      "OPENROUTER_API_KEY",
      "EXA_API_KEY",
      "FIRECRAWL_API_KEY",
      "TAVILY_API_KEY",
      "DISCORD_BOT_TOKEN",
    ]);
  });

  it("wires Saved access into the live React Source screen with approval and fallback", () => {
    for (const symbol of [
      "detectSecretSources",
      "previewSecretSourceMatches",
      "applySecretSourceMatches",
      "savedAccessPanel",
    ]) {
      assert.match(localStackBootstrap, new RegExp(`\\b${symbol}\\b`));
    }
    for (const label of [
      "Review before connecting",
      "Access connected",
    ]) {
      assert.match(localStackBootstrap, new RegExp(escapeRegExp(label)));
    }
    assert.match(localStackBootstrap, /redactedValuePreview/);
    assert.doesNotMatch(localStackBootstrap, /OP_SERVICE_ACCOUNT_TOKEN|BWS_ACCESS_TOKEN|BWS_ORGANIZATION_ID/);
    assert.doesNotMatch(localStackBootstrap, /Bitwarden secrets preview is coming soon/);
    assert.doesNotMatch(localStackBootstrap, /Bitwarden secrets apply is coming soon/);
  });



  it("shows provider-specific SDK connect sheets instead of env-var dead ends", () => {
    for (const symbol of [
      "SecretSourceAuthConfigRequest",
      "saveSecretSourceAuthConfig",
      "savedAccessAuthForm",
      "saved-access-connect-sheet",
    ]) {
      assert.match(localStackBootstrap, new RegExp(escapeRegExp(symbol)));
    }
    for (const phrase of [
      "Use 1Password app",
      "Account name or UUID",
      "Service account token",
      "Secrets Manager access token",
      "Organization ID",
      "Save and check",
    ]) {
      assert.match(localStackBootstrap, new RegExp(escapeRegExp(phrase)));
    }
    assert.doesNotMatch(localStackBootstrap, /set OP_SERVICE_ACCOUNT_TOKEN or OP_ACCOUNT/i);
    assert.doesNotMatch(localStackBootstrap, /set BWS_ACCESS_TOKEN and BWS_ORGANIZATION_ID/i);
  });

  it("freezes low-friction auth copy for the primary Secrets screen", () => {
    const screenStart = localStackBootstrap.indexOf("const savedAccessPrepPanel = (");
    const screenEnd = localStackBootstrap.indexOf("const savedAccessPanel =", screenStart);
    assert.notEqual(screenStart, -1, "Secrets screen panel should exist");
    assert.notEqual(screenEnd, -1, "Secrets screen panel should be bounded");
    const secretsScreen = localStackBootstrap.slice(screenStart, screenEnd);

    assert.match(secretsScreen, /title=\"Secrets\"/);
    assert.match(secretsScreen, /Use 1Password for secrets/);
    assert.match(secretsScreen, /Use Bitwarden for secrets/);
    assert.match(secretsScreen, /Continue without (?:a )?secret manager/);
    assert.doesNotMatch(secretsScreen, /Set\s+OP_ACCOUNT/i);
    assert.doesNotMatch(secretsScreen, /OP_SERVICE_ACCOUNT_TOKEN/);
    assert.doesNotMatch(secretsScreen, /install\s+(?:the\s+)?SDK/i);
    assert.doesNotMatch(secretsScreen, /1Password[\s\S]{0,240}(username|user name)\s*\/\s*password/i);
  });

  it("documents compliance guardrails and redaction requirements", () => {
    for (const phrase of [
      "official auth/CLI/API flows only",
      "Do not scrape password-manager UI",
      "Do not copy browser cookies or sessions",
      "Do not ask for vault master passwords",
      "Never persist raw secret values",
      "Raw secret values may exist only in memory",
    ]) {
      assert.match(docs, new RegExp(escapeRegExp(phrase)));
    }
  });
});
