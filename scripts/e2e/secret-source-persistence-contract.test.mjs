import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const bootstrapRs = readFileSync(new URL("../../src-tauri/src/bootstrap.rs", import.meta.url), "utf8");
const bridgeSource = readFileSync(new URL("../../src-tauri/src/secret_source_sdk_bridge.mjs", import.meta.url), "utf8");
const ctoValues = readFileSync(new URL("../../.gitops/charts/cto/values.yaml", import.meta.url), "utf8");
const ctoSecrets = readFileSync(new URL("../../.gitops/charts/cto/templates/secrets.yaml", import.meta.url), "utf8");
const toolsDeployment = readFileSync(new URL("../../.gitops/charts/cto/templates/tools/deployment.yaml", import.meta.url), "utf8");
const taskConfig = readFileSync(new URL("../../.gitops/charts/cto/templates/controller/task-controller-config.yaml", import.meta.url), "utf8");

function rustFunctionBody(name) {
  const start = bootstrapRs.indexOf(`fn ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = bootstrapRs.indexOf("\nfn ", start + 1);
  return bootstrapRs.slice(start, next === -1 ? undefined : next);
}

function rustStructBody(name) {
  const match = new RegExp(`(?:^|\\n)struct ${name} \\{`).exec(bootstrapRs);
  assert.ok(match, `${name} should exist`);
  const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const next = bootstrapRs.indexOf("\n}", start + 1);
  return bootstrapRs.slice(start, next === -1 ? undefined : next + 2);
}

describe("secret-source persistence/consumption contract", () => {
  it("saved-access values reach Kubernetes Secret, tools env, and ArgoCD valuesObject", () => {
    assert.match(ctoValues, /agentKeys:/);
    assert.match(ctoSecrets, /range \$k, \$v := \.Values\.agentKeys/);
    assert.match(toolsDeployment, /name: cto-agent-keys/);
    assert.match(taskConfig, /CTO-config\.json/);

    assert.match(bootstrapRs, /fn cto_agent_keys_values_patch[\s\S]*valuesObject[\s\S]*agentKeys/);
    assert.match(bootstrapRs, /fn cto_config_values_patch[\s\S]*valuesObject[\s\S]*ctoConfig/);

    const applySdkValues = rustFunctionBody("apply_secret_source_sdk_values");
    assert.match(applySdkValues, /apply_bootstrap_agent_keys\(&agent_keys\)/);
    assert.match(applySdkValues, /patch_bootstrap_cto_agent_keys\(&agent_keys\)/);
    assert.match(applySdkValues, /patch_bootstrap_cto_config|cto_config_values_patch/);
  });

  it("stores 1Password service-account tokens in Keychain and config metadata only", () => {
    const onePasswordConfig = rustStructBody("OnePasswordAuthConfig");
    const authConfig = rustStructBody("SecretSourceAuthConfig");
    assert.match(onePasswordConfig, /service_account_token_stored: bool/);
    assert.match(onePasswordConfig, /service_account_probe_succeeded: bool/);
    assert.doesNotMatch(onePasswordConfig, /service_account_token\s*:/);
    assert.doesNotMatch(authConfig, /service_account_token\s*:/);
    assert.match(bootstrapRs, /keychain_service_name\(provider: &str\)[\s\S]*cto\.saved-access\.onepassword/);
    assert.match(bootstrapRs, /keychain_entry\(provider: &str\)[\s\S]*keyring::Entry::new\(keychain_service_name\(provider\), "default"\)/);
    assert.match(bootstrapRs, /store_keychain_secret\(SECRET_SOURCE_PROVIDER_ONEPASSWORD, &token\)/);
  });

  it("requires a successful SDK metadata probe before marking stored 1Password service-account auth ready", () => {
    const saveConfig = rustFunctionBody("save_secret_source_auth_config_inner");
    assert.match(saveConfig, /auth_mode == "service-account"[\s\S]*probe_secret_source_auth_inner/);
    assert.match(saveConfig, /if !probe\.ok[\s\S]*return Err\(probe\.message\)/);
    assert.match(saveConfig, /store_keychain_secret\(SECRET_SOURCE_PROVIDER_ONEPASSWORD, &token\)/);
    assert.match(saveConfig, /service_account_token_stored: service_account_probe_succeeded\s*&&/);
    assert.match(saveConfig, /service_account_probe_succeeded/);

    const readyGate = rustFunctionBody("onepassword_sdk_auth_configured");
    assert.match(readyGate, /onepassword_env_service_token_present\(\)/);
    assert.match(readyGate, /onepassword_service_account_probe_succeeded\(config\)/);
    assert.doesNotMatch(readyGate, /config\.onepassword\.service_account_token_stored\s*\|\|/);
  });

  it("probes 1Password service-account auth through metadata-only SDK operations without leaking token fields", () => {
    assert.match(bootstrapRs, /fn probe_onepassword_service_account_auth/);
    assert.match(bootstrapRs, /"authMode": "service-account"/);
    assert.match(bootstrapRs, /"serviceAccountToken": token/);
    assert.match(bootstrapRs, /sanitize_secret_source_sdk_error[\s\S]*"serviceAccountToken"/);
    assert.match(bridgeSource, /async function probeOnePasswordServiceAccount/);
    assert.match(bridgeSource, /onePasswordClient\(token\)/);
    assert.match(bridgeSource, /client\.vaults\.list\(\)/);
    assert.match(bridgeSource, /client\.items\.list\(selectedVault\.id\)/);
    assert.match(bridgeSource, /safeErrorMessage\(error, \[token, vault\]\)/);
    assert.match(bridgeSource, /request\.serviceAccountToken/);
    assert.doesNotMatch(bridgeSource, /console\.log\([^)]*serviceAccountToken/i);
  });

  it("requires a successful SDK metadata probe before marking stored Bitwarden Secrets Manager auth ready", () => {
    const bitwardenConfig = rustStructBody("BitwardenAuthConfig");
    const authConfig = rustStructBody("SecretSourceAuthConfig");
    assert.match(bitwardenConfig, /access_token_stored: bool/);
    assert.match(bitwardenConfig, /organization_id: String/);
    assert.match(bitwardenConfig, /secrets_manager_probe_succeeded: bool/);
    assert.doesNotMatch(bitwardenConfig, /access_token\s*:/);
    assert.doesNotMatch(authConfig, /access_token\s*:/);

    const saveConfig = rustFunctionBody("save_secret_source_auth_config_inner");
    assert.match(saveConfig, /SECRET_SOURCE_PROVIDER_BITWARDEN[\s\S]*probe_secret_source_auth_inner/);
    assert.match(saveConfig, /store_keychain_secret\(SECRET_SOURCE_PROVIDER_BITWARDEN, &access_token\)/);
    assert.match(saveConfig, /secrets_manager_probe_succeeded: true/);

    const readyGate = rustFunctionBody("bitwarden_sdk_auth_configured");
    assert.match(readyGate, /bitwarden_secrets_manager_probe_succeeded\(config\)/);
    assert.doesNotMatch(readyGate, /BWS_ACCESS_TOKEN[\s\S]*ReadySecretsManager/);
  });
});
