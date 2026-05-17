import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const values = readFileSync(".gitops/charts/agent/values.yaml", "utf8");
const deployment = readFileSync(".gitops/charts/agent/templates/deployment.yaml", "utf8");

describe("agent chart GitLab source-control credential wiring", () => {
  it("declares a canonical GitLab token key alongside the GitHub token key", () => {
    assert.match(values, /github:\s+"GITHUB_TOKEN"/);
    assert.match(values, /gitlab:\s+"GITLAB_TOKEN"/);
  });

  it("injects GITLAB_TOKEN from cto-agent-keys without requiring a Discord token", () => {
    assert.match(deployment, /- name: GITLAB_TOKEN/);
    assert.match(deployment, /key: \{\{ get \$apiKeyNames "gitlab" \| default "GITLAB_TOKEN" \| quote \}\}/);
    assert.match(deployment, /optional: true/);
  });

  it("configures non-interactive Git credentials for GitHub and GitLab private repo clones", () => {
    assert.match(deployment, /x-access-token:\$\{GITHUB_TOKEN\}@github\.com/);
    assert.match(deployment, /oauth2:\$\{GITLAB_TOKEN\}@gitlab\.com/);
    assert.match(deployment, /git config --global credential\.helper 'store --file=\/workspace\/\.git-credentials'/);
    assert.match(deployment, /GIT_TERMINAL_PROMPT=0/);
    assert.doesNotMatch(deployment, /echo .*\$\{GITLAB_TOKEN\}.*WARNING/);
  });
});
