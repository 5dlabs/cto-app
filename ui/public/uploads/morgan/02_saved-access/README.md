# Saved access conditional Morgan media

Source contracts for conditional P-Video/P-Avatar clips under `ui/public/uploads/morgan/02_saved-access/`.

## 1Password conditionals

- `onepassword-ready.mp3/.mp4`
- `onepassword-missing-desktop.mp3/.mp4`
- `onepassword-missing-cli.mp3/.mp4`
- `onepassword-desktop-integration.mp3/.mp4`
- `onepassword-needs-access.mp3/.mp4`
- `onepassword-no-account.mp3/.mp4`

Scenario job details are written to `saved-access-condition-videos-ledger.json`. The generator can import legacy 1Password entries from `onepassword-condition-videos-ledger.json`.

## Bitwarden conditionals

Bitwarden remains a secondary provider: reveal behind **More saved access options** or local `bw` CLI detection. Detection may run `bw --version` and `bw status`; preview/apply must not run `bw list items` or `bw get item` until explicit approval-gated contracts are implemented.

- `bitwarden-detected.mp3/.mp4` — local `bw` exists, secondary option is available.
- `bitwarden-locked.mp3/.mp4` — `bw status` is locked; user unlocks externally, Morgan never asks for a master password.
- `bitwarden-unlocked.mp3/.mp4` — `bw status` is unlocked; still secondary until preview/apply support is reviewed.

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
