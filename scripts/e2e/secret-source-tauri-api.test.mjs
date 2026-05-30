import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, it } from "node:test";

const bootstrapRs = readFileSync(new URL("../../src-tauri/src/bootstrap.rs", import.meta.url), "utf8");
const libRs = readFileSync(new URL("../../src-tauri/src/lib.rs", import.meta.url), "utf8");
const tauriApi = readFileSync(new URL("../../ui/src/api/tauri.ts", import.meta.url), "utf8");
const bridgeSource = readFileSync(new URL("../../src-tauri/src/secret_source_sdk_bridge.mjs", import.meta.url), "utf8");

function bridgeFunctionBody(name) {
  const start = bridgeSource.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist in SDK bridge`);
  const next = bridgeSource.indexOf("\nasync function ", start + 1);
  return bridgeSource.slice(start, next === -1 ? bridgeSource.length : next);
}

function runBridgeWithCliTrap(request, env = {}) {
  const trapDir = mkdtempSync(join(tmpdir(), "cto-sdk-cli-trap-"));
  const marker = join(trapDir, "cli-called.txt");
  try {
    for (const name of ["op", "bw"]) {
      const script = `#!/bin/sh\necho ${name} >> ${JSON.stringify(marker)}\necho "CLI trap executed: ${name}" >&2\nexit 92\n`;
      const path = join(trapDir, name);
      writeFileSync(path, script, { mode: 0o755 });
    }
    const result = spawnSync(process.execPath, ["src-tauri/src/secret_source_sdk_bridge.mjs"], {
      cwd: new URL("../..", import.meta.url),
      input: JSON.stringify(request),
      encoding: "utf8",
      env: {
        ...process.env,
        ...env,
        PATH: `${trapDir}${delimiter}${process.env.PATH ?? ""}`,
      },
    });
    const markerText = result.status === 92 || result.stderr.includes("CLI trap executed")
      ? readFileSync(marker, "utf8")
      : "";
    return { result, markerText };
  } finally {
    rmSync(trapDir, { recursive: true, force: true });
  }
}

