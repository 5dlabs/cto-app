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

  it("keeps provider complexity behind detection or more-options disclosure", () => {
    assert.deepEqual(secretSourceScreen.requiredControls, [
      "Use 1Password saved access",
      "Continue without saved access",
      "Continue to Cloudflare",
    ]);
    assert.ok(secretSourceScreen.secretSources.some((source) => source.id === "onepassword"));
    const onePassword = secretSourceScreen.secretSources.find((source) => source.id === "onepassword");
    assert.equal(onePassword.availability, "detected-first");
    assert.equal(onePassword.tier, "free-local");
    const bitwarden = secretSourceScreen.secretSources.find((source) => source.id === "bitwarden");
    assert.ok(bitwarden, "Bitwarden should be represented as a secondary saved-access provider");
    assert.equal(bitwarden.availability, "more-options");
    assert.equal(bitwarden.priority, "secondary");
    assert.equal(bitwarden.firstView, false);
    for (const source of secretSourceScreen.secretSources) {
      assert.notEqual(source.rawSecretAccess, true, `${source.id} must not imply raw secret access`);
    }
  });

  it("captures Bitwarden CLI support as a safe secondary-provider plan", () => {
    const bitwarden = secretSourceScreen.secretSources.find((source) => source.id === "bitwarden");
    assert.ok(bitwarden?.cli, "Bitwarden CLI contract should be explicit before source support lands");
    assert.equal(bitwarden.cli.command, "bw");
    assert.equal(bitwarden.cli.docs, "https://bitwarden.com/help/cli/");
    assert.equal(bitwarden.cli.statusProbe, "bw status");
    assert.deepEqual(bitwarden.cli.statuses, ["unauthenticated", "locked", "unlocked"]);
    assert.deepEqual(bitwarden.cli.sessionInputs, ["BW_SESSION", "--session"]);
    assert.equal(bitwarden.cli.availableWhen, "status-unlocked");
    assert.match(bitwarden.safetyNotes.join("\n"), /Do not ask for.*master password/i);
    assert.match(bitwarden.safetyNotes.join("\n"), /Do not run bw list items before approval/i);
    assert.equal(secretSourceScreen.quickConnect.provider, "onepassword");
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
    assert.equal(secretSourceScreen.quickConnect.provider, "onepassword");
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
    assert.doesNotMatch(localStackBootstrap, /savedAccess.*token/i);
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
