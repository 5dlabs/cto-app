import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const principles = readFileSync(
  new URL("../../docs/2026-04/morgan-setup-ux-principles.md", import.meta.url),
  "utf8",
);

const secretSources = readFileSync(
  new URL("../../docs/intent/morgan-setup/secret-sources.md", import.meta.url),
  "utf8",
);

describe("Morgan setup UX principles", () => {
  it("treats heavy visible text as a UI failure", () => {
    assert.match(principles, /Morgan says it; the UI shows it/);
    assert.match(principles, /If a paragraph is needed to explain the screen, the UI has failed/);
    assert.match(principles, /one short question, one primary action, optional one-line status/);
  });

  it("keeps secret-source UI visual and progressive", () => {
    assert.match(secretSources, /Icon-first provider chips/);
    assert.match(secretSources, /No provider matrix on first view/);
    assert.match(secretSources, /Reveal details only after \*\*Review details\*\*/);
  });
});
