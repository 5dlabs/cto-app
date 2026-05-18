import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const styles = readFileSync(new URL("../../ui/src/styles/bootstrap.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");

function cssRule(selector) {
  const start = styles.indexOf(selector);
  assert.notEqual(start, -1, `${selector} rule should exist`);
  const bodyStart = styles.indexOf("{", start);
  const bodyEnd = styles.indexOf("}", bodyStart);
  assert.notEqual(bodyStart, -1, `${selector} rule should have a body`);
  assert.notEqual(bodyEnd, -1, `${selector} rule should close`);
  return styles.slice(bodyStart + 1, bodyEnd);
}

function numericDeclaration(rule, property) {
  const match = rule.match(new RegExp(`${property}:\\s*([0-9.]+)`));
  assert.ok(match, `${property} should be declared`);
  return Number(match[1]);
}

function filterPair(rule) {
  const match = rule.match(/filter:\s*saturate\(([0-9.]+)\) brightness\(([0-9.]+)\)/);
  assert.ok(match, "filter should declare saturate() and brightness()");
  return {
    saturate: Number(match[1]),
    brightness: Number(match[2]),
  };
}

describe("Source visual and copy polish", () => {
  it("keeps unselected Source icons visible after a provider is selected", () => {
    const unselectedRule = cssRule(
      ".local-bootstrap__auth-grid--icons-only:has(.local-bootstrap__auth-choice.is-selected) .local-bootstrap__auth-choice:not(.is-selected)",
    );

    assert.ok(
      numericDeclaration(unselectedRule, "opacity") >= 0.62,
      "unselected cards should not fade so much that the icon is barely visible",
    );
    const { saturate, brightness } = filterPair(unselectedRule);
    assert.ok(
      saturate >= 0.85 && brightness >= 0.86,
      "unselected cards should keep enough saturation and brightness to remain legible",
    );
  });

  it("removes visible saved-access and paste-instead labels from Source fallback controls", () => {
    const panelStart = source.indexOf('data-testid="source-saved-access"');
    const panelEnd = source.indexOf('const sourceAdvancedPanel', panelStart);
    assert.notEqual(panelStart, -1, "saved-access panel should exist");
    assert.notEqual(panelEnd, -1, "saved-access panel should precede source advanced panel");
    const panel = source.slice(panelStart, panelEnd);

    assert.match(panel, /data-testid="source-saved-access-use"/);
    assert.match(panel, /data-testid="source-saved-access-paste"/);
    assert.doesNotMatch(panel, />\s*Use saved access\s*</);
    assert.doesNotMatch(panel, />\s*Paste instead\s*</);
    assert.match(panel, /aria-label="Find my access from 1Password"/);
    assert.match(panel, /aria-label="Paste token"/);
    assert.match(panel, /<span className="sr-only">Find my access<\/span>/);
    assert.match(panel, /<span className="sr-only">Paste token<\/span>/);
  });
});
