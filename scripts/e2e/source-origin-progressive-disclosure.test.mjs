import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");

describe("Morgan Source 5D Origin progressive disclosure", () => {
  it("keeps Origin mirror-first and gated by redacted review plus explicit app creation", () => {
    assert.match(source, /Review mirror plan/);
    assert.match(source, /data-testid="source-origin-review-plan"/);
    assert.match(source, /prepareOriginTransfer\(/);
    assert.match(source, /mode: "mirror"/);
    assert.match(source, /data-testid="source-origin-app-review"/);
    assert.match(source, /Redacted Origin manifest preview/);
    assert.match(source, /secrets stay \{sourceOriginPlan\.redaction\}/);
    assert.match(source, /data-testid="source-origin-create-app"/);
    assert.match(source, /provisionOriginApplication\(/);
    assert.match(source, /approved: true/);
    assert.match(source, /sourceOriginAppCreated/);
    assert.match(source, /mirror first, then migrate only if you choose that later/);
  });

  it("does not let 5D Origin continue before its app is created", () => {
    assert.match(source, /selected5DOrigin\s*\?\s*sourceOriginAppCreated/s);
    assert.match(source, /disabled=\{!sourceReady\}/);
  });

  it("uses clear Origin language with Gitea and GitLab implementation names", () => {
    assert.match(source, /gitea: "5D Origin"/);
    assert.match(source, /return "Prepare 5D Origin"/);
    assert.match(source, /5D Origin bootstrap token/);
    assert.match(source, /sr-only">Gitea</);
    assert.match(source, /sr-only">GitLab</);
    assert.doesNotMatch(source, /Standard<\/strong>/);
    assert.doesNotMatch(source, /GitLab-compatible<\/strong>/);
  });
});
