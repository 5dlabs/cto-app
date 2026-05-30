async function readRequestPayload() {
  const envPayload = process.env.CTO_SECRET_SOURCE_SDK_REQUEST;
  if (envPayload && envPayload.trim()) return envPayload;
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

const input = await readRequestPayload();
const request = JSON.parse(input || "{}");
const targets = Array.isArray(request.targets) ? request.targets : [];
const selections = Array.isArray(request.matches) ? request.matches : [];

function selectedTargets() {
  return targets
    .map((target) => {
      if (typeof target === "string") {
        const targetSecretKey = target.trim().toUpperCase();
        return targetSecretKey ? [targetSecretKey, targetSecretKey] : null;
      }
      const targetSecretKey = String(target?.targetSecretKey || target?.envKey || target?.name || target?.key || "")
        .trim()
        .toUpperCase();
      if (!targetSecretKey) return null;
      return [targetSecretKey, String(target?.purpose || targetSecretKey).trim() || targetSecretKey];
    })
    .filter(Boolean);
}

function targetMatchesName(targetKey, value) {
  const lower = String(value || "").toLowerCase();
  const target = targetKey.toLowerCase();
  return lower.includes(target) || lower.includes(target.replaceAll("_", " "));
}

function redactedPreview() {
  return "[REDACTED]";
}

function targetSecretNameFor(targetKey) {
  return /^[A-Z0-9_]+_DISCORD_BOT_TOKEN$/.test(targetKey)
    ? "openclaw-discord-tokens"
    : "cto-agent-keys";
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function envFirst(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactionCandidates(extra = []) {
  return [
    ...extra,
    request.serviceAccountToken,
    request.accessToken,
    request.organizationId,
    process.env.OP_ACCOUNT,
    process.env.ONEPASSWORD_ACCOUNT,
    process.env.OP_VAULT,
    process.env.ONEPASSWORD_VAULT,
    process.env.OP_SERVICE_ACCOUNT_TOKEN,
    process.env.ONEPASSWORD_SERVICE_ACCOUNT_TOKEN,
    process.env.ONEPASSWORD_SDK_TOKEN,
    process.env.BWS_ACCESS_TOKEN,
    process.env.BITWARDEN_ACCESS_TOKEN,
    process.env.BWS_ORGANIZATION_ID,
    process.env.BITWARDEN_ORGANIZATION_ID,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function redactSensitive(value, extra = []) {
  let redacted = String(value || "");
  for (const candidate of redactionCandidates(extra)) {
    redacted = redacted.replace(new RegExp(escapeRegExp(candidate), "g"), "[REDACTED]");
  }
  return redacted.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED]");
}

function safeErrorMessage(error, extra = []) {
  const raw = error instanceof Error ? error.message : String(error);
  return redactSensitive(raw, extra).replace(/\s+/g, " ").trim();
}

function fieldValueForTarget(item, targetKey) {
  const fields = Array.isArray(item?.fields) ? item.fields : [];
  const preferred = fields.find((field) => {
    const haystack = `${field.title || ""} ${field.id || ""}`.toLowerCase();
    return targetMatchesName(targetKey, haystack);
  });
  const fallback = fields.find((field) => {
    const haystack = `${field.title || ""} ${field.id || ""}`.toLowerCase();
    return /password|token|secret|credential|api key|apikey|key/.test(haystack);
  });
  return String((preferred || fallback)?.value || "").trim();
}

function onePasswordAuthMode() {
  return String(request.authMode || "desktop-app").trim() || "desktop-app";
}

async function onePasswordClient(authOverride = null) {
  const sdk = await import("@1password/sdk");
  const token = authOverride || envFirst("OP_SERVICE_ACCOUNT_TOKEN", "ONEPASSWORD_SERVICE_ACCOUNT_TOKEN", "ONEPASSWORD_SDK_TOKEN");
  const account = envFirst("OP_ACCOUNT", "ONEPASSWORD_ACCOUNT");
  let auth = token;
  if (!auth && account) {
    if (typeof sdk.DesktopAuth !== "function") {
      throw new Error("1Password DesktopAuth is unavailable in the bundled SDK.");
    }
    auth = new sdk.DesktopAuth(account);
  }
  if (!auth) {
    throw new Error("1Password SDK auth is not configured. Use app approval or a service account token.");
  }
  return sdk.createClient({
    auth,
    integrationName: "CTO Desktop",
    integrationVersion: "0.1.0",
  });
}

function onePasswordProbeResult(ok, message, authMode = onePasswordAuthMode()) {
  writeJson({
    provider: "onepassword",
    operation: "probe",
    ok,
    authMode,
    message,
    redaction: "[REDACTED]",
  });
}

async function probeOnePasswordDesktopAuth() {
  const accountName = String(request.accountName || request.account || "").trim();
  const vault = String(request.vault || "").trim();
  if (!accountName) {
    onePasswordProbeResult(false, "1Password account is required for app approval.");
    return;
  }

  try {
    const sdk = await import("@1password/sdk");
    if (typeof sdk.DesktopAuth !== "function") {
      onePasswordProbeResult(false, "1Password app approval is unavailable in the bundled SDK.");
      return;
    }
    const auth = new sdk.DesktopAuth(accountName);
    const client = await sdk.createClient({
      auth,
      integrationName: "CTO Desktop",
      integrationVersion: "0.1.0",
    });
    const vaults = await client.vaults.list();
    if (vault) {
      const vaultVisible = (Array.isArray(vaults) ? vaults : []).some((candidate) => {
        const id = String(candidate?.id || "").trim();
        const title = String(candidate?.title || candidate?.name || "").trim();
        return id === vault || title.localeCompare(vault, undefined, { sensitivity: "accent" }) === 0;
      });
      if (!vaultVisible) {
        onePasswordProbeResult(false, "1Password app approval succeeded, but the selected vault was not visible.");
        return;
      }
    }
    onePasswordProbeResult(true, "1Password app approval succeeded. Metadata probe completed.");
  } catch (error) {
    const reason = safeErrorMessage(error, [accountName, vault]);
    onePasswordProbeResult(
      false,
      `1Password app approval probe failed. Approve access in 1Password or use the service account fallback.${reason ? ` Reason: ${reason}` : ""}`,
    );
  }
}

async function probeOnePasswordServiceAccount() {
  const token = String(request.serviceAccountToken || "").trim();
  const vault = String(request.vault || "").trim();
  if (!token) {
    onePasswordProbeResult(false, "1Password service account token is required.", "service-account");
    return;
  }

  try {
    const client = await onePasswordClient(token);
    const vaults = await client.vaults.list();
    const visibleVaults = Array.isArray(vaults) ? vaults : [];
    const selectedVault = vault
      ? visibleVaults.find((candidate) => {
          const id = String(candidate?.id || "").trim();
          const title = String(candidate?.title || candidate?.name || "").trim();
          return id === vault || title.localeCompare(vault, undefined, { sensitivity: "accent" }) === 0;
        })
      : visibleVaults[0];
    if (vault && !selectedVault) {
      onePasswordProbeResult(false, "1Password service account probe succeeded, but the selected vault was not visible.", "service-account");
      return;
    }
    if (selectedVault?.id) {
      await client.items.list(selectedVault.id);
    }
    onePasswordProbeResult(true, "1Password service account probe succeeded. Metadata probe completed.", "service-account");
  } catch (error) {
    const reason = safeErrorMessage(error, [token, vault]);
    onePasswordProbeResult(
      false,
      `1Password service account probe failed. Check the service account token or use app approval.${reason ? ` Reason: ${reason}` : ""}`,
      "service-account",
    );
  }
}

async function previewOnePassword() {
  const client = await onePasswordClient();
  const vaultId = envFirst("OP_VAULT", "ONEPASSWORD_VAULT");
  const vaults = vaultId ? [{ id: vaultId, title: vaultId }] : await client.vaults.list();
  const matches = [];
  for (const [targetKey, purpose] of selectedTargets()) {
    let matched = null;
    for (const vault of vaults) {
      const items = await client.items.list(vault.id);
      const item = items.find((candidate) => targetMatchesName(targetKey, candidate.title));
      if (item) {
        matched = { vault, item };
        break;
      }
    }
    if (!matched) continue;
    matches.push({
      provider: "onepassword",
      purpose,
      targetSecretName: targetSecretNameFor(targetKey),
      targetSecretKey: targetKey,
      providerRef: `op-sdk://${matched.vault.id}/${matched.item.id}`,
      label: matched.item.title || targetKey,
      confidence: "name-match",
      redactedValuePreview: redactedPreview(),
      approvalRequired: true,
    });
  }
  writeJson({
    provider: "onepassword",
    discovery: "metadata-only",
    matches,
    warnings: [
      "Review before connecting; raw values are not read until approval is submitted.",
      "Paste instead remains available for any missing key.",
    ],
  });
}

async function applyOnePassword() {
  const client = await onePasswordClient();
  const values = [];
  for (const selection of selections) {
    const ref = String(selection.providerRef || "");
    const match = ref.match(/^op-sdk:\/\/([^/]+)\/([^/]+)$/);
    if (!match) throw new Error("1Password providerRef must use op-sdk://vaultId/itemId provenance");
    const [, vaultId, itemId] = match;
    const item = await client.items.get(vaultId, itemId);
    const value = fieldValueForTarget(item, selection.targetSecretKey);
    values.push({
      purpose: selection.purpose || "",
      targetSecretKey: selection.targetSecretKey,
      providerRef: ref,
      value,
    });
  }
  writeJson({ provider: "onepassword", values });
}

async function bitwardenClient(accessTokenOverride = null, stateFile = null) {
  const sdk = await import("@bitwarden/sdk-napi");
  const accessToken = accessTokenOverride || envFirst("BWS_ACCESS_TOKEN", "BITWARDEN_ACCESS_TOKEN");
  if (!accessToken) throw new Error("Bitwarden SDK auth is not configured. Set BWS_ACCESS_TOKEN.");
  const client = new sdk.BitwardenClient();
  await client.auth().loginAccessToken(accessToken, stateFile || undefined);
  return client;
}

function bitwardenOrganizationId() {
  const organizationId = String(request.organizationId || "").trim() || envFirst("BWS_ORGANIZATION_ID", "BITWARDEN_ORGANIZATION_ID");
  if (!organizationId) throw new Error("Bitwarden organization is not configured. Set BWS_ORGANIZATION_ID.");
  return organizationId;
}

function bitwardenProbeResult(ok, message) {
  writeJson({
    provider: "bitwarden",
    operation: "probe",
    ok,
    authMode: "secrets-manager",
    message,
    redaction: "[REDACTED]",
  });
}

async function probeBitwardenSecretsManager() {
  const accessToken = String(request.accessToken || "").trim();
  const organizationId = String(request.organizationId || "").trim();
  const stateFile = String(request.stateFile || "").trim() || null;
  if (!accessToken) {
    bitwardenProbeResult(false, "Bitwarden Secrets Manager access token is required.");
    return;
  }
  if (!organizationId) {
    bitwardenProbeResult(false, "Bitwarden Secrets Manager organization ID is required.");
    return;
  }

  try {
    const client = await bitwardenClient(accessToken, stateFile);
    await client.secrets().list(organizationId);
    bitwardenProbeResult(true, "Bitwarden Secrets Manager probe succeeded. Metadata probe completed.");
  } catch (error) {
    const reason = safeErrorMessage(error, [accessToken, organizationId]);
    bitwardenProbeResult(
      false,
      `Bitwarden Secrets Manager probe failed. Check the Secrets Manager access token and organization ID.${reason ? ` Reason: ${reason}` : ""}`,
    );
  }
}

async function previewBitwarden() {
  const client = await bitwardenClient();
  const organizationId = bitwardenOrganizationId();
  const response = await client.secrets().list(organizationId);
  const secrets = Array.isArray(response?.data) ? response.data : [];
  const matches = [];
  for (const [targetKey, purpose] of selectedTargets()) {
    const secret = secrets.find((candidate) => targetMatchesName(targetKey, candidate.key));
    if (!secret) continue;
    matches.push({
      provider: "bitwarden",
      purpose,
      targetSecretName: targetSecretNameFor(targetKey),
      targetSecretKey: targetKey,
      providerRef: `bws://${secret.organizationId || organizationId}/${secret.id}`,
      label: secret.key || targetKey,
      confidence: "name-match",
      redactedValuePreview: redactedPreview(),
      approvalRequired: true,
    });
  }
  writeJson({
    provider: "bitwarden",
    discovery: "metadata-only",
    matches,
    warnings: [
      "Review before connecting; raw values are not read until approval is submitted.",
      "Paste instead remains available for any missing key.",
    ],
  });
}

async function applyBitwarden() {
  const client = await bitwardenClient();
  const values = [];
  for (const selection of selections) {
    const ref = String(selection.providerRef || "");
    const match = ref.match(/^bws:\/\/([^/]+)\/([^/]+)$/);
    if (!match) throw new Error("Bitwarden providerRef must use bws://organizationId/secretId provenance");
    const secret = await client.secrets().get(match[2]);
    values.push({
      purpose: selection.purpose || "",
      targetSecretKey: selection.targetSecretKey,
      providerRef: ref,
      value: String(secret?.value || "").trim(),
    });
  }
  writeJson({ provider: "bitwarden", values });
}

async function previewFixture() {
  const fixtures = Array.isArray(request.fixtures) ? request.fixtures : [];
  const matches = [];
  for (const [targetKey, purpose] of selectedTargets()) {
    const fixture = fixtures.find((candidate) =>
      targetMatchesName(targetKey, `${candidate?.key || ""} ${candidate?.title || ""} ${candidate?.id || ""}`),
    );
    if (!fixture) continue;
    matches.push({
      provider: "fixture",
      purpose,
      targetSecretName: targetSecretNameFor(targetKey),
      targetSecretKey: targetKey,
      providerRef: `fixture://${targetKey}`,
      label: String(fixture.key || fixture.title || targetKey),
      confidence: "name-match",
      redactedValuePreview: redactedPreview(),
      approvalRequired: true,
    });
  }
  writeJson({
    provider: "fixture",
    discovery: "metadata-only",
    matches,
    warnings: ["Fixture metadata preview never reads raw secret values."],
  });
}

try {
  if (request.provider === "onepassword" && request.operation === "probe" && onePasswordAuthMode() === "service-account") await probeOnePasswordServiceAccount();
  else if (request.provider === "onepassword" && request.operation === "probe") await probeOnePasswordDesktopAuth();
  else if (request.provider === "onepassword" && request.operation === "preview") await previewOnePassword();
  else if (request.provider === "onepassword" && request.operation === "apply") await applyOnePassword();
  else if (request.provider === "bitwarden" && request.operation === "probe") await probeBitwardenSecretsManager();
  else if (request.provider === "bitwarden" && request.operation === "preview") await previewBitwarden();
  else if (request.provider === "bitwarden" && request.operation === "apply") await applyBitwarden();
  else if (request.provider === "fixture" && request.operation === "preview") await previewFixture();
  else throw new Error(`Unsupported secret source SDK operation: ${request.provider}/${request.operation}`);
} catch (error) {
  process.stderr.write(`${safeErrorMessage(error)}\n`);
  process.exit(1);
}
