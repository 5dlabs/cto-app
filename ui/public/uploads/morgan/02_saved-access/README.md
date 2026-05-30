# Saved access conditional Morgan media

Source contracts for conditional P-Video/P-Avatar clips under `ui/public/uploads/morgan/02_saved-access/`.

## 1Password conditionals

- `onepassword-ready.mp3/.mp4`
- `onepassword-missing-desktop.mp3/.mp4`
- `onepassword-sdk-auth-needed.mp3/.mp4`
- `onepassword-desktop-integration.mp3/.mp4`
- `onepassword-needs-access.mp3/.mp4`
- `onepassword-no-account.mp3/.mp4`

Scenario job details are written to `saved-access-condition-videos-ledger.json`. The generator can import legacy 1Password entries from `onepassword-condition-videos-ledger.json`.

## Bitwarden conditionals

Bitwarden Secrets Manager is an equal Saved Access peer. Detection and preview use SDK/REST metadata paths first; approved reads require explicit user approval and never ask for a master password.

- `bitwarden-detected.mp3/.mp4` — Bitwarden Secrets Manager can be offered as a Saved Access peer.
- `bitwarden-locked.mp3/.mp4` — SDK auth is not ready; user can provide Secrets Manager access or continue with manual paste.
- `bitwarden-unlocked.mp3/.mp4` — SDK auth is ready; preview/apply remain approval-gated.

## Scripts

Generate narration with the approved Morgan ElevenLabs voice (`iP95p4xoKVk53GoZ742B`) and generate P-Video/P-Avatar conditionals through Scenario:

```bash
node scripts/generate-morgan-conditional-mp3s.mjs --saved-access-only --force
node scripts/generate-morgan-saved-access-condition-videos.mjs --provider onepassword --force
node scripts/generate-morgan-saved-access-condition-videos.mjs --provider bitwarden --force
```

For long Scenario queues, split submit/wait:

```bash
node scripts/generate-morgan-saved-access-condition-videos.mjs --provider bitwarden --submit-only
node scripts/generate-morgan-saved-access-condition-videos.mjs --provider bitwarden --wait-only
```

Do not run Scenario generation during normal source-contract tests; parent orchestration owns long media generation.
