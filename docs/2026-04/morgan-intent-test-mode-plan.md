# Morgan Setup Intent Test Mode Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add an intent-driven UI/E2E test mode for CTO Desktop Morgan setup that verifies the right inputs carry the right data, the flow advances correctly, and the UI matches public expectations without a human watching the desktop.

**Architecture:** Treat each setup screen as an intent contract: a public markdown description of what the screen is supposed to communicate, collect, validate, and enable. The E2E runner captures redacted DOM snapshots plus structured intent facts, evaluates them against those contracts, writes a machine-readable manifest, and optionally renders replay artifacts for model/human review. Raw video becomes optional evidence, not the primary acceptance signal.

**Tech Stack:** Node ESM E2E scripts, Tauri MCP DOM execution, React setup wizard, markdown/YAML intent specs, Node test runner, existing `.local/e2e-snapshots` artifact path.

---

## Target Design

Intent test mode should create this artifact set on every run:

```text
.local/e2e-intent-runs/<run-id>/
  manifest.json
  report.md
  snapshots/
    00-setup-gate-before.json
    00-setup-gate-before.html
    00-setup-gate-before.svg
    ...
```

Each manifest checkpoint should include:

```json
{
  "label": "04-source-configured",
  "screen": "source",
  "capturedAt": "2026-04-30T00:00:00.000Z",
  "intent": {
    "screenTitle": "Source",
    "expectedInputs": ["owner", "repository"],
    "expectedActions": ["Authorize with GitHub", "Continue to harness selection"],
    "requiredVisibleText": ["GitHub", "repository"],
    "acceptance": [
      "owner is populated from token or user/org selection",
      "repository is populated with the GitOps repo name",
      "continue remains disabled until source authorization is complete"
    ]
  },
  "observed": {
    "heading": "Source",
    "inputs": [],
    "buttons": [],
    "selectedValues": {},
    "enabledActions": []
  },
  "assertions": [
    { "name": "screen heading", "status": "passed" },
    { "name": "continue disabled before auth", "status": "passed" }
  ],
  "diagnostics": {
    "errors": [],
    "warnings": [],
    "network": []
  }
}
```

Intent specs should be public product docs, colocated with E2E contracts:

```text
docs/intent/morgan-setup/source.md
scripts/e2e/intent/morgan-setup/source.intent.json
```

The markdown is the human-readable/public description. The JSON is the strict test contract generated from or kept beside the markdown.

---

### Task 1: Create public intent docs for the setup flow

**Objective:** Document what each Morgan setup screen is supposed to do in a human-readable, public format.

**Files:**
- Create: `docs/intent/morgan-setup/README.md`
- Create: `docs/intent/morgan-setup/source.md`
- Create: `docs/intent/morgan-setup/harnesses.md`
- Create: `docs/intent/morgan-setup/acp-clis.md`
- Create: `docs/intent/morgan-setup/providers.md`
- Create: `docs/intent/morgan-setup/models.md`
- Create: `docs/intent/morgan-setup/harness-routing.md`
- Create: `docs/intent/morgan-setup/provider-auth.md`
- Create: `docs/intent/morgan-setup/tool-keys.md`
- Create: `docs/intent/morgan-setup/agent-tokens.md`

**Step 1: Write `README.md`**

Include the purpose:

```markdown
# Morgan Setup Intent Contracts

These documents describe the intended user-facing behavior of each CTO Desktop Morgan setup screen.
They are used by intent E2E tests to verify that the UI collects the right data, exposes the right controls, and advances through the setup flow without a human desktop observer.

Each screen document defines:

- Purpose
- Required visible language
- Inputs and defaults
- Required actions
- Blocking and validation behavior
- Data that must be present in the generated setup payload
- Visual expectations
```

**Step 2: Write one screen doc at a time**

Use this template for each screen:

