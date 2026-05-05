import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");
const sourcePanelStart = source.indexOf('<div className="local-bootstrap__panel-title sr-only">Source</div>');
const sourcePanelEnd = source.indexOf('<div className="local-bootstrap__panel-title">Harness</div>');
const sourcePanel = source.slice(sourcePanelStart, sourcePanelEnd);

describe("Source icon-first post-auth namespace UX", () => {
  it("does not require owner/org/group/project before starting hosted sign-in", () => {
    assert.match(source, /const sourceNamespaceReady =/);
    assert.match(source, /sourceAuthMode === "github-oauth"/);
    assert.match(source, /sourceAuthMode === "gitlab-instance-oauth-app"/);
    assert.doesNotMatch(source, /disabled=\{!sourceNamespaceReady \|\| scmProvisioningBusy\}/);
  });

  it("hides raw namespace text fields until account choices or advanced/manual paths need them", () => {
    assert.match(source, /const shouldAskForSourceNamespace =/);
    assert.match(source, /shouldAskForSourceNamespace \? \(/);
    assert.match(source, /githubAccountOptions\.length > 0/);
    assert.match(source, /isManualSourceTokenMode\(sourceAuthMode\)/);
  });

  it("keeps the initial Source panel icon-first instead of asking users to understand org, group, or project", () => {
    assert.match(sourcePanel, /data-testid="source-install-github"/);
    assert.match(sourcePanel, /data-testid="source-install-gitlab"/);
    assert.match(sourcePanel, /data-testid="source-install-5d-origin"/);
    assert.doesNotMatch(sourcePanel, /data-testid="source-install-gitea"/);
    assert.doesNotMatch(sourcePanel, /data-testid="source-install-gitlab-cto"/);
    assert.match(source, /Install Morgan on GitHub/);
    assert.match(source, /Prepare 5D Origin mirror or managed source/);
    assert.doesNotMatch(sourcePanel.slice(0, sourcePanel.indexOf('shouldAskForSourceNamespace')), /GITLAB NAMESPACE, GROUP, OR PROJECT|GitHub owner or org|Gitea owner or org/);
  });
});
