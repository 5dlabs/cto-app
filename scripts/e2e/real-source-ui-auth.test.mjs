import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url),
  "utf8",
);

describe("real Morgan Source UI auth decision tree", () => {
  it("keeps three source choices as the top-level Source decisions", () => {
    assert.match(source, /aria-label="Source install actions"/);
    assert.match(source, /data-testid="source-install-github"/);
    assert.match(source, /data-testid="source-install-gitlab"/);
    assert.match(source, /data-testid="source-install-5d-origin"/);
    assert.match(source, /source-provider-github/);
    assert.match(source, /source-provider-gitlab/);
    assert.match(source, /source-provider-5d-origin/);
    assert.doesNotMatch(source, /data-testid="source-install-gitea"/);
    assert.doesNotMatch(source, /data-testid="source-install-gitea-cto"/);
    assert.doesNotMatch(source, /data-testid="source-install-gitlab-cto"/);
    assert.doesNotMatch(source, /data-testid=`source-host-\$\{hostMode\}`/);
    assert.doesNotMatch(source, /data-intent="source-host-hosted source-host-self-hosted"/);
    assert.doesNotMatch(source, /aria-label="Source host mode"/);
    assert.doesNotMatch(source, /Hosted cloud|Hosted source control/);
    assert.doesNotMatch(source, /Self-hosted or enterprise/);
  });

  it("models Source as existing hosted install first, with 5D Origin as mirror-first managed source", () => {
    assert.match(source, /aria-label="Install Morgan on GitHub"/);
    assert.match(source, /aria-label="Install Morgan on GitLab"/);
    assert.match(source, /aria-label="Prepare 5D Origin mirror or managed source"/);
    assert.match(source, /setSourceOriginEngine\("standard"\)/);
    assert.match(source, /setSourceOriginEngine\("gitlab-compatible"\)/);
    assert.match(source, /source-origin-standard/);
    assert.match(source, /source-origin-gitlab-compatible/);
    assert.match(source, /mirrors, private agent jobs, and optional migration/i);
    assert.match(source, /mirror-first setup/i);
  });

  it("reveals GitHub Enterprise and PAT as contextual secondary actions after GitHub", () => {
    assert.match(source, /Using GitHub Enterprise\?/);
    assert.match(source, /data-testid="source-github-enterprise"/);
    assert.match(source, /data-testid="source-auth-github-pat"/);
    assert.match(source, /Use a personal access token instead/);
    assert.match(source, /GitHub Enterprise Server URL/);
    assert.match(source, /github-enterprise-app/);
  });

  it("reveals self-managed GitLab and manual-token fallback as contextual actions after GitLab", () => {
    assert.match(source, /Use existing self-hosted GitLab/);
    assert.match(source, /data-testid="source-gitlab-self-managed"/);
    assert.match(source, /data-testid="source-gitlab-token"/);
    assert.match(source, /Use a manual token instead/);
    assert.match(source, /GitLab self-managed URL/);
    assert.match(source, /gitlab-instance-oauth-app/);
  });

  it("renders a base URL input only for enterprise or self-managed existing-provider branches", () => {
    assert.match(source, /source-base-url/);
    assert.match(source, /sourceHostMode === "self-hosted"/);
    assert.match(source, /!selected5DOrigin/);
    assert.match(source, /https:\/\/github\.example\.com/);
    assert.match(source, /https:\/\/gitlab\.example\.com/);
    assert.doesNotMatch(source, /https:\/\/gitea\.example\.com/);
  });

  it("supports GitLab app install with manual token and self-managed fallback guidance", () => {
    assert.match(source, /GitLab\.com/);
    assert.match(source, /Install Morgan on GitLab/);
    assert.match(source, /groups and projects/i);
    assert.match(source, /gitlab-instance-oauth-app|instance OAuth application|\/api\/v4\/applications/i);
    assert.match(source, /source-gitlab-token/);
  });

  it("persists all non-GitHub source plans through prepareScmProvisioning/saveScmConnection", () => {
    assert.doesNotMatch(source, /if \(sourceProvider === "github"\) \{\s*return;\s*\}/);
    assert.match(source, /prepareScmProvisioning/);
    assert.match(source, /saveScmConnection/);
  });
});