```markdown
# Source Intent

## Purpose

Connect CTO Desktop to the Git source that will own local GitOps state.

## Required visible language

- GitHub
- repository
- authorization

## Inputs and defaults

- Owner/user or organization
- GitOps repository name
- Authorization state

## Required actions

- Authorize with GitHub when no token exists
- Continue to harness selection once source credentials are valid

## Blocking behavior

- Continue must remain disabled until the app has valid source-control credentials.
- Device-code values must not be persisted in artifacts.

## Setup payload expectations

- Source provider is `github`.
- Owner is populated.
- Repository is populated.
- Credential material is stored outside Git and redacted from artifacts.

## Visual expectations

- The screen clearly communicates that GitHub authorization is required.
- Disabled actions are visibly disabled and remain accessible by title or aria-label.
```

**Step 3: Verify docs exist**

Run:

```bash
test -f docs/intent/morgan-setup/README.md && test -f docs/intent/morgan-setup/source.md
```

Expected: exit code 0.

---

### Task 2: Add machine-readable intent contracts

**Objective:** Add strict JSON contracts the E2E runner can evaluate without relying on an LLM for pass/fail.

**Files:**
- Create: `scripts/e2e/intent/morgan-setup.intent.json`
- Create: `scripts/e2e/intent/morgan-setup-intent.test.mjs`

**Step 1: Create the contract JSON**

Create `scripts/e2e/intent/morgan-setup.intent.json`:

```json
{
  "name": "morgan-setup",
  "version": 1,
  "screens": [
    {
      "id": "source",
      "checkpoint": "04-source-configured",
      "heading": "Source",
      "requiredText": ["GitHub", "repository"],
      "requiredControls": ["Authorize with GitHub", "Continue to harness selection"],
      "inputs": ["owner", "repository"],
      "payloadPaths": ["source.provider", "source.owner", "source.repository"],
      "rules": [
        "continue-disabled-until-authorized",
        "secrets-redacted"
      ]
    },
    {
      "id": "harnesses",
      "checkpoint": "10-harnesses",
      "heading": "Harnesses",
      "requiredText": ["Hermes"],
      "requiredControls": ["Hermes", "Continue to ACP CLIs"],
      "inputs": ["harness"],
      "payloadPaths": ["harness"],
      "rules": ["selected-harness-visible"]
    },
    {
      "id": "acp-clis",
      "checkpoint": "20-acp-clis",
      "heading": "ACP CLIs",
      "requiredText": ["Copilot"],
      "requiredControls": ["Copilot", "Continue to providers"],
      "inputs": ["cli"],
      "payloadPaths": ["clis"],
      "rules": ["selected-cli-visible"]
    },
    {
      "id": "providers",
      "checkpoint": "30-providers",
      "heading": "Providers",
      "requiredText": ["GitHub Copilot"],
      "requiredControls": ["GitHub Copilot", "Configure provider authentication"],
      "inputs": ["provider"],
      "payloadPaths": ["providers"],
      "rules": ["selected-provider-visible"]
    },
    {
      "id": "models",
      "checkpoint": "40-models",
      "heading": "Models",
      "requiredText": ["model"],
      "requiredControls": ["Choose harness routing"],
      "inputs": ["model"],
      "payloadPaths": ["models"],
      "rules": ["default-model-visible"]
    },
    {
      "id": "harness-routing",
      "checkpoint": "50-harness-routing",
      "heading": "Harness routing",
      "requiredText": ["routing"],
      "requiredControls": ["Configure provider authentication"],
      "inputs": ["routing"],
      "payloadPaths": ["routing"],
      "rules": ["routing-visible"]
    },
    {
      "id": "provider-auth",
      "checkpoint": "60-provider-auth",
      "heading": "Provider auth",
      "requiredText": ["authentication"],
      "requiredControls": ["Configure tool API keys"],
      "inputs": ["providerAuth"],
      "payloadPaths": ["providerAuth"],
      "rules": ["secrets-redacted"]
    },
    {
      "id": "tool-keys",
      "checkpoint": "70-tool-keys",
      "heading": "Tool keys",
      "requiredText": ["API keys"],
      "requiredControls": ["Configure agent Discord tokens"],
      "inputs": ["toolKeys"],
      "payloadPaths": ["toolKeys"],
      "rules": ["optional-secrets-redacted"]
    },
    {
      "id": "agent-tokens",
      "checkpoint": "80-agent-tokens",
      "heading": "Agent tokens",
      "requiredText": ["Discord", "Start"],
      "requiredControls": ["Start"],
      "inputs": ["agentTokens"],
      "payloadPaths": ["agentTokens"],
      "rules": ["start-enabled-when-required-inputs-valid"]
    }
  ]
}
```

