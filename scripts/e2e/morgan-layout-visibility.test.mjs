import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../../ui/src/styles/bootstrap.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

describe("Morgan setup layout visibility", () => {
  it("reserves enough left-column width for Morgan instead of crowding him under the setup panel", () => {
    const setupContent = ruleBody(".local-bootstrap__content--setup");
    assert.match(setupContent, /grid-template-columns:\s*minmax\(300px, 360px\) minmax\(0, 760px\)/);
    assert.doesNotMatch(setupContent, /grid-template-columns:\s*minmax\(220px, 320px\) minmax\(0, 1fr\)/);
  });

  it("keeps tablet desktop widths from shrinking Morgan into a thumbnail", () => {
    assert.doesNotMatch(css, /@media \(max-width: 1040px\)[\s\S]*?grid-template-columns:\s*minmax\(96px, 138px\) minmax\(0, 1fr\)/);
    assert.doesNotMatch(css, /@media \(max-width: 1040px\)[\s\S]*?width:\s*min\(132px, 18vw\)/);
    assert.match(css, /@media \(max-width: 1040px\)[\s\S]*?grid-template-columns:\s*minmax\(300px, 320px\) minmax\(0, 1fr\)/);
  });

  it("uses contain positioning for Morgan setup video so the portrait is not cropped by cover", () => {
    const setupAvatar = ruleBody(".local-bootstrap__content--setup .local-bootstrap__avatar");
    const setupVideo = ruleBody(".local-bootstrap__content--setup .local-bootstrap__avatar-video");
    assert.match(setupVideo, /object-fit:\s*contain;/);
    assert.match(setupAvatar, /overflow:\s*visible;/);
  });

  it("keeps the audio warning below Morgan without covering the portrait", () => {
    const setupWarning = ruleBody(".local-bootstrap__content--setup .local-bootstrap__audio-warning");
    assert.match(setupWarning, /position:\s*relative;/);
  });
});
