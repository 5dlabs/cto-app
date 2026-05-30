import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");
const sourceScript = readFileSync(new URL("../../ui/public/uploads/morgan/04_source/script.md", import.meta.url), "utf8");
const uxDoc = readFileSync(new URL("../../docs/2026-04/morgan-setup-ux-principles.md", import.meta.url), "utf8");

function sourceRegion() {
  const start = source.indexOf('setupScreen === "source" ? (');
  const end = source.indexOf('setupScreen === "clis" ? (', start);
  assert.notEqual(start, -1, "source screen branch should exist");
  assert.notEqual(end, -1, "clis branch should follow source screen branch");
  return source.slice(start, end);
}

function preSourceRegion() {
  const start = source.indexOf("const cloudflareEndpointPanel = (");
  const end = source.indexOf("const savedAccessPanel", start);
  assert.notEqual(start, -1, "Cloudflare endpoint panel should exist before Source");
  assert.notEqual(end, -1, "Source saved-access panel should follow pre-Source prep panels");
  return source.slice(start, end);
}

describe("Source install actions", () => {
  it("adds endpoint and saved-access prep screens before Source with official brand icons", () => {
    const preSource = preSourceRegion();
    assert.ok(source.indexOf('setSetupScreen("saved-access")') < source.indexOf('setupScreen === "source" ? ('), "setup should route to Saved access before Source");
    assert.ok(source.indexOf('setupScreen === "saved-access" ? (') < source.indexOf('setupScreen === "source" ? ('), "Saved access should render before Source in flow order");
    assert.match(preSource, /data-testid="cloudflare-endpoint-oauth"/);
    assert.match(preSource, /aria-label="Sign in with Cloudflare"/);
    assert.match(preSource, /\/icons\/cloudflare\.svg/);
    assert.match(source, /data-official-icon=\{label\}/);
    assert.match(preSource, /officialBrandIcon\("\/icons\/cloudflare\.svg", "Cloudflare"\)/);
    assert.match(preSource, /data-testid="cloudflare-endpoint-saved-access"/);
    assert.match(preSource, /data-testid="cloudflare-endpoint-quick-tunnel"/);
    assert.match(preSource, /data-testid="saved-access-onepassword"/);
    assert.match(preSource, /aria-label="Use 1Password for secrets"/);
    assert.doesNotMatch(preSource, /data-testid="saved-access-more-options"/);
    assert.match(preSource, /data-testid="saved-access-bitwarden"/);
    assert.doesNotMatch(preSource, /data-secondary-provider="true"/);
    assert.doesNotMatch(preSource, /shouldShowBitwardenOption/);
    assert.doesNotMatch(source, /Bitwarden stays in More options unless the local bw CLI is detected/);
    assert.match(source, /data-testid=\{`saved-access-\$\{savedAccessPrepMode === "bitwarden" \? "bitwarden" : "onepassword"\}-modal`\}/);
    assert.match(preSource, /\/icons\/1password\.svg/);
    assert.match(preSource, /data-testid="saved-access-readiness"/);
    assert.match(source, /savedAccessCueFromDetection/);
    assert.match(source, /savedAccessReadinessPercent/);
    assert.match(source, /withSavedAccessTimeout/);
    assert.match(source, /approval-pending/);
    assert.match(source, /SAVED_ACCESS_DETECTION_TIMEOUT_MS/);
    assert.match(source, /data-testid="cloudflare-endpoint-local"/);
    assert.match(preSource, /data-testid="saved-access-skip"/);
    assert.match(preSource, /Continue without a secret manager/);
    assert.doesNotMatch(preSource, /IconClose size=\{44\}/);
    assert.match(preSource, /speakMorganCue/);
  });

  it("starts with three low-cognition source choices and keeps engines under 5D Origin", () => {
    const region = sourceRegion();

    assert.match(region, />GitHub<|>GitHub</);
    assert.match(region, />GitLab<|>GitLab</);
    assert.match(region, />5D Origin<|>5D Origin</);
    assert.match(region, /data-testid="source-install-github"/);
    assert.match(region, /data-testid="source-install-gitlab"/);
    assert.match(region, /data-testid="source-install-5d-origin"/);
    assert.doesNotMatch(region, /data-testid="source-install-gitea"/);
    assert.doesNotMatch(region, /data-testid="source-install-gitea-cto"/);
    assert.doesNotMatch(region, /data-testid="source-install-gitlab-cto"/);

    const installGrid = region.slice(
      region.indexOf('aria-label="Source install actions"'),
      region.indexOf('{sourceModalProvider ? ('),
    );

    assert.doesNotMatch(installGrid, /installed Morgan|installed GitLab|installed 5D Origin/i);
    assert.doesNotMatch(installGrid, />\s*Install Morgan on GitHub\s*<|>\s*Install Morgan on GitLab\s*<|>\s*Install 5D Origin\s*</);
    assert.doesNotMatch(installGrid, /device authentication|device-code|Personal access token|manual token/i);
  });

  it("keeps the visible install grid icon-first with accessible action labels", () => {
    const region = sourceRegion();
    const installGrid = region.slice(
      region.indexOf('aria-label="Source install actions"'),
      region.indexOf('{sourceModalProvider ? ('),
    );

    assert.match(installGrid, /aria-label="Install Morgan on GitHub"/);
    assert.match(installGrid, /aria-label="Install Morgan on GitLab"/);
    assert.match(installGrid, /aria-label="Prepare 5D Origin mirror or managed source"/);
    assert.doesNotMatch(installGrid, /IconInstallDesktop/);
    assert.doesNotMatch(installGrid, /IconUpload/);
    assert.match(installGrid, /IconGitHub/);
    assert.match(installGrid, /IconGitLab/);
    assert.match(installGrid, /Icon5DOrigin/);
    assert.match(installGrid, /sr-only/);
    assert.doesNotMatch(installGrid, /local-bootstrap__install-action/);
  });

  it("models 5D Origin as an optional mirror-first managed source lane with clear Gitea/GitLab choices", () => {
    const region = sourceRegion();
    const originIndex = region.indexOf('data-testid="source-install-5d-origin"');
    assert.ok(originIndex >= 0, "5D Origin action should exist");
    const originButtonStart = region.lastIndexOf("<button", originIndex);
    const originButtonEnd = region.indexOf("</button>", originIndex);
    const originButton = region.slice(originButtonStart, originButtonEnd);

    assert.match(originButton, /aria-label="Prepare 5D Origin mirror or managed source"/);
    assert.match(originButton, /sr-only">5D Origin</);
    assert.match(region, /data-testid="source-origin-standard"/);
    assert.match(region, /Gitea/);
    assert.match(region, /Use Gitea under 5D Origin/);
    assert.doesNotMatch(region, />lightweight Git server</);
    assert.match(region, /data-testid="source-origin-gitlab-compatible"/);
    assert.match(region, /GitLab/);
    assert.match(region, /Use GitLab under 5D Origin/);
    assert.doesNotMatch(region, />GitLab CE</);
    assert.doesNotMatch(originButton, /Installed 5D Origin/);
  });

  it("documents inference, hosted-first setup, 5D Origin, and migration/off-ramp wording", () => {
    assert.match(sourceScript, /GitHub or GitLab/i);
    assert.match(sourceScript, /local Git history points there/i);
    assert.match(sourceScript, /5D Origin/i);
    assert.match(sourceScript, /mirror first/i);
    assert.match(sourceScript, /Gitea for the lightweight Git server/i);
    assert.match(sourceScript, /GitLab CE/i);
    assert.match(sourceScript, /GitLab-style CI workflows/i);
    assert.match(uxDoc, /infer.*GitHub.*GitLab/i);
    assert.match(uxDoc, /5D Origin/);
    assert.match(uxDoc, /Gitea/i);
    assert.match(uxDoc, /GitLab/i);
    assert.match(uxDoc, /agent-native/i);
    assert.match(uxDoc, /mirror|migrate|off-ramp/i);
  });

  it("does not preview saved access as source-token-only", () => {
    assert.doesNotMatch(
      source,
      /targets:\s*\[sourceProvider === "github" \? "GITHUB_TOKEN" : "GITLAB_TOKEN"\]/,
    );

    for (const target of [
      "GITHUB_TOKEN",
      "GITLAB_TOKEN",
      "OPENAI_API_KEY",
      "OPENROUTER_API_KEY",
      "ANTHROPIC_API_KEY",
      "EXA_API_KEY",
      "FIRECRAWL_API_KEY",
      "TAVILY_API_KEY",
      "BRAVE_API_KEY",
      "CONTEXT7_API_KEY",
      "PERPLEXITY_API_KEY",
      "CLOUDFLARE_API_TOKEN",
      "KUBECONFIG",
    ]) {
      assert.match(source, new RegExp(`"${target}"`), `${target} should be previewable from saved access`);
    }
  });

  it("carries approved saved-access references into final bootstrap request", () => {
    const buildRequest = source.slice(
      source.indexOf("function buildBootstrapRequest"),
      source.indexOf("function providerAuthLabel"),
    );

    assert.match(buildRequest, /savedAccess|secretSource/i);

    const runBootstrapStart = source.indexOf('await invokeTauri("bootstrap_local_stack"');
    const runBootstrap = source.slice(runBootstrapStart, source.indexOf(");", runBootstrapStart));
    assert.match(runBootstrap, /savedAccessApplyResult|secretSource/i);

    assert.match(
      source,
      /savedAccessApplyResult[\s\S]*(setGithubForm|setSourceCredentialForm|setProviderAuthInputs|setProviderAuthApiKeys|setToolApiKeys|setDiscordAgentTokens)/,
    );
  });

  it("Cloudflare saved-access path previews and applies Cloudflare credentials", () => {
    const preSource = preSourceRegion();
    const savedAccessStart = preSource.indexOf('data-testid="cloudflare-endpoint-saved-access"');
    const cloudflareSavedAccess = preSource.slice(
      savedAccessStart,
      preSource.indexOf('data-testid="cloudflare-endpoint-quick-tunnel"', savedAccessStart),
    );

    assert.match(cloudflareSavedAccess, /previewSavedAccess|connectSavedAccessAndRetry/);

    for (const target of [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_TUNNEL_TOKEN",
    ]) {
      assert.match(source, new RegExp(target), `${target} should be part of Cloudflare saved-access flow`);
    }
  });
});
