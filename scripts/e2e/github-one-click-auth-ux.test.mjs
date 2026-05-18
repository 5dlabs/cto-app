import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");
const uxDoc = readFileSync(new URL("../../docs/2026-04/morgan-setup-ux-principles.md", import.meta.url), "utf8");

describe("GitHub one-click auth UX", () => {
  it("presents GitHub.com as installing Morgan, not an auth jargon screen", () => {
    assert.match(source, /Install Morgan on GitHub/);
    assert.match(source, /data-testid="source-github-sign-in"/);
    assert.match(source, /Morgan opens the GitHub app install flow|Install Morgan on the user, org, or repositories/);
    assert.doesNotMatch(source, /GitHub\.com is selected\. Morgan will open GitHub and handle the secure sign-in flow\./);
  });

  it("hides PAT and Enterprise behind review/advanced actions instead of primary copy", () => {
    assert.match(source, /Review details/);
    assert.match(source, /showSourceAdvanced/);
    assert.match(source, /setShowSourceAdvanced/);
    assert.match(source, /showSourceAdvanced \? \(/);
  });

  it("keeps technical GitHub OAuth/device-code details out of the initial visible screen", () => {
    assert.match(uxDoc, /one-click app install/i);
    assert.match(uxDoc, /OAuth.*device-code.*fallback/i);
    assert.match(uxDoc, /Review details/i);
  });
});
