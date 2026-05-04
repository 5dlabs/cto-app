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

describe("Source install actions", () => {
  it("starts with three low-cognition source choices and keeps engines under 5D Origin", () => {
    const region = sourceRegion();

    assert.match(region, />GitHub<|>GitHub</);
    assert.match(region, />GitLab<|>GitLab</);
    assert.match(region, />5D Origin<|>5D Origin</);
    assert.match(region, /data-testid="source-install-github"/);
    assert.match(region, /data-testid="source-install-gitlab"/);
    assert.match(region, /data-testid="source-install-5d-origin"/);
    assert.doesNotMatch(region, /data-testid="source-install-gitea"/);
    assert.doesNotMatch(region, /data-testid="source-install-gitea-cto"/);
    assert.doesNotMatch(region, /data-testid="source-install-gitlab-cto"/);

    const installGrid = region.slice(
      region.indexOf('aria-label="Source install actions"'),
      region.indexOf('{sourceModalProvider ? ('),
    );

    assert.doesNotMatch(installGrid, /installed Morgan|installed GitLab|installed 5D Origin/i);
    assert.doesNotMatch(installGrid, />\s*Install Morgan on GitHub\s*<|>\s*Install Morgan on GitLab\s*<|>\s*Install 5D Origin\s*</);
    assert.doesNotMatch(installGrid, /device authentication|device-code|Personal access token|manual token/i);
  });

  it("keeps the visible install grid icon-first with accessible action labels", () => {
    const region = sourceRegion();
    const installGrid = region.slice(
      region.indexOf('aria-label="Source install actions"'),
      region.indexOf('{sourceModalProvider ? ('),
    );

    assert.match(installGrid, /aria-label="Install Morgan on GitHub"/);
    assert.match(installGrid, /aria-label="Install Morgan on GitLab"/);
    assert.match(installGrid, /aria-label="Prepare 5D Origin mirror or managed source"/);
    assert.doesNotMatch(installGrid, /IconInstallDesktop/);
    assert.doesNotMatch(installGrid, /IconUpload/);
    assert.match(installGrid, /IconGitHub/);
    assert.match(installGrid, /IconGitLab/);
    assert.match(installGrid, /Icon5DOrigin/);
    assert.match(installGrid, /sr-only/);
    assert.doesNotMatch(installGrid, /local-bootstrap__install-action/);
  });

  it("models 5D Origin as an optional mirror-first managed source lane with clear Gitea/GitLab choices", () => {
    const region = sourceRegion();
    const originIndex = region.indexOf('data-testid="source-install-5d-origin"');
    assert.ok(originIndex >= 0, "5D Origin action should exist");
    const originButtonStart = region.lastIndexOf("<button", originIndex);
    const originButtonEnd = region.indexOf("</button>", originIndex);
    const originButton = region.slice(originButtonStart, originButtonEnd);

    assert.match(originButton, /aria-label="Prepare 5D Origin mirror or managed source"/);
    assert.match(originButton, /sr-only">5D Origin</);
    assert.match(region, /data-testid="source-origin-standard"/);
    assert.match(region, /Gitea/);
    assert.match(region, /Use Gitea under 5D Origin/);
    assert.doesNotMatch(region, />lightweight Git server</);
    assert.match(region, /data-testid="source-origin-gitlab-compatible"/);
    assert.match(region, /GitLab/);
    assert.match(region, /Use GitLab under 5D Origin/);
    assert.doesNotMatch(region, />GitLab CE</);
    assert.doesNotMatch(originButton, /Installed 5D Origin/);
  });

  it("documents inference, hosted-first setup, 5D Origin, and migration/off-ramp wording", () => {
    assert.match(sourceScript, /GitHub or GitLab/i);
    assert.match(sourceScript, /local Git history points there/i);
    assert.match(sourceScript, /5D Origin/i);
    assert.match(sourceScript, /mirror first/i);
    assert.match(sourceScript, /Gitea for the lightweight Git server/i);
    assert.match(sourceScript, /GitLab CE/i);
    assert.match(sourceScript, /GitLab-style CI workflows/i);
    assert.match(uxDoc, /infer.*GitHub.*GitLab/i);
    assert.match(uxDoc, /5D Origin/);
    assert.match(uxDoc, /Gitea/i);
    assert.match(uxDoc, /GitLab/i);
    assert.match(uxDoc, /agent-native/i);
    assert.match(uxDoc, /mirror|migrate|off-ramp/i);
  });
});
