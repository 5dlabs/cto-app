# Morgan Intent Test Mode

Intent Test Mode is the default autonomous validation path for CTO Desktop Morgan setup UI changes. It verifies product intent, data capture, enabled/disabled behavior, diagnostics, and reviewable visual artifacts without requiring a human to watch the desktop.

## When to use it

Use intent mode for every setup-flow UI or payload change. Raw screen recording is optional and only needed for motion, flicker, drag/drop, or OS-level interaction bugs. Model review should consume `report.md`, `manifest.json`, and selected SVG/HTML snapshots rather than a long raw video by default.

## Commands

```bash
npm run e2e:local-stack-intent
npm run e2e:local-stack-clean-slate -- --intent-test
```

The clean-slate command still exercises teardown and the real bootstrap path. If GitHub device-code OAuth is not completed, the intent report is marked blocked and preserves the checkpoints captured before the blocker.

## Artifact layout

```text
.local/e2e-intent-runs/<run-id>/
  manifest.json
  report.md
```

Snapshot SVG/HTML/JSON artifacts are still written through the shared DOM snapshot writer, and paths are referenced from the manifest/report.

## Acceptance standard

Intent mode is accepted when:

- every captured checkpoint passes its contract;
- missing later checkpoints are explained as environmental blockers, not silent skips;
- no raw secrets or device codes appear in artifacts;
- report includes visible controls, disabled/enabled state, selected values, and diagnostics where available;
- full clean-slate run still ends with Kubernetes smoke once GitHub auth is completed.

## Contract sources

Human-readable contracts live in:

```text
docs/intent/morgan-setup/
```

Machine-readable contracts live in:

```text
scripts/e2e/intent/morgan-setup.intent.json
```

The deterministic evaluator is:

```text
scripts/e2e/intent-evaluator.mjs
```
