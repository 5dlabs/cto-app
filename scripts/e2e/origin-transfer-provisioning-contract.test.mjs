import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const bootstrap = readFileSync(resolve(root, "src-tauri/src/bootstrap.rs"), "utf8");
const lib = readFileSync(resolve(root, "src-tauri/src/lib.rs"), "utf8");
const api = readFileSync(resolve(root, "ui/src/api/sourceControlProvisioning.ts"), "utf8");

const appPaths = [
  ".gitops/apps/origin-standard.yaml",
  ".gitops/apps/origin-gitlab-compatible.yaml",
  ".gitops/template/.gitops/apps/origin-standard.yaml",
  ".gitops/template/.gitops/apps/origin-gitlab-compatible.yaml",
];

describe("5D Origin transfer and app creation contract", () => {
  it("registers dry-run and app provisioning commands", () => {
    assert.match(bootstrap, /pub fn prepare_origin_transfer/);
    assert.match(bootstrap, /pub fn provision_origin_application/);
    assert.match(lib, /bootstrap::prepare_origin_transfer/);
    assert.match(lib, /bootstrap::provision_origin_application/);
    assert.match(api, /prepareOriginTransfer/);
    assert.match(api, /provisionOriginApplication/);
  });

  it("defaults transfer to mirror and requires hosted GitHub or GitLab source", () => {
    assert.match(bootstrap, /unwrap_or\(OriginTransferMode::Mirror\)/);
    assert.match(bootstrap, /requires an existing GitHub or GitLab Source connection/);
    assert.match(bootstrap, /"github" \| "gitlab"/);
    assert.match(bootstrap, /source_provider: "origin"\.to_string\(\)/);
    assert.match(bootstrap, /expect_err\("hosted source required"\)/);
  });

  it("uses stable Origin app names and includes source-owned app manifests", () => {
    assert.match(bootstrap, /ORIGIN_STANDARD_APP_NAME: &str = "origin-standard"/);
    assert.match(bootstrap, /ORIGIN_GITLAB_COMPATIBLE_APP_NAME: &str = "origin-gitlab-compatible"/);
    for (const path of appPaths) {
      assert.ok(existsSync(resolve(root, path)), `${path} exists`);
    }
  });

  it("keeps Origin optional and mirror-first in docs", () => {
    const readme = readFileSync(resolve(root, ".gitops/apps/README.md"), "utf8");
    assert.match(readme, /not part of the Client Cluster baseline/);
    assert.match(readme, /mirror-first, migrate-later/);
    assert.match(readme, /Gitea\/Forgejo/);
    assert.match(readme, /GitLab CE/);
  });
});
