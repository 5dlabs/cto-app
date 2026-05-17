import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");

describe("Morgan setup decision card swapping", () => {
  it("renders a dedicated ACP CLI decision panel when the setup screen advances to clis", () => {
    assert.match(source, /setupScreen === "clis"/);
    assert.match(source, /local-bootstrap__wizard--clis/);
    assert.match(source, /local-bootstrap__choice-grid--clis/);
    assert.match(source, /ACP CLIs/i);
    assert.match(source, /Which coding CLIs should CTO prepare\?/);
    assert.match(source, /selectedCliIds/);
    const clisIndex = source.indexOf('setupScreen === "clis" ? (');
    const profilesIndex = source.indexOf('setupScreen === "profiles" ? (');
    const fallbackIndex = source.indexOf('title="ACP harness agent"');
    assert.ok(clisIndex > 0, "CLI branch should exist");
    assert.ok(profilesIndex > clisIndex, "CLI branch should render before profiles");
    assert.ok(fallbackIndex > profilesIndex, "Harness fallback should only appear after explicit screen branches");
  });

  it("does not use the Harnesses fallback panel for every non-source non-provider screen", () => {
    const fallbackStart = source.indexOf(') : (');
    const fallbackPanel = source.slice(Math.max(0, fallbackStart), source.indexOf('</div>', fallbackStart) + 6);
    assert.ok(!/Harnesses/.test(fallbackPanel) || /setupScreen === "harness"/.test(source));
  });
});