describe("secret-source Tauri API contract", () => {
  it("exposes provider-neutral detect, preview, and apply commands", () => {
    for (const command of [
      "detect_secret_sources",
      "probe_secret_source_auth",
      "preview_secret_source_matches",
      "apply_secret_source_matches",
    ]) {
      assert.match(bootstrapRs, new RegExp(`pub (async )?fn ${command}\\b`));
      assert.match(libRs, new RegExp(`bootstrap::${command}`));
      assert.match(tauriApi, new RegExp(`case "${command}"`));
    }
  });

  it("keeps SDK discovery metadata-only until explicit apply approval", () => {
    assert.match(bootstrapRs, /SECRET_SOURCE_LEGACY_CLI_ENV: &str = "CTO_SECRET_SOURCE_LEGACY_CLI"/);
    assert.match(bootstrapRs, /fn secret_source_legacy_cli_enabled\(\) -> bool/);
    assert.match(bootstrapRs, /fn preview_onepassword_sdk_matches/);
    assert.match(bootstrapRs, /fn preview_bitwarden_sdk_matches/);
    assert.match(bootstrapRs, /fn apply_onepassword_sdk_matches/);
    assert.match(bootstrapRs, /fn apply_bitwarden_sdk_matches/);
    assert.match(bootstrapRs, /SecretSourceBackendKind/);
    assert.match(bootstrapRs, /approval.*required|requires approval/i);
    assert.match(bootstrapRs, /SecretSourceMatchPreview/);
    assert.match(bootstrapRs, /SecretSourceApplyRequest/);
    assert.doesNotMatch(bootstrapRs, /println!\([^)]*secret/i);
  });

  it("represents 1Password and Bitwarden as equal SDK-backed providers by default", () => {
    assert.match(bootstrapRs, /SECRET_SOURCE_PROVIDER_BITWARDEN: &str = "bitwarden"/);
    assert.match(bootstrapRs, /normalize_secret_source_provider/);
    assert.match(bootstrapRs, /SECRET_SOURCE_PROVIDER_ONEPASSWORD/);
    assert.match(bootstrapRs, /SECRET_SOURCE_PROVIDER_BITWARDEN/);
    assert.match(bootstrapRs, /provider: SECRET_SOURCE_PROVIDER_BITWARDEN\.to_string\(\)/);
    assert.match(bootstrapRs, /provider: SECRET_SOURCE_PROVIDER_ONEPASSWORD\.to_string\(\)/);
    assert.doesNotMatch(bootstrapRs, /only onepassword quick connect is available locally/);
    assert.match(tauriApi, /provider: "bitwarden"/);
    assert.doesNotMatch(tauriApi, /secondary: true/);
  });

  it("adds a redacted 1Password DesktopAuth probe before metadata preview", () => {
    assert.match(bridgeSource, /request\.provider\s*===\s*"onepassword"\s*&&\s*request\.operation\s*===\s*"probe"/);
    assert.match(bridgeSource, /async function probeOnePasswordDesktopAuth/);
    const probeSource = bridgeSource.slice(
      bridgeSource.indexOf("async function probeOnePasswordDesktopAuth"),
      bridgeSource.indexOf("async function previewOnePassword"),
    );
    assert.match(probeSource, /typeof sdk\.DesktopAuth\s*!==\s*"function"/);
    assert.match(probeSource, /new sdk\.DesktopAuth\(accountName\)/);
    assert.match(probeSource, /client\.vaults\.list\(\)/);
    assert.match(probeSource, /safeErrorMessage\(error, \[accountName, vault\]\)/);
    assert.match(bootstrapRs, /pub fn probe_secret_source_auth/);
    assert.match(bootstrapRs, /fn probe_onepassword_desktop_auth/);
    assert.match(bootstrapRs, /1Password app approval must pass before Review matches/);
    assert.match(bootstrapRs, /onepassword_sdk_auth_configured\(config\.as_ref\(\)\)/);
    assert.match(bootstrapRs, /"operation": "probe"/);
    assert.match(bootstrapRs, /desktop_auth_probe_succeeded/);
    assert.match(libRs, /bootstrap::probe_secret_source_auth/);
    assert.match(tauriApi, /case "probe_secret_source_auth"/);
    assert.doesNotMatch(probeSource, /username|user name/i);
    assert.doesNotMatch(probeSource, /master password|password field|password login/i);
  });

  it("aligns 1Password SDK bridge calls with installed package declarations and never shells out to op", () => {
    const sdkTypes = readFileSync(new URL("../../node_modules/@1password/sdk/dist/sdk.d.ts", import.meta.url), "utf8");
    const clientTypes = readFileSync(new URL("../../node_modules/@1password/sdk/dist/client.d.ts", import.meta.url), "utf8");
    const itemsTypes = readFileSync(new URL("../../node_modules/@1password/sdk/dist/items.d.ts", import.meta.url), "utf8");
    const vaultsTypes = readFileSync(new URL("../../node_modules/@1password/sdk/dist/vaults.d.ts", import.meta.url), "utf8");
    const onePasswordSource = [
      bridgeFunctionBody("onePasswordClient"),
      bridgeFunctionBody("probeOnePasswordDesktopAuth"),
      bridgeFunctionBody("probeOnePasswordServiceAccount"),
      bridgeFunctionBody("previewOnePassword"),
      bridgeFunctionBody("applyOnePassword"),
    ].join("\n");

    assert.match(sdkTypes, /createClient/);
    assert.match(sdkTypes, /DesktopAuth/);
    assert.match(clientTypes, /class Client/);
    assert.match(vaultsTypes, /list\(params\?: VaultListParams\): Promise<VaultOverview\[\]>/);
    assert.match(itemsTypes, /list\(vaultId: string, \.\.\.filters: ItemListFilter\[\]\): Promise<ItemOverview\[\]>/);
    assert.match(itemsTypes, /get\(vaultId: string, itemId: string\)/);
    assert.match(onePasswordSource, /import\("@1password\/sdk"\)/);
    assert.match(onePasswordSource, /new sdk\.DesktopAuth\(accountName\)|new sdk\.DesktopAuth\(account\)/);
    assert.match(onePasswordSource, /sdk\.createClient\(/);
    assert.match(onePasswordSource, /client\.vaults\.list\(\)/);
    assert.match(onePasswordSource, /client\.items\.list\(vault\.id\)/);
    assert.match(onePasswordSource, /client\.items\.get\(vaultId, itemId\)/);
    assert.doesNotMatch(onePasswordSource, /tool_command|run_tool|spawnSync|execFile/);
  });

  it("aligns Bitwarden SDK bridge calls with installed package declarations and never shells out to bw", () => {
    const bitwardenTypes = readFileSync(new URL("../../node_modules/@bitwarden/sdk-napi/dist/bitwarden_client/index.d.ts", import.meta.url), "utf8");
    const schemas = readFileSync(new URL("../../node_modules/@bitwarden/sdk-napi/dist/bitwarden_client/schemas.d.ts", import.meta.url), "utf8");
    const bitwardenSource = [
      bridgeFunctionBody("bitwardenClient"),
      bridgeFunctionBody("probeBitwardenSecretsManager"),
      bridgeFunctionBody("previewBitwarden"),
      bridgeFunctionBody("applyBitwarden"),
    ].join("\n");

    assert.match(bitwardenTypes, /class BitwardenClient/);
    assert.match(bitwardenTypes, /loginAccessToken\(accessToken: string, stateFile\?: string\)/);
    assert.match(bitwardenTypes, /list\(organizationId: string\): Promise<SecretIdentifiersResponse>/);
    assert.match(bitwardenTypes, /get\(id: string\): Promise<SecretResponse>/);
    assert.match(schemas, /export interface SecretIdentifiersResponse[\s\S]*data: SecretIdentifierResponse\[\]/);
    assert.match(schemas, /export interface SecretResponse[\s\S]*value: string/);
    assert.match(bitwardenSource, /import\("@bitwarden\/sdk-napi"\)/);
    assert.match(bitwardenSource, /new sdk\.BitwardenClient\(\)/);
    assert.match(bitwardenSource, /client\.auth\(\)\.loginAccessToken\(accessToken, stateFile \|\| undefined\)/);
    assert.match(bitwardenSource, /client\.secrets\(\)\.list\(organizationId\)/);
    assert.match(bitwardenSource, /client\.secrets\(\)\.get\(match\[2\]\)/);
    assert.doesNotMatch(bitwardenSource, /tool_command|run_tool|spawnSync|execFile|\bbw\b/);
  });

  it("executes SDK bridge fixture preview with op/bw PATH traps without invoking provider CLIs", () => {
    const { result, markerText } = runBridgeWithCliTrap({
      provider: "fixture",
      operation: "preview",
      targets: [{ targetSecretKey: "ANTHROPIC_API_KEY", purpose: "provider.anthropic.apiKey" }],
      fixtures: [{ key: "ANTHROPIC_API_KEY", id: "anthropic" }],
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(markerText, "", "SDK bridge fixture preview should not call op or bw from PATH");
    const output = JSON.parse(result.stdout);
    assert.equal(output.discovery, "metadata-only");
    assert.equal(output.matches[0].redactedValuePreview, "[REDACTED]");
  });



  it("persists saved-access SDK auth metadata only and uses macOS Keychain for tokens", () => {
    assert.match(bootstrapRs, /save_secret_source_auth_config/);
    assert.match(bootstrapRs, /secret-source-auth\.json/);
    assert.match(bootstrapRs, /service_account_token_stored/);
    assert.match(bootstrapRs, /service_account_probe_succeeded/);
    assert.match(bootstrapRs, /access_token_stored/);
    assert.match(bootstrapRs, /keyring::Entry/);
    assert.match(bootstrapRs, /set_password\(secret\)/);
    assert.match(bootstrapRs, /get_password\(\)/);
    assert.match(bootstrapRs, /probe_onepassword_service_account_auth/);
    assert.match(bootstrapRs, /onepassword_service_account_probe_succeeded\(config\)/);
    assert.match(bridgeSource, /probeOnePasswordServiceAccount/);
    assert.doesNotMatch(bootstrapRs, /struct OnePasswordAuthConfig[\s\S]*service_account_token: String/);
    assert.doesNotMatch(bootstrapRs, /struct BitwardenAuthConfig[\s\S]*access_token: String/);
  });

  it("probes and saves Bitwarden Secrets Manager auth through SDK with Keychain-only token storage", () => {
    assert.match(bridgeSource, /request\.provider\s*===\s*"bitwarden"\s*&&\s*request\.operation\s*===\s*"probe"/);
    assert.match(bridgeSource, /async function probeBitwardenSecretsManager/);
    assert.match(bridgeSource, /new sdk\.BitwardenClient\(\)/);
    assert.match(bridgeSource, /client\.auth\(\)\.loginAccessToken\(accessToken/);
    assert.match(bridgeSource, /client\.secrets\(\)\.list\(organizationId\)/);
    assert.match(bridgeSource, /safeErrorMessage\(error, \[accessToken, organizationId\]\)/);
    assert.match(bootstrapRs, /fn probe_bitwarden_secrets_manager_auth/);
    assert.match(bootstrapRs, /"authMode": "secrets-manager"/);
    assert.match(bootstrapRs, /"accessToken": access_token/);
    assert.match(bootstrapRs, /"organizationId": organization_id/);
    assert.match(bootstrapRs, /store_keychain_secret\(SECRET_SOURCE_PROVIDER_BITWARDEN, &access_token\)/);
    assert.match(bootstrapRs, /secrets_manager_probe_succeeded/);
    assert.match(bootstrapRs, /bitwarden_secrets_manager_probe_succeeded\(config\)/);
    assert.match(bootstrapRs, /sanitize_secret_source_sdk_error[\s\S]*"organizationId"/);
    assert.doesNotMatch(bootstrapRs, /struct BitwardenAuthConfig\s*\{[^}]*access_token\s*:/);
    assert.doesNotMatch(bridgeSource, /master password|browser unlock is enough|bw unlock/i);
  });

  it("keeps provider CLIs behind an explicit legacy gate", () => {
    const defaultDetection = bootstrapRs.slice(
      bootstrapRs.indexOf("fn detect_secret_sources_inner"),
      bootstrapRs.indexOf("fn legacy_secret_sources_detection_inner"),
    );
    assert.match(defaultDetection, /secret_source_legacy_cli_enabled\(\)/);
    assert.doesNotMatch(defaultDetection, /run_tool\("op"/);
    assert.doesNotMatch(defaultDetection, /run_tool\("bw"/);
    assert.doesNotMatch(defaultDetection, /run_tool_with_timeout\(\s*"op"/);
    assert.doesNotMatch(defaultDetection, /run_tool_with_timeout\(\s*"bw"/);
    assert.doesNotMatch(defaultDetection, /discover_onepassword_cli_metadata\(\)/);
    assert.match(defaultDetection, /empty_onepassword_cli_metadata\(\)/);
    assert.match(bootstrapRs, /legacy_secret_sources_detection_inner/);
    assert.match(bootstrapRs, /run_tool\("op", &\["--version"\]\)/);
    assert.match(bootstrapRs, /run_tool\("bw", &\["--version"\]\)/);
  });

  it("keeps normal saved-access detection on SDK status even when legacy CLI helpers remain compiled", () => {
    const detection = bootstrapRs.slice(
      bootstrapRs.indexOf("fn detect_secret_sources_inner"),
      bootstrapRs.indexOf("fn empty_onepassword_cli_metadata"),
    );
    assert.match(detection, /if secret_source_legacy_cli_enabled\(\)[\s\S]*legacy_secret_sources_detection_impl\(\)/);
    assert.match(detection, /sdk_secret_sources_detection_inner\(window\)/);
    assert.match(detection, /cli_metadata: empty_onepassword_cli_metadata\(\)/);
    assert.doesNotMatch(detection, /discover_onepassword_cli_metadata\(\)/);
    assert.doesNotMatch(detection, /run_tool(?:_with_timeout)?\(\s*"(?:op|bw)"/);
  });

  it("targets every bootstrap credential category, not only source tokens", () => {
    const expectedTargets = [
      ["GITHUB_TOKEN", "source.github.token"],
      ["GITLAB_TOKEN", "source.gitlab.token"],
      ["ANTHROPIC_API_KEY", "provider.anthropic.apiKey"],
      ["OPENAI_API_KEY", "provider.openai.apiKey"],
      ["OPENROUTER_API_KEY", "provider.openrouter.apiKey"],
      ["GEMINI_API_KEY", "provider.google-gemini.apiKey"],
      ["GOOGLE_API_KEY", "provider.google.apiKey"],
      ["XAI_API_KEY", "provider.xai.apiKey"],
      ["EXA_API_KEY", "tool.exa.apiKey"],
      ["FIRECRAWL_API_KEY", "tool.firecrawl.apiKey"],
      ["TAVILY_API_KEY", "tool.tavily.apiKey"],
      ["BRAVE_API_KEY", "tool.brave.apiKey"],
      ["CONTEXT7_API_KEY", "tool.context7.apiKey"],
      ["PERPLEXITY_API_KEY", "tool.perplexity.apiKey"],
      ["KUBECONFIG", "tool.kubernetes.kubeconfig"],
      ["CLOUDFLARE_API_TOKEN", "endpoint.cloudflare.apiToken"],
      ["CLOUDFLARE_ACCOUNT_ID", "endpoint.cloudflare.accountId"],
      ["CLOUDFLARE_TUNNEL_TOKEN", "endpoint.cloudflare.tunnelToken"],
    ];

    for (const [key, purpose] of expectedTargets) {
      assert.match(
        bootstrapRs,
        new RegExp(`\\("${key}",\\s*"${purpose.replaceAll(".", "\\.")}"\\)`),
        `${key} should be in SECRET_SOURCE_CANONICAL_TARGETS`,
      );
    }
  });

  it("persists SDK apply results to both Kubernetes Secret and ArgoCD valuesObject consumers", () => {
    const applySdkValues = bootstrapRs.slice(
      bootstrapRs.indexOf("fn apply_secret_source_sdk_values"),
      bootstrapRs.indexOf("fn run_secret_source_sdk_bridge_json"),
    );

    assert.match(applySdkValues, /apply_bootstrap_agent_keys\(&agent_keys\)/);
    assert.match(applySdkValues, /patch_bootstrap_cto_agent_keys\(&agent_keys\)/);
    assert.match(applySdkValues, /cto_agent_keys_values_patch|patch_bootstrap_cto_agent_keys/);
    assert.match(bootstrapRs, /build_saved_access_cto_config\(&setup\.saved_access\)/);
    assert.match(bootstrapRs, /saved_access:\s*setup\.saved_access\.clone\(\)/);
    assert.match(bootstrapRs, /cto_config_values_patch/);
  });

  it("does not collapse agent tokens into a generic cto-agent-keys saved-access target", () => {
    assert.doesNotMatch(
      bootstrapRs,
      /\("DISCORD_BOT_TOKEN",\s*"agent\.discord\.botToken"\)/,
      "agent saved-access should not be a single generic DISCORD_BOT_TOKEN target",
    );

    assert.match(bootstrapRs, /OPENCLAW_DISCORD_TOKENS_SECRET/);
    assert.match(bootstrapRs, /apply_bootstrap_discord_tokens/);

    for (const agentId of ["morgan", "rex", "grizz", "nova", "viper", "blaze"]) {
      assert.match(
        bootstrapRs,
        new RegExp(`agent\\.discord\\.${agentId}\\.botToken|${agentId}.*openclaw-discord-tokens`, "i"),
        `${agentId} Discord token should be addressable as a saved-access target`,
      );
    }
  });
});
