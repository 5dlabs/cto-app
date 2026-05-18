import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const bootstrapRs = readFileSync(new URL("../../src-tauri/src/bootstrap.rs", import.meta.url), "utf8");
const libRs = readFileSync(new URL("../../src-tauri/src/lib.rs", import.meta.url), "utf8");
const tauriApi = readFileSync(new URL("../../ui/src/api/tauri.ts", import.meta.url), "utf8");

describe("secret-source Tauri API contract", () => {
  it("exposes 1Password detect, preview, and apply commands", () => {
    for (const command of [
      "detect_secret_sources",
      "preview_secret_source_matches",
      "apply_secret_source_matches",
    ]) {
      assert.match(bootstrapRs, new RegExp(`pub (async )?fn ${command}\\b`));
      assert.match(libRs, new RegExp(`bootstrap::${command}`));
      assert.match(tauriApi, new RegExp(`case "${command}"`));
    }
  });

  it("keeps 1Password discovery metadata-only until approval", () => {
    assert.match(bootstrapRs, /run_tool\("op", &\["--version"\]\)/);
    assert.match(bootstrapRs, /run_tool_with_timeout\(\s*"op",\s*&\["vault", "list", "--format", "json"\]/);
    assert.match(bootstrapRs, /Duration::from_secs\(8\)/);
    assert.match(bootstrapRs, /pending_user_permission/);
    assert.match(bootstrapRs, /op item list/);
    assert.match(bootstrapRs, /op item get/);
    assert.match(bootstrapRs, /run_command_with_timeout\([\s\S]*op item list --format json[\s\S]*Duration::from_secs\(12\)/);
    assert.match(bootstrapRs, /run_command_with_timeout\([\s\S]*op item get \[approved field redacted\][\s\S]*Duration::from_secs\(45\)/);
    assert.match(bootstrapRs, /approval.*required|requires approval/i);
    assert.match(bootstrapRs, /SecretSourceMatchPreview/);
    assert.match(bootstrapRs, /SecretSourceApplyRequest/);
    assert.doesNotMatch(bootstrapRs, /println!\([^)]*secret/i);
  });

  it("represents Bitwarden as secondary detection-only metadata", () => {
    assert.match(bootstrapRs, /SECRET_SOURCE_PROVIDER_BITWARDEN: &str = "bitwarden"/);
    assert.match(bootstrapRs, /run_tool\("bw", &\["--version"\]\)/);
    assert.match(bootstrapRs, /if find_tool_binary\("bw"\)\.is_some\(\)/);
    assert.match(bootstrapRs, /run_tool_with_timeout\("bw", &\["status"\], Duration::from_secs\(5\)\)/);
    assert.match(bootstrapRs, /provider: SECRET_SOURCE_PROVIDER_BITWARDEN\.to_string\(\)/);
    assert.match(bootstrapRs, /secondary: true/);
    assert.match(bootstrapRs, /status_value\.eq_ignore_ascii_case\("unlocked"\)/);
    assert.match(tauriApi, /provider: "bitwarden"/);
    assert.match(tauriApi, /secondary: true/);
    assert.doesNotMatch(bootstrapRs, /bw list items/);
    assert.doesNotMatch(bootstrapRs, /bw get item/);
    assert.match(bootstrapRs, /only onepassword quick connect is available locally/);
  });
});
