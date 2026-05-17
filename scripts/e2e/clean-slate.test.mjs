import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

const teardownSource = await readFile(new URL("./clean-slate-teardown.mjs", import.meta.url), "utf8").catch(() => "");
const cleanSlateCycleSource = await readFile(new URL("./clean-slate-cycle.mjs", import.meta.url), "utf8").catch(() => "");
const runnerSource = await readFile(new URL("./local-stack-cycle.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));

describe("clean-slate local stack E2E teardown", () => {
  it("has a dedicated teardown script that removes cluster, app profile, source-control credentials, E2E token overrides, and the test GitOps repo", () => {
    assert.match(teardownSource, /kind/);
    assert.match(teardownSource, /delete/);
    assert.match(teardownSource, /cluster/);
    assert.match(teardownSource, /ai\.5dlabs\.cto-desktop/);
    assert.match(teardownSource, /bootstrap/);
    assert.match(teardownSource, /setup\.json/);
    assert.match(teardownSource, /source-control/);
    assert.match(teardownSource, /CTO_GITHUB_PAT/);
    assert.match(teardownSource, /GITHUB_TOKEN/);
    assert.match(teardownSource, /--preserve-github-cli-auth/);
    assert.match(teardownSource, /deleteGitopsReferenceRepo/);
    assert.match(teardownSource, /CTO_E2E_DELETE_GITOPS_REPO/);
    assert.match(teardownSource, /repos\/\$\{owner\}\/\$\{repo\}/);
    assert.match(teardownSource, /cto-gitops/);
    assert.doesNotMatch(teardownSource, /spawnSync\("gh"/);
    assert.doesNotMatch(teardownSource, /\["auth",\s*"logout"/);
  });

  it("wires a full clean-slate E2E npm command through teardown before reset/start/smoke", () => {
    assert.equal(packageJson.scripts["e2e:local-stack-clean-slate"], "node scripts/e2e/clean-slate-cycle.mjs");
    assert.match(cleanSlateCycleSource, /clean-slate-teardown\.mjs/);
    assert.match(cleanSlateCycleSource, /local-stack-cycle\.mjs/);
    assert.match(cleanSlateCycleSource, /--reset/);
    assert.match(cleanSlateCycleSource, /--start/);
    assert.match(cleanSlateCycleSource, /--k8s-smoke/);
  });

  it("keeps token fallback opt-out available for the no-token OAuth branch", () => {
    assert.match(runnerSource, /CTO_E2E_DISABLE_GITHUB_TOKEN_FALLBACK/);
    assert.match(runnerSource, /githubTokenFallbackDisabled/);
  });
});
