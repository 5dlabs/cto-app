import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");

function sourceRegion() {
  const start = source.indexOf('setupScreen === "source" ? (');
  const end = source.indexOf('setupScreen === "clis" ? (', start);
  assert.notEqual(start, -1, "source screen branch should exist");
  assert.notEqual(end, -1, "clis branch should follow source screen branch");
  return source.slice(start, end);
}

function advancedRegion() {
  const start = source.indexOf('const sourceAdvancedPanel =');
  const end = source.indexOf('  return (', start);
  assert.notEqual(start, -1, "source advanced panel should exist");
  assert.notEqual(end, -1, "source advanced panel should end before component return");
  return source.slice(start, end);
}

function gitlabBranch() {
  const region = advancedRegion();
  const start = region.indexOf('data-testid="source-auth-gitlab-panel"');
  const end = region.length;
  assert.notEqual(start, -1, "GitLab auth panel should have a dedicated test id");
  return region.slice(start, end);
}

function githubBranch() {
  const region = advancedRegion();
  const start = region.indexOf('data-testid="source-auth-github-panel"');
  const end = region.indexOf('data-testid="source-auth-gitlab-panel"', start);
  assert.notEqual(start, -1, "GitHub auth panel should have a dedicated test id");
  assert.notEqual(end, -1, "GitLab panel should follow GitHub panel");
  return region.slice(start, end);
}

describe("Source auth provider separation", () => {
  it("renders GitHub auth controls only inside the GitHub-specific panel", () => {
    const github = githubBranch();
    const gitlab = gitlabBranch();

    assert.match(github, /data-testid="source-github-sign-in"/);
    assert.match(github, /githubOAuthPrompt\?\.userCode|githubOAuthPrompt\?\.verificationUri/);
    assert.match(github, /Open GitHub authorization/);

    assert.doesNotMatch(gitlab, /source-github-sign-in/);
    assert.doesNotMatch(gitlab, /githubOAuthPrompt/);
    assert.doesNotMatch(gitlab, /Open GitHub authorization/);
    assert.doesNotMatch(gitlab, /GitHub code copied/);
  });

  it("keeps GitLab install primary while retaining self-managed and token review details", () => {
    const gitlab = gitlabBranch();

    assert.match(gitlab, /data-testid="source-gitlab-install"/);
    assert.match(gitlab, /Install Morgan on GitLab/);
    assert.doesNotMatch(gitlab, /data-testid="source-gitlab-deploy-now"/);
    assert.doesNotMatch(gitlab, /Deploy CTO-managed GitLab/);
    assert.match(gitlab, /self-hosted GitLab/i);
    assert.match(gitlab, /source-gitlab-token/);
  });

  it("clears stale GitHub OAuth prompts when switching install actions", () => {
    const region = sourceRegion();
    for (const testId of ["source-install-github", "source-install-gitlab", "source-install-5d-origin"]) {
      const start = region.indexOf(`data-testid="${testId}"`);
      const end = region.indexOf("</button>", start);
      assert.notEqual(start, -1, `${testId} action should exist`);
      assert.notEqual(end, -1, `${testId} action should close`);
      const installClick = region.slice(start, end);

      assert.match(installClick, /setGithubOAuthPrompt\(null\)/);
      assert.match(installClick, /githubOAuthAttemptId\.current/);
    }
  });
});
