import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");
const sourceScript = readFileSync(new URL("../../ui/public/uploads/morgan/02_source/script.md", import.meta.url), "utf8");
const uxDoc = readFileSync(new URL("../../docs/2026-04/morgan-setup-ux-principles.md", import.meta.url), "utf8");

function sourceRegion() {
  const start = source.indexOf('setupScreen === "source" ? (');
  const end = source.indexOf('setupScreen === "clis" ? (', start);
  assert.notEqual(start, -1, "source screen branch should exist");
  assert.notEqual(end, -1, "clis branch should follow source screen branch");
  return source.slice(start, end);
}

function providerBranch(testId) {
  const sourceAdvanced = source.slice(
    source.indexOf('const sourceAdvancedPanel ='),
    source.indexOf('  return (', source.indexOf('const sourceAdvancedPanel =')),
  );
  const start = sourceAdvanced.indexOf(`data-testid="${testId}"`);
  const end = testId.includes("github")
    ? sourceAdvanced.indexOf('data-testid="source-auth-gitlab-panel"', start)
    : sourceAdvanced.length;
  assert.notEqual(start, -1, `${testId} branch should exist`);
  assert.notEqual(end, -1, `${testId} branch should have a delimiter`);
  return sourceAdvanced.slice(start, end);
}

describe("Source Morgan app install inference", () => {
  it("keeps Source as three source choices and avoids asking users to pick auth mechanics", () => {
    const region = sourceRegion();

    assert.match(region, /data-testid="source-install-github"/);
    assert.match(region, /data-testid="source-install-gitlab"/);
    assert.match(region, /data-testid="source-install-5d-origin"/);
    assert.doesNotMatch(region, /data-testid="source-install-gitea"/);
    assert.doesNotMatch(region, /data-testid="source-install-gitlab-cto"/);
    assert.match(source, /Install Morgan on GitHub/);
    assert.match(source, /Install Morgan on GitLab/);
    assert.match(source, /Prepare 5D Origin mirror or managed source/);
    const installGrid = region.slice(
      region.indexOf('aria-label="Source install actions"'),
      region.indexOf('{sourceModalProvider ? ('),
    );
    assert.doesNotMatch(installGrid, /device authentication|device-code|Personal access token|manual token/i);
  });

  it("moves GitLab self-managed and token choices behind Review details after hosted app intent", () => {
    const gitlab = providerBranch("source-auth-gitlab-panel");
    const installIndex = gitlab.indexOf("Install Morgan on GitLab");
    const reviewIndex = gitlab.indexOf("Review details");
    const selfManagedIndex = gitlab.indexOf("source-gitlab-self-managed");
    const tokenIndex = gitlab.indexOf("source-gitlab-token");

    assert.ok(installIndex >= 0, "GitLab should have one primary Morgan install action");
    assert.ok(reviewIndex > installIndex, "Review details should follow the primary install action");
    assert.ok(selfManagedIndex > reviewIndex, "Self-managed GitLab should be contextual behind Review details");
    assert.ok(tokenIndex > reviewIndex, "Token fallback should be contextual behind Review details");
    assert.doesNotMatch(gitlab, /source-gitlab-deploy-now|Deploy CTO-managed GitLab/);
  });

  it("documents Morgan as the install target, hosted inference as default, and 5D Origin as off-ramp", () => {
    assert.match(sourceScript, /GitHub or GitLab/i);
    assert.match(sourceScript, /local Git history/i);
    assert.match(sourceScript, /mirror first/i);
    assert.match(sourceScript, /Gitea for the lightweight Git server/i);
    assert.match(sourceScript, /GitLab CE/i);
    assert.match(uxDoc, /infer.*GitHub.*GitLab/i);
    assert.match(uxDoc, /5D Origin/i);
    assert.match(uxDoc, /mirror|migrate|off-ramp/i);
  });
});
