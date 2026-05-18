import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const scm = readFileSync(new URL("../../src-tauri/src/scm_auth.rs", import.meta.url), "utf8");
const api = readFileSync(new URL("../../ui/src/api/sourceControlProvisioning.ts", import.meta.url), "utf8");
const lib = readFileSync(new URL("../../src-tauri/src/lib.rs", import.meta.url), "utf8");

describe("GitLab CodeRun source-control auth contract", () => {
  it("exposes a redacted GitLab API probe command to Tauri and TypeScript", () => {
    assert.match(scm, /pub async fn probe_gitlab_coderun_auth/);
    assert.match(lib, /scm_auth::probe_gitlab_coderun_auth/);
    assert.match(api, /export interface GitLabCodeRunAuthProbeRequest/);
    assert.match(api, /probeGitlabCodeRunAuth/);
  });

  it("uses the GitLab v4 user probe with bearer token and redacted result", () => {
    assert.match(scm, /\/api\/v4\/user/);
    assert.match(scm, /\.bearer_auth\(&token\)/);
    assert.match(scm, /redactedTokenPreview/);
    assert.match(scm, /"\[REDACTED\]"/);
    assert.doesNotMatch(scm, /token\.clone\(\).*redacted_token_preview/s);
  });

  it("defines Rex, Blaze, Pass, and Cipher CodeRun agent scopes", () => {
    for (const agent of ["rex", "blaze", "pass", "cipher"]) {
      assert.match(scm, new RegExp(agent));
    }
    assert.match(scm, /read_api/);
    assert.match(scm, /read_repository/);
    assert.match(scm, /write_repository/);
  });
});
