import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../../ui/src/styles/bootstrap.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");

function ruleFor(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} rule should exist`);
  const end = css.indexOf("}\n", start);
  assert.notEqual(end, -1, `${selector} rule should close`);
  return css.slice(start, end);
}

describe("Morgan Source preview layout", () => {
  it("allows the fixed setup shell to scroll when short browser/tunnel viewports clip the Source panel", () => {
    const shell = ruleFor(".local-bootstrap");

    assert.match(shell, /overflow:\s*auto;/);
    assert.doesNotMatch(shell, /overflow:\s*hidden;/);
  });

  it("keeps the Source focus wizard height bounded to the viewport instead of overflowing below the fold", () => {
    const focusWizard = ruleFor(".local-bootstrap__wizard--focus");

    assert.match(focusWizard, /max-height:\s*calc\(100vh - 148px\);/);
    assert.match(focusWizard, /overflow:\s*auto;/);
  });

  it("keeps Source advanced auth details collapsed so the first view shows cards without clipping controls", () => {
    const sourceMarkupStart = source.indexOf('<div className="local-bootstrap__panel-title">Source</div>');
    const sourceMarkupEnd = source.indexOf('<div className="local-bootstrap__panel-title">Harness</div>');
    const sourceMarkup = source.slice(sourceMarkupStart, sourceMarkupEnd);

    assert.match(sourceMarkup, /showSourceAdvanced \? \([\s\S]*data-testid="source-auth-decision-tree"[\s\S]*data-testid="source-auth-github-panel"/);
    assert.match(sourceMarkup, /showSourceAdvanced \? \([\s\S]*data-testid="source-auth-decision-tree"[\s\S]*data-testid="source-auth-gitlab-panel"/);
    assert.doesNotMatch(sourceMarkup, /<div data-testid="source-auth-decision-tree">\s*\{sourceProvider === "github" \?/);
    assert.match(sourceMarkup, /showSourceAdvanced && isGitHubManifestMode\(sourceAuthMode\)/);
    assert.doesNotMatch(sourceMarkup, /\{isGitHubManifestMode\(sourceAuthMode\) \? \(/);
  });
});
