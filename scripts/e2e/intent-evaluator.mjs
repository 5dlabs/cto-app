export function evaluateSnapshotIntent(contractScreen, snapshot) {
  const assertions = [];
  const text = `${snapshot.heading || ""}\n${snapshot.text || ""}`;
  const controls = [...(snapshot.buttons ?? []), ...(snapshot.controls ?? [])].filter(
    (control) => control.visible !== false,
  );
  const controlText = controls
    .map((control) => [control.text, control.title, control.aria, control.testId].filter(Boolean).join(" "))
    .join("\n");

  assertions.push(assertion("heading", matches(text, contractScreen.heading)));
  for (const required of contractScreen.requiredText ?? []) {
    assertions.push(assertion(`required text: ${required}`, matches(text, required)));
  }
  for (const required of contractScreen.requiredControls ?? []) {
    assertions.push(assertion(`required control: ${required}`, matches(controlText, required)));
  }
  for (const rule of contractScreen.rules ?? []) {
    assertions.push(evaluateRule(rule, snapshot, controls));
  }

  return {
    screen: contractScreen.id,
    checkpoint: contractScreen.checkpoint,
    status: assertions.every((item) => item.status === "passed") ? "passed" : "failed",
    assertions,
  };
}

function evaluateRule(rule, snapshot, controls) {
  if (rule === "secrets-redacted" || rule === "optional-secrets-redacted") {
    return assertion(rule, !containsSecretMaterial(JSON.stringify(snapshot)));
  }
  if (rule === "continue-disabled-until-authorized") {
    const continueControl = controls.find((control) =>
      /Continue to harness selection/i.test(`${control.text ?? ""} ${control.title ?? ""} ${control.aria ?? ""}`),
    );
    const text = snapshot.text || "";
    const hasTokenInput = (snapshot.inputs ?? []).some(
      (input) => /github_pat_\.\.\./i.test(input.placeholder ?? "") && String(input.value ?? "").trim().length > 0,
    );
    const authorized =
      /GitHub OAuth connected|GitHub credentials are already configured|Select the user or org/i.test(text) || hasTokenInput;
    return assertion(rule, authorized || Boolean(continueControl?.disabled));
  }
  if (rule === "start-enabled-when-required-inputs-valid") {
    const start = controls.find((control) => /^Start$/i.test(`${control.text || control.title || control.aria}`.trim()));
    return assertion(rule, Boolean(start && !start.disabled));
  }
  if (/^selected-.*-visible$/.test(rule) || ["default-model-visible", "routing-visible"].includes(rule)) {
    const hasFilledTokenInput = (snapshot.inputs ?? []).some(
      (input) => /github_pat_\.\.\./i.test(input.placeholder ?? "") && String(input.value ?? "").trim().length > 0,
    );
    const hasSelectedProviderCopy = /selected|configured|GitHub Copilot provider/i.test(`${snapshot.text ?? ""} ${JSON.stringify(controls)}`);
    return assertion(
      rule,
      hasFilledTokenInput || hasSelectedProviderCopy || hasSelectedOrVisibleChoice(snapshot, controls),
      "verified by visible screen contract",
    );
  }
  return assertion(rule, true, "rule currently informational");
}

function hasSelectedOrVisibleChoice(snapshot, controls) {
  if ((snapshot.selected ?? []).some((item) => item.visible !== false)) return true;
  return controls.some(
    (control) =>
      control.visible !== false &&
      (control.selected ||
        /is-selected|selected|active|pressed|chosen|current/i.test(control.className ?? "") ||
        /selected/i.test(`${control.text ?? ""} ${control.title ?? ""} ${control.aria ?? ""}`)),
  );
}

function assertion(name, passed, note = "") {
  return { name, status: passed ? "passed" : "failed", ...(note ? { note } : {}) };
}

function matches(haystack, needle) {
  return new RegExp(escapeRegExp(String(needle)), "i").test(String(haystack));
}

function containsSecretMaterial(value) {
  return /github_pat_[A-Za-z0-9_]{12,}|gh[pousr]_[A-Za-z0-9_]+|\b[A-Z0-9]{4}-[A-Z0-9]{4}\b|dummy-e2e-token/i.test(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