**Step 2: Add a contract-shape test**

Create `scripts/e2e/intent/morgan-setup-intent.test.mjs` that loads the JSON and asserts:

- every screen has `id`, `checkpoint`, `heading`, `requiredText`, `requiredControls`, `payloadPaths`, and `rules`;
- checkpoints are unique;
- the expected screen ids are present in setup order.

**Step 3: Run the test**

```bash
node --test scripts/e2e/intent/morgan-setup-intent.test.mjs
```

Expected: pass.

---

### Task 3: Extend DOM snapshots with structured UI facts

**Objective:** Capture enough structure to verify input values, selected choices, disabled states, and visual affordances without raw video.

**Files:**
- Modify: `scripts/e2e/local-stack-cycle.mjs`
- Modify: `scripts/e2e/dom-snapshot-artifact.mjs`
- Modify: `scripts/e2e/local-stack-cycle.test.mjs`

**Step 1: Capture selected choices and form metadata**

Update `captureDomSnapshot()` in `scripts/e2e/local-stack-cycle.mjs` to include:

```js
selected: Array.from(document.querySelectorAll('[aria-pressed="true"], [aria-selected="true"], input:checked')).map((element) => ({
  text: (element.textContent || element.getAttribute('aria-label') || '').trim(),
  name: element.getAttribute('name') || '',
  value: element.value || element.getAttribute('value') || '',
  testId: element.getAttribute('data-testid') || '',
})),
controls: Array.from(document.querySelectorAll('button, input, textarea, select, [role="button"], [role="option"], [role="radio"], [role="checkbox"]')).map((element) => ({
  tag: element.tagName.toLowerCase(),
  role: element.getAttribute('role') || '',
  text: (element.textContent || '').trim(),
  aria: element.getAttribute('aria-label') || '',
  title: element.getAttribute('title') || '',
  testId: element.getAttribute('data-testid') || '',
  name: element.getAttribute('name') || '',
  value: 'value' in element ? element.value || '' : element.getAttribute('value') || '',
  disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
  visible: element.getClientRects().length > 0,
}))
```

**Step 2: Redact the new fields**

Update `sanitizeSnapshot()` in `dom-snapshot-artifact.mjs` to redact `selected` and `controls` values using the existing redaction logic and secret-name checks.

**Step 3: Add test coverage**

Extend `local-stack-cycle.test.mjs` to assert the runner captures:

- `selected`
- `controls`
- `data-testid`
- `aria-disabled`

**Step 4: Run checks**

```bash
node --test scripts/e2e/local-stack-cycle.test.mjs
node --check scripts/e2e/local-stack-cycle.mjs scripts/e2e/dom-snapshot-artifact.mjs
```

Expected: pass.

---

### Task 4: Add an intent evaluator

**Objective:** Evaluate snapshots against the intent contracts and produce deterministic pass/fail results.

**Files:**
- Create: `scripts/e2e/intent-evaluator.mjs`
- Create: `scripts/e2e/intent-evaluator.test.mjs`

**Step 1: Implement evaluator exports**

Create `scripts/e2e/intent-evaluator.mjs` with:

