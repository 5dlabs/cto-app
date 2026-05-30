import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const bootstrapRs = readFileSync(new URL("../../src-tauri/src/bootstrap.rs", import.meta.url), "utf8");
const bridgeSource = readFileSync(new URL("../../src-tauri/src/secret_source_sdk_bridge.mjs", import.meta.url), "utf8");
const bridgePath = new URL("../../src-tauri/src/secret_source_sdk_bridge.mjs", import.meta.url);

function canonicalTargetsFromRust() {
  const match = bootstrapRs.match(/const SECRET_SOURCE_CANONICAL_TARGETS:[\s\S]*?= &\[(?<body>[\s\S]*?)\];/);
  assert.ok(match?.groups?.body, "Rust canonical target list should be parseable");
  return Array.from(
    match.groups.body.matchAll(/\("(?<target>[A-Z0-9_]+)",\s*"(?<purpose>[^"]+)"\)/g),
    ({ groups }) => ({
      targetSecretKey: groups.target,
      purpose: groups.purpose,
    }),
  );
}

function runBridgeFixture(targets, fixtures) {
  const output = execFileSync(process.execPath, [bridgePath.pathname], {
    input: JSON.stringify({
      provider: "fixture",
      operation: "preview",
      targets,
      fixtures,
    }),
    encoding: "utf8",
  });
  return JSON.parse(output);
}

describe("secret-source canonical target parity", () => {
  it("keeps Rust as the only authoritative Saved Access target list", () => {
    const targets = canonicalTargetsFromRust();
    const targetKeys = targets.map((target) => target.targetSecretKey);

    assert.equal(targets.length, 36);
    assert.ok(!targetKeys.includes("DISCORD_BOT_TOKEN"), "generic Discord token must not be canonical");
    for (const required of [
      "ANTHROPIC_API_KEY",
      "CLOUDFLARE_API_TOKEN",
      "CONTEXT7_API_KEY",
      "MORGAN_DISCORD_BOT_TOKEN",
      "GLITCH_DISCORD_BOT_TOKEN",
    ]) {
      assert.ok(targetKeys.includes(required), `${required} should be canonical`);
    }

    assert.doesNotMatch(bridgeSource, /const\s+CANONICAL_TARGETS\s*=/);
    assert.doesNotMatch(bridgeSource, /return\s+CANONICAL_TARGETS\b/);
    assert.doesNotMatch(bridgeSource, /\["DISCORD_BOT_TOKEN",\s*"agent\.discord\.botToken"\]/);
    assert.match(bootstrapRs, /secret_source_bridge_targets\(&request\.targets\)/);
  });

  it("matches request-supplied provider, Cloudflare, tool, and per-agent targets with redacted previews", () => {
    const targets = canonicalTargetsFromRust().filter((target) =>
      [
        "ANTHROPIC_API_KEY",
        "CLOUDFLARE_API_TOKEN",
        "CONTEXT7_API_KEY",
        "MORGAN_DISCORD_BOT_TOKEN",
      ].includes(target.targetSecretKey),
    );
    const result = runBridgeFixture(targets, [
      { id: "anthropic", key: "Anthropic API key" },
      { id: "cloudflare", key: "CLOUDFLARE_API_TOKEN" },
      { id: "context7", key: "context7 api key" },
      { id: "morgan-discord", key: "Morgan Discord bot token" },
    ]);

    assert.equal(result.discovery, "metadata-only");
    assert.deepEqual(
      result.matches.map((match) => match.targetSecretKey).sort(),
      targets.map((target) => target.targetSecretKey).sort(),
    );
    assert.ok(result.matches.every((match) => match.redactedValuePreview === "[REDACTED]"));
    assert.equal(
      result.matches.find((match) => match.targetSecretKey === "MORGAN_DISCORD_BOT_TOKEN")
        ?.targetSecretName,
      "openclaw-discord-tokens",
    );
  });
});
