import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateSnapshotIntent } from "./intent-evaluator.mjs";

const sourceContract = {
  id: "source",
  checkpoint: "04-source-configured",
  heading: "Source",
  requiredText: ["GitHub", "repository"],
  requiredControls: ["Authorize with GitHub", "Continue to harness selection"],
  rules: ["continue-disabled-until-authorized", "secrets-redacted"],
};

describe("intent evaluator", () => {
  it("passes when required heading, text, and controls are present", () => {
    const result = evaluateSnapshotIntent(sourceContract, {
      heading: "Source",
      text: "Connect GitHub repository authorization",
      controls: [
        { text: "Authorize with GitHub", visible: true, disabled: false },
        { title: "Continue to harness selection", visible: true, disabled: true },
      ],
    });

    assert.equal(result.status, "passed");
  });

  it("fails when a required control is missing", () => {
    const result = evaluateSnapshotIntent(sourceContract, {
      heading: "Source",
      text: "Connect GitHub repository authorization",
      controls: [{ text: "Authorize with GitHub", visible: true, disabled: false }],
    });

    assert.equal(result.status, "failed");
    assert.ok(result.assertions.some((assertion) => assertion.name === "required control: Continue to harness selection"));
  });

  it("passes source blocking while continue is disabled before authorization", () => {
    const result = evaluateSnapshotIntent(sourceContract, {
      heading: "Source",
      text: "GitHub repository authorization is required",
      controls: [
        { text: "Authorize with GitHub", visible: true, disabled: false },
        { title: "Continue to harness selection", visible: true, disabled: true },
      ],
    });

    assert.equal(
      result.assertions.find((assertion) => assertion.name === "continue-disabled-until-authorized")?.status,
      "passed",
    );
  });

  it("fails secret redaction when raw token-like material appears", () => {
    const result = evaluateSnapshotIntent(sourceContract, {
      heading: "Source",
      text: "GitHub repository github_pat_NOT_REDACTED_VALUE",
      controls: [
        { text: "Authorize with GitHub", visible: true, disabled: false },
        { title: "Continue to harness selection", visible: true, disabled: true },
      ],
    });

    assert.equal(result.status, "failed");
    assert.equal(result.assertions.find((assertion) => assertion.name === "secrets-redacted")?.status, "failed");
  });
});
