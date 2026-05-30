import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const contract = JSON.parse(
  readFileSync(new URL("./morgan-setup.intent.json", import.meta.url), "utf8"),
);

const expectedScreenOrder = [
  "saved-access",
  "endpoint",
  "source",
  "harnesses",
  "dynamic-workflows",
  "providers",
  "models",
  "harness-routing",
  "provider-auth",
  "tool-keys",
  "agent-tokens",
];

describe("Morgan setup intent contract", () => {
  it("defines every setup screen in stable flow order", () => {
    assert.deepEqual(contract.screens.map((screen) => screen.id), expectedScreenOrder);
  });

  it("defines required contract fields for every screen", () => {
    for (const screen of contract.screens) {
      assert.equal(typeof screen.id, "string", `${screen.id} id`);
      assert.equal(typeof screen.checkpoint, "string", `${screen.id} checkpoint`);
      assert.equal(typeof screen.heading, "string", `${screen.id} heading`);
      assert.ok(Array.isArray(screen.requiredText), `${screen.id} requiredText`);
      assert.ok(Array.isArray(screen.requiredControls), `${screen.id} requiredControls`);
      assert.ok(Array.isArray(screen.payloadPaths), `${screen.id} payloadPaths`);
      assert.ok(Array.isArray(screen.rules), `${screen.id} rules`);
    }
  });

  it("uses unique checkpoints so each captured snapshot maps to one screen intent", () => {
    const checkpoints = contract.screens.map((screen) => screen.checkpoint);
    assert.equal(new Set(checkpoints).size, checkpoints.length);
  });

  it("links every screen to a public intent document", () => {
    for (const screen of contract.screens) {
      assert.match(screen.docs, /^docs\/intent\/morgan-setup\/.+\.md$/);
    }
  });

  it("defines source auth matrix coverage for GitHub, GitLab, and self-hosted variants", () => {
    const source = contract.screens.find((screen) => screen.id === "source");
    assert.ok(source, "source screen contract exists");
    assert.ok(Array.isArray(source.authMatrix), "source authMatrix");
    assert.deepEqual(
      source.authMatrix.map((scenario) => scenario.id),
      [
        "github-oauth",
        "github-pat",
        "github-enterprise",
        "gitlab-dot-com",
        "self-managed-gitlab",
      ],
    );
  });

  it("keeps Morgan media folders aligned with the setup screen order", () => {
    const mediaFolders = contract.screens.map((screen) => screen.mediaFolder);
    assert.deepEqual(mediaFolders, [
      "02_saved-access",
      "03_endpoint",
      "04_source",
      "05_harness",
      "06_clis",
      "07_providers",
      "08_provider-models",
      "09_harness-routing",
      "10_provider-auth",
      "11_tools",
      "12_agent-tokens",
    ]);
  });
});
