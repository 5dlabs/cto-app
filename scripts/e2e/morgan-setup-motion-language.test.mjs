import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../../ui/src/styles/bootstrap.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");
const motionDoc = readFileSync(new URL("../../docs/2026-05/morgan-setup-motion-language.md", import.meta.url), "utf8");

describe("Morgan setup motion language", () => {
  it("uses a depth-forward selection model for Source icon choices", () => {
    assert.match(css, /perspective:\s*1200px/);
    assert.match(css, /\.local-bootstrap__auth-choice\.is-selected[\s\S]*translateY\(0\) scale\(1\.018\)/);
    assert.match(css, /\.local-bootstrap__auth-grid--icons-only:has\(\.local-bootstrap__auth-choice\.is-selected\)[\s\S]*\.local-bootstrap__auth-choice:not\(\.is-selected\)[\s\S]*translateY\(0\) scale\(0\.965\)/);
    assert.doesNotMatch(css, /\.local-bootstrap__auth-choice\.is-selected[\s\S]*translateY\(-8px\) scale\(1\.04\)/);
    assert.match(css, /local-bootstrap-aurora-drift/);
  });

  it("applies the same motion vocabulary inside the 5D Origin modal", () => {
    assert.match(css, /\.local-bootstrap__origin-engine\.is-selected[\s\S]*translateY\(0\) scale\(1\.045\)/);
    assert.match(css, /\.local-bootstrap__origin-engine:hover[\s\S]*translateY\(0\) scale\(1\.035\)/);
    assert.match(source, /data-testid="source-origin-standard"/);
    assert.match(source, /data-testid="source-origin-gitlab-compatible"/);
    assert.doesNotMatch(source, /data-testid="source-origin-new"/);
  });

  it("documents the reusable setup motion language and respects reduced motion", () => {
    assert.match(motionDoc, /selected items glow in place/i);
    assert.match(motionDoc, /Do not combine a raised parent card with a modal/i);
    assert.match(motionDoc, /non-selected items recede/i);
    assert.match(motionDoc, /Linear restraint \+ Raycast physicality \+ Runway ambience/i);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /animation:\s*none !important/);
  });
});
