import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const reactSource = readFileSync(resolve(repoRoot, "ui/src/components/LocalStackBootstrap.tsx"), "utf8");
const apiSource = readFileSync(resolve(repoRoot, "ui/src/api/sourceControlProvisioning.ts"), "utf8");

function sliceBetween(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${label} start marker should exist`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `${label} end marker should exist`);
  return source.slice(start, end);
}

function assertHas(source, pattern, message) {
  assert.ok(pattern.test(source), message);
}

function assertLacks(source, pattern, message) {
  assert.ok(!pattern.test(source), message);
}

const savedAccessPrepPanel = sliceBetween(
  reactSource,
  "const savedAccessPrepPanel = (",
  "const savedAccessPanel =",
  "Secrets prep panel",
);

const savedAccessModal = sliceBetween(
  savedAccessPrepPanel,
  "data-testid={`saved-access-${savedAccessPrepMode === \"bitwarden\" ? \"bitwarden\" : \"onepassword\"}-modal`}",
  "{error ? <div className=\"local-bootstrap__inline-error\">{error}</div> : null}",
  "Secrets provider modal",
);

const savedAccessConnectSheet = sliceBetween(
  reactSource,
  "data-testid=\"saved-access-connect-sheet\"",
  "data-testid=\"source-saved-access-review\"",
  "Saved access connect sheet",
);

describe("Secrets saved-access auth-state contract", () => {
  it("models provider auth as explicit readiness states rather than CLI booleans", () => {
    assertHas(apiSource, /export type SecretSourceAuthState\s*=/, "SecretSourceAuthState union should be exported");
    for (const state of [
      "ready-service-account",
      "ready-desktop-account",
      "approval-needed",
      "choose-account",
      "app-sign-in-needed",
      "service-token-needed",
      "token-needed",
      "org-needed",
      "probe-failed",
      "unavailable",
    ]) {
      assertHas(apiSource, new RegExp(`\"${state}\"`), `${state} should be a frozen auth state`);
    }

    assertHas(apiSource, /authState:\s*SecretSourceAuthState/, "provider status should expose authState");
    assertHas(apiSource, /ready:\s*boolean/, "provider status should expose explicit ready boolean");
    assertHas(apiSource, /canAttemptDesktopApproval\?:\s*boolean/, "1Password status should expose desktop-approval capability");
    assertHas(apiSource, /accountCandidates\?:\s*OnePasswordAccountCandidate\[\]/, "1Password status should expose account candidates");
    assertHas(apiSource, /vaultCandidates\?:\s*Array<\{[^}]*name:\s*string/s, "account candidates should expose vault candidates");
  });

  it("keeps the primary Secrets screen away from env-var, SDK-install, and 1Password username/password copy", () => {
    assertHas(savedAccessPrepPanel, /title=\"Secrets\"/, "primary screen should use Secrets terminology");
    assertHas(savedAccessPrepPanel, />Secrets<\/div>/, "primary screen should label the screen Secrets");
    assertLacks(savedAccessPrepPanel, /Set\s+OP_ACCOUNT/i, "primary copy must not ask users to set OP_ACCOUNT");
    assertLacks(savedAccessPrepPanel, /OP_SERVICE_ACCOUNT_TOKEN/, "primary copy must not show OP_SERVICE_ACCOUNT_TOKEN");
    assertLacks(savedAccessPrepPanel, /install\s+(?:the\s+)?SDK/i, "primary copy must not ask users to install an SDK");
    assertLacks(savedAccessPrepPanel, /1Password[\s\S]{0,240}(username|user name)\s*\/\s*password/i, "1Password copy must not offer username/password auth");
    assertLacks(savedAccessPrepPanel, /<span>\s*(?:Username|User name|Password)\s*<\/span>/i, "1Password UI must not render username/password fields");
  });

  it("presents 1Password app approval first, then account selection, advanced service-account fallback, and manual alternatives", () => {
    assertHas(savedAccessPrepPanel, /Use 1Password for secrets/, "Secrets screen should offer 1Password");
    assertHas(savedAccessConnectSheet, /Use 1Password app/, "1Password sheet should prioritize app approval");
    assertHas(savedAccessConnectSheet, /(Choose|Select)\s+(?:a\s+)?1Password account|Account picker|accountCandidates|Account name or UUID/i, "1Password sheet should include account picker/input language");
    assertHas(savedAccessConnectSheet, /Service account token/i, "1Password sheet should include service account token fallback");
    assertHas(savedAccessConnectSheet, /(?:Advanced|Fallback)[\s\S]{0,260}Service account token|Service account token[\s\S]{0,260}(?:Advanced|Fallback)/i, "service-account token should be labeled fallback/advanced");
    assertHas(savedAccessPrepPanel, /Manual paste|Paste manually|Continue without (?:a )?secret manager/i, "Secrets screen should expose manual/skip path");
    assertHas(savedAccessModal, /Manual paste|Paste manually|Continue without (?:a )?secret manager/i, "provider modal should expose manual/skip path");
    assertLacks(savedAccessConnectSheet, /<span>\s*(?:Username|User name|Password)\s*<\/span>/i, "1Password sheet must not render username/password fields");
  });

  it("probes service-account fallback before saving so failed probes keep the connect sheet open", () => {
    const saveFlow = sliceBetween(
      reactSource,
      "const saveSavedAccessAuthAndRetry = useCallback",
      "const connectSavedAccessAndRetry = useCallback",
      "saved access save flow",
    );
    assertHas(saveFlow, /authMode:\s*"service-account"/, "service account save path should construct a probe request");
    assertHas(saveFlow, /serviceAccountToken:\s*savedAccessAuthForm\.onepasswordServiceAccountSecret/, "probe should use the pasted service account token");
    assertHas(saveFlow, /if \(!probe\.ok\)[\s\S]*setSavedAccessState\("failed"\)[\s\S]*setShowSourceAdvanced\(true\)[\s\S]*return/, "failed service-account probe should not close the connect sheet or save ready metadata");
    assertHas(apiSource, /serviceAccountToken\?:\s*string/, "probe request type should allow service account token");
  });

  it("presents Bitwarden as Secrets Manager auth, not Password Manager/browser unlock", () => {
    assertHas(savedAccessPrepPanel, /Use Bitwarden for secrets/, "Secrets screen should offer Bitwarden");
    assertHas(savedAccessConnectSheet, /Bitwarden Secrets Manager/, "Bitwarden sheet should say Bitwarden Secrets Manager");
    assertHas(savedAccessConnectSheet, /access token/i, "Bitwarden sheet should ask for access token");
    assertHas(savedAccessConnectSheet, /Organization ID/, "Bitwarden sheet should ask for organization ID");
    assertHas(savedAccessConnectSheet, /Password Manager/i, "Bitwarden sheet should explicitly mention Password Manager distinction");
    assertHas(savedAccessConnectSheet, /not\s+(?:the\s+)?(?:Bitwarden\s+)?Password Manager|separate from\s+(?:the\s+)?(?:Bitwarden\s+)?Password Manager/i, "Bitwarden sheet should separate Secrets Manager from Password Manager unlock");
    assertLacks(savedAccessConnectSheet, /master password|browser unlock is enough|desktop unlock is enough/i, "Bitwarden sheet must not imply Password Manager/browser unlock is enough");
  });

  it("blocks Continue for CLI-only or no-account 1Password states until auth is ready or the user chooses manual/skip", () => {
    assertHas(reactSource, /canContinueFromSavedAccessAuthState|savedAccessCanContinue/i, "UI should compute an explicit saved-access Continue gate");
    assertHas(reactSource, /cli-only|cliOnly|no-account|app-sign-in-needed/, "UI should model CLI-only/no-account as blocked states");
    assertLacks(reactSource, /providerStatus\.available\s*\|\|\s*providerStatus\.cliAccessReady/, "CLI access alone must not mark a provider ready");
    assertHas(savedAccessModal, /disabled=\{[^}]*!(?:savedAccessCanContinue|canContinueFromSavedAccessAuthState)/s, "Continue should be disabled until auth is ready or manual/skip is explicit");
    assertHas(savedAccessModal, /CLI[^\n"]*(?:diagnostic|prefill|metadata)[^\n"]*(?:only|not ready)|no automatic advance/i, "modal should state CLI is diagnostic/prefill only and does not auto-advance");
  });

  it("probes Bitwarden Secrets Manager before saving so missing or failed token/org checks keep the connect sheet open", () => {
    const saveFlow = sliceBetween(
      reactSource,
      "const saveSavedAccessAuthAndRetry = useCallback",
      "const connectSavedAccessAndRetry = useCallback",
      "saved access save flow",
    );
    assertHas(saveFlow, /provider === "bitwarden"[\s\S]*probeSecretSourceAuth/, "Bitwarden save path should construct a probe request");
    assertHas(saveFlow, /authMode:\s*"secrets-manager"/, "Bitwarden probe should use Secrets Manager auth mode");
    assertHas(saveFlow, /accessToken:\s*savedAccessAuthForm\.bitwardenAccessSecret/, "Bitwarden probe should pass the pasted access token");
    assertHas(saveFlow, /organizationId:\s*savedAccessAuthForm\.bitwardenOrganizationId/, "Bitwarden probe should pass organization ID metadata");
    assertHas(saveFlow, /if \(!probe\.ok\)[\s\S]*setSavedAccessState\("failed"\)[\s\S]*setShowSourceAdvanced\(true\)[\s\S]*return/, "failed Bitwarden probe should not close the connect sheet or save ready metadata");
    assertHas(apiSource, /accessToken\?:\s*string/, "probe request type should allow Bitwarden access token");
    assertHas(apiSource, /organizationId\?:\s*string/, "probe request type should allow Bitwarden organization ID");
  });
});
