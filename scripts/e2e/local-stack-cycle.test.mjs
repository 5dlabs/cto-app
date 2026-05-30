import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFullSetupFlowDocument, createSetupFlowDocument } from "./local-stack-flow-fixtures.mjs";

const runnerSource = await import("node:fs/promises").then((fs) =>
  fs.readFile(new URL("./local-stack-cycle.mjs", import.meta.url), "utf8"),
);

const requiredScreenTransitions = [
  "Prepare Client Cluster baseline",
  "Continue to saved access",
  "Continue to Cloudflare",
  "Continue to Source",
  "Continue to harness selection",
  "Continue to ACP CLIs",
  "Continue to providers",
  "Configure provider authentication",
  "Choose harness routing",
  "Configure tool API keys",
  "Configure agent Discord tokens",
];

const requiredVisibleSelections = [
  "Cloudflare",
  "1Password",
  "Quick tunnel",
  "Continue without saved access",
  "Hermes",
  "Copilot",
  "GitHub Copilot",
  "Authorize with GitHub",
  "Use a personal access token instead",
  "Start",
];

describe("local stack setup E2E selector coverage", () => {
  it("contains stable selectors for every setup screen transition and required selection", () => {
    const markup = createFullSetupFlowDocument();
    for (const label of requiredScreenTransitions) {
      assert.match(markup, new RegExp(escapeRegExp(label)), `missing transition affordance: ${label}`);
    }
    for (const label of requiredVisibleSelections) {
      assert.match(markup, new RegExp(escapeRegExp(label)), `missing selectable affordance: ${label}`);
    }
  });

  it("uses existing GitHub tokens without prompting authorization", () => {
    const markup = createSetupFlowDocument({ token: "github_pat_redacted", owner: "5DLabsInc" });
    assert.match(markup, /GitHub credentials are already configured/i);
    assert.doesNotMatch(markup, /data-testid="source-authorize-github"/);
    assert.doesNotMatch(markup, /title="Continue to harness selection" disabled/);
    assert.match(runnerSource, /CTO_E2E_GITHUB_PAT/);
    assert.match(runnerSource, /CTO_GITHUB_PAT/);
    assert.match(runnerSource, /GITHUB_TOKEN/);
    assert.match(runnerSource, /gh", \["auth", "token"/);
    assert.match(runnerSource, /gh", \["api", "user"/);
  });

  it("clicks Authorize with GitHub when no token exists", () => {
    const markup = createSetupFlowDocument({ token: "", owner: "5DLabsInc" });
    assert.match(markup, /data-testid="source-authorize-github"/);
    assert.match(markup, /Authorize with GitHub/);
    assert.match(markup, /title="Continue to harness selection" disabled/);
    assert.match(runnerSource, /ensureGithubAuthorizationIfNeeded/);
    assert.match(runnerSource, /Authorize with GitHub/i);
    assert.match(runnerSource, /pbpaste/);
    assert.match(runnerSource, /System Events/);
    assert.match(runnerSource, /CTO_E2E_GITHUB_BROWSER_AUTOMATION/);
    assert.match(runnerSource, /GitHub OAuth connected|GitHub credentials are already configured|Select the user or org/i);
  });

  it("wraps console/network diagnostics and fails on setup-screen console errors", () => {
    assert.match(runnerSource, /installBrowserDiagnostics/);
    assert.match(runnerSource, /drainBrowserDiagnostics/);
    assert.match(runnerSource, /failOnBrowserConsoleErrors/);
    assert.match(runnerSource, /window\.__ctoE2eDiagnostics/);
    assert.match(runnerSource, /WebSocket/);
    assert.match(runnerSource, /unhandledrejection/);
    assert.match(runnerSource, /isExpectedPreBootstrapNetworkDiagnostic/);
  });

  it("captures static DOM snapshot artifacts throughout the flow", () => {
    assert.match(runnerSource, /writeDomSnapshotArtifact/);
    assert.match(runnerSource, /captureDomSnapshot/);
    assert.match(runnerSource, /00-setup-gate-before/);
    assert.match(runnerSource, /02-cluster-dependencies/);
    assert.match(runnerSource, /10-harnesses/);
    assert.match(runnerSource, /80-agent-tokens/);
    assert.match(runnerSource, /92-bootstrap-finished/);
  });

  it("captures structured controls and selected values for intent assertions", () => {
    assert.match(runnerSource, /selected:/);
    assert.match(runnerSource, /controls:/);
    assert.match(runnerSource, /data-testid/);
    assert.match(runnerSource, /aria-disabled/);
  });

  it("wires intent test mode reports into the setup runner", () => {
    assert.match(runnerSource, /--intent-test/);
    assert.match(runnerSource, /CTO_E2E_INTENT_TEST/);
    assert.match(runnerSource, /manifest\.json/);
    assert.match(runnerSource, /report\.md/);
    assert.match(runnerSource, /evaluateSnapshotIntent/);
  });

  it("captures Tauri screenshots and Morgan media state at every checkpoint", () => {
    assert.match(runnerSource, /captureVisualFeedbackArtifact/);
    assert.match(runnerSource, /take_screenshot/);
    assert.match(runnerSource, /mediaState/);
    assert.match(runnerSource, /consoleEvents/);
    assert.match(runnerSource, /__ctoConsoleEvents/);
    assert.match(runnerSource, /\.local.*e2e-visual-runs/s);
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