```js
export function evaluateSnapshotIntent(contractScreen, snapshot) {
  const assertions = [];
  const text = `${snapshot.heading || ''}\n${snapshot.text || ''}`;
  const controls = [...(snapshot.buttons ?? []), ...(snapshot.controls ?? [])].filter((control) => control.visible !== false);
  const controlText = controls.map((control) => [control.text, control.title, control.aria, control.testId].filter(Boolean).join(' ')).join('\n');

  assertions.push(assertion('heading', matches(text, contractScreen.heading)));
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
    status: assertions.every((item) => item.status === 'passed') ? 'passed' : 'failed',
    assertions,
  };
}

function evaluateRule(rule, snapshot, controls) {
  if (rule === 'secrets-redacted' || rule === 'optional-secrets-redacted') {
    return assertion(rule, !containsSecretMaterial(JSON.stringify(snapshot)));
  }
  if (rule === 'continue-disabled-until-authorized') {
    const continueControl = controls.find((control) => /Continue to harness selection/i.test(`${control.text} ${control.title} ${control.aria}`));
    const authorized = /GitHub OAuth connected|GitHub credentials are already configured|Select the user or org/i.test(snapshot.text || '');
    return assertion(rule, authorized || Boolean(continueControl?.disabled));
  }
  if (rule === 'start-enabled-when-required-inputs-valid') {
    const start = controls.find((control) => /^Start$/i.test(`${control.text || control.title || control.aria}`.trim()));
    return assertion(rule, Boolean(start && !start.disabled));
  }
  return assertion(rule, true, 'rule currently informational');
}

function assertion(name, passed, note = '') {
  return { name, status: passed ? 'passed' : 'failed', ...(note ? { note } : {}) };
}

function matches(haystack, needle) {
  return new RegExp(escapeRegExp(String(needle)), 'i').test(String(haystack));
}

function containsSecretMaterial(value) {
  return /github_pat_|gh[pousr]_[A-Za-z0-9_]+|\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/.test(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

**Step 2: Add evaluator tests**

Test these cases:

- passes when required heading/text/control are present;
- fails when a required control is missing;
- passes `continue-disabled-until-authorized` when continue is disabled;
- fails `secrets-redacted` when raw token-like text appears.

**Step 3: Run tests**

```bash
node --test scripts/e2e/intent-evaluator.test.mjs
```

Expected: pass.

---

### Task 5: Wire `--intent-test` into the local stack runner

**Objective:** Allow `npm run e2e:local-stack-cycle -- --intent-test` and clean-slate runs to produce intent reports.

**Files:**
- Modify: `scripts/e2e/local-stack-cycle.mjs`
- Modify: `package.json`
- Modify: `scripts/e2e/local-stack-cycle.test.mjs`

**Step 1: Add CLI flag and npm script**

In `local-stack-cycle.mjs`:

```js
const withIntentTest = args.has('--intent-test') || process.env.CTO_E2E_INTENT_TEST === '1';
```

In `package.json` scripts:

```json
"e2e:local-stack-intent": "CTO_E2E_INTENT_TEST=1 node scripts/e2e/local-stack-cycle.mjs --reset"
```

**Step 2: Load the intent contract when enabled**

Import the JSON contract and evaluator. If `withIntentTest` is true, evaluate each snapshot whose label matches a contract checkpoint.

**Step 3: Persist `manifest.json` and `report.md`**

At the end of the run, or in a `finally` block if the flow fails, write:

- `.local/e2e-intent-runs/<timestamp>/manifest.json`
- `.local/e2e-intent-runs/<timestamp>/report.md`

The report should summarize:

- run status;
- completed checkpoints;
- failed assertions;
- browser diagnostics;
- artifact paths;
- blocker, if any.

**Step 4: Fail only on deterministic contract failures**

Do not fail just because a later checkpoint is missing after an environmental blocker like GitHub OAuth timeout. Report it as `blocked`. Fail when a checkpoint was captured but violated its screen contract.

**Step 5: Add test coverage**

Extend `local-stack-cycle.test.mjs` to assert source contains:

- `--intent-test`
- `CTO_E2E_INTENT_TEST`
- `manifest.json`
- `report.md`
- `evaluateSnapshotIntent`

**Step 6: Run checks**

```bash
node --test scripts/e2e/local-stack-cycle.test.mjs scripts/e2e/intent-evaluator.test.mjs scripts/e2e/intent/morgan-setup-intent.test.mjs
node --check scripts/e2e/local-stack-cycle.mjs scripts/e2e/intent-evaluator.mjs
```

Expected: pass.

---

### Task 6: Add periodic snapshots during waits

**Objective:** Capture state frequently enough that long waits, OAuth prompts, and bootstrap progress can be debugged without a human watching.

**Files:**
- Modify: `scripts/e2e/local-stack-cycle.mjs`
- Modify: `scripts/e2e/local-stack-cycle.test.mjs`

**Step 1: Add a wait-with-snapshots helper**

Create a helper:

```js
async function waitForTextWithSnapshots(pattern, timeoutMs, labelPrefix, intervalMs = Number(process.env.CTO_E2E_SNAPSHOT_INTERVAL_MS ?? '2000')) {
  const started = Date.now();
  let index = 0;
  while (Date.now() - started < timeoutMs) {
    const text = await pageText().catch(() => '');
    if (pattern.test(text)) return text;
    if (Date.now() - started >= index * intervalMs) {
      await captureDomSnapshot(`${labelPrefix}-${String(index).padStart(3, '0')}`);
      index += 1;
    }
    await delay(250);
  }
  await captureDomSnapshot(`${labelPrefix}-timeout`);
  throw new Error(`Timed out waiting for ${pattern}`);
}
```

**Step 2: Use it for long waits**

Use this helper for:

- OAuth/device-code wait;
- bootstrap finish wait;
- any setup transition wait over 10 seconds.

**Step 3: Run checks**

```bash
node --test scripts/e2e/local-stack-cycle.test.mjs
node --check scripts/e2e/local-stack-cycle.mjs
```

Expected: pass.

---

### Task 7: Add optional replay rendering from snapshots

**Objective:** Produce a human-watchable artifact from deterministic snapshots without OS screen recording.

**Files:**
- Create: `scripts/e2e/render-intent-replay.mjs`
- Modify: `package.json`
- Create: `scripts/e2e/render-intent-replay.test.mjs`

**Step 1: Implement the renderer**

The script should:

- accept a run directory, defaulting to the latest `.local/e2e-intent-runs/*`;
- read `manifest.json`;
- collect SVG snapshots in manifest order;
- use `ffmpeg` if available to create `replay.mp4`;
- if `ffmpeg` is unavailable, create `replay.html` that displays snapshots as a timed slideshow;
- never fail the E2E if replay rendering is unavailable.

**Step 2: Add npm script**

```json
"e2e:render-intent-replay": "node scripts/e2e/render-intent-replay.mjs"
```

**Step 3: Add tests**

Test that the renderer can discover SVG paths from a synthetic manifest and produce a replay HTML fallback.

**Step 4: Run checks**

```bash
node --test scripts/e2e/render-intent-replay.test.mjs
node --check scripts/e2e/render-intent-replay.mjs
```

Expected: pass.

---

### Task 8: Document the workflow and acceptance standard

**Objective:** Make intent test mode the default autonomous debugging workflow for Morgan setup.

**Files:**
- Create or modify: `docs/2026-04/morgan-intent-test-mode.md`
- Modify: `docs/handoff-local-stack-setup.md`

**Step 1: Document when to use it**

State:

- use intent test mode for every setup-flow UI change;
- raw screen recording is optional and only needed for motion/flicker/OS-level interaction bugs;
- model review should consume `report.md`, `manifest.json`, and selected SVGs, not a long raw video by default.

**Step 2: Add commands**

Include:

```bash
npm run e2e:local-stack-intent
npm run e2e:local-stack-clean-slate -- --intent-test
npm run e2e:render-intent-replay
```

**Step 3: Add acceptance criteria**

Intent mode is accepted when:

- every captured checkpoint passes its contract;
- missing later checkpoints are explained as environmental blockers, not silent skips;
- no raw secrets or device codes appear in artifacts;
- report includes visible controls, disabled/enabled state, selected values, and diagnostics;
- full clean-slate run still ends with Kubernetes smoke when GitHub auth is completed.

---

## Recommendation

Yes, this should be called **intent test mode**.

The name fits because the tests should verify product intent, not pixel-perfect implementation details:

- “What is this screen supposed to ask for?”
- “What data should the user’s input produce?”
- “What should be disabled until prerequisites are met?”
- “What should the user visibly understand at this point?”
- “Did the flow advance through the intended route?”

This should sit beside normal E2E tests, not replace them:

- Unit tests: logic correctness.
- E2E tests: actual app flow works.
- Intent tests: UI meaning, data capture, enabled/disabled behavior, and reviewable evidence.
- Optional replay/video: human/model-friendly playback generated from deterministic snapshots.
