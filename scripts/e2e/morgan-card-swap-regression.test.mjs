import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");

describe("Morgan setup decision card swapping", () => {
  it("renders a dedicated dynamic workflows decision panel when the setup screen advances to clis", () => {
    assert.match(source, /setupScreen === "clis"/);
    assert.match(source, /local-bootstrap__wizard--clis/);
    assert.match(source, /local-bootstrap__choice-grid--clis/);
    assert.match(source, /Dynamic workflows/i);
    assert.match(source, /local-bootstrap__dynamic-workflow-tree/);
    assert.match(source, /Choose how CTO turns your harness into provider and model decisions\./);
    assert.doesNotMatch(source, /Which coding CLIs should CTO prepare\?/);
    assert.match(source, /selectedCliIds/);
    const clisIndex = source.indexOf('setupScreen === "clis" ? (');
    const profilesIndex = source.indexOf('setupScreen === "profiles" ? (');
    const fallbackIndex = source.indexOf('title="ACP harness agent"');
    assert.ok(clisIndex > 0, "dynamic workflows branch should exist");
    assert.ok(profilesIndex > clisIndex, "dynamic workflows branch should render before profiles");
    assert.ok(fallbackIndex > profilesIndex, "Harness fallback should only appear after explicit screen branches");
  });

  it("does not use the Harnesses fallback panel for every non-source non-provider screen", () => {
    const fallbackStart = source.indexOf(') : (');
    const fallbackPanel = source.slice(Math.max(0, fallbackStart), source.indexOf('</div>', fallbackStart) + 6);
    assert.ok(!/Harnesses/.test(fallbackPanel) || /setupScreen === "harness"/.test(source));
  });
});
