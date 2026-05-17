import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateSnapshotIntent } from "./intent-evaluator.mjs";
import {
  createAuthMatrixSourceDocument,
  createGitHubPatSourceDocument,
  createGitLabDotComSourceDocument,
  createSelfHostedGitLabSourceDocument,
  snapshotFromDocument,
} from "./local-stack-flow-fixtures.mjs";

const sourceContract = {
  id: "source",
  heading: "Source",
  requiredText: ["Where is your code?", "GitHub", "GitLab", "enterprise", "self-managed"],
  requiredControls: [
    "GitHub",
    "GitLab",
    "Using GitHub Enterprise?",
    "Using self-managed GitLab?",
    "Continue to harness selection",
  ],
  rules: ["continue-disabled-until-authorized", "secrets-redacted"],
};

describe("source auth intent matrix", () => {
  it("requires provider-first choices with contextual enterprise/self-managed branches", () => {
    const result = evaluateSnapshotIntent(
      sourceContract,
      snapshotFromDocument(createAuthMatrixSourceDocument()),
    );

    assert.equal(result.status, "passed", JSON.stringify(result.assertions, null, 2));
  });

  it("keeps GitHub PAT values redacted while allowing Continue when present", () => {
    const snapshot = snapshotFromDocument(
      createGitHubPatSourceDocument({ token: "github_pat_secret_value" }),
    );
    const result = evaluateSnapshotIntent(
      {
        ...sourceContract,
        requiredText: ["GitHub", "Use a personal access token instead", "github.com"],
        requiredControls: ["Use a personal access token instead", "Continue to harness selection"],
        rules: ["secrets-redacted"],
      },
      snapshot,
    );

    assert.equal(result.status, "passed", JSON.stringify(result.assertions, null, 2));
    assert.equal(JSON.stringify(snapshot).includes("github_pat_secret_value"), false);
  });

  it("captures GitLab.com manual-token intent", () => {
    const result = evaluateSnapshotIntent(
      {
        ...sourceContract,
        requiredText: ["GitLab", "GitLab.com", "Install Morgan on GitLab", "manual token", "groups", "projects"],
        requiredControls: ["GitLab", "Install Morgan on GitLab", "Use a manual token instead", "Continue to harness selection"],
        rules: ["secrets-redacted"],
      },
      snapshotFromDocument(createGitLabDotComSourceDocument()),
    );

    assert.equal(result.status, "passed", JSON.stringify(result.assertions, null, 2));
  });

  it("captures self-managed GitLab instance OAuth intent", () => {
    const result = evaluateSnapshotIntent(
      {
        ...sourceContract,
        requiredText: ["GitLab", "self-hosted", "https://gitlab.example.test", "OAuth application"],
        requiredControls: ["Using self-managed GitLab?", "Continue to harness selection"],
        rules: ["secrets-redacted"],
      },
      snapshotFromDocument(createSelfHostedGitLabSourceDocument()),
    );

    assert.equal(result.status, "passed", JSON.stringify(result.assertions, null, 2));
  });
});
