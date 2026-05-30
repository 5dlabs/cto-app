# Secrets

Secrets now comes before Cloudflare so Morgan can check whether 1Password/OnePass or Bitwarden Secrets Manager is already ready before provider-specific credential work.

## User intent

Keep the screen icon-first and low-text. Do not describe or narrate the control count. Morgan should explain the actual setup flow:

1. Offer 1Password/OnePass and Bitwarden Secrets Manager as equal SDK-backed Secrets peers.
2. Use SDK-first metadata preview and approved reads through the Tauri/backend SDK bridge.
3. If provider auth is missing, guide the user through the provider-specific connect sheet without showing token env vars on the primary screen.
4. Once metadata can be read, discover candidate credentials with redacted previews only and require explicit approval before applying any Kubernetes Secret.
5. If the user does not want a secret manager here, allow continuing and collect provider credentials later through manual/provider-specific flows.

## Required controls

- `Use 1Password for secrets` — opens the 1Password readiness modal and runs `detect_secret_sources`.
- `Use Bitwarden for secrets` — equal first-view peer for Bitwarden Secrets Manager SDK auth.
- `Continue without a secret manager` — keeps provider-specific manual paths available later and advances to Cloudflare.

## Visual rules

- No visible explanatory heading/subtitle that repeats Morgan.
- Morgan narration should describe behavior directly and avoid counting obvious controls.
- Keep explanations in Morgan audio/captions, `aria-label`, `title`, or screen-reader-only copy.
- Use SDK-first metadata preview and approved reads through official SDK/REST auth flows by default.
- Do not scrape password-manager UI.
- Do not copy browser cookies or sessions.
- Do not ask for vault master passwords.
- Never persist raw secret values.
- Raw secret values may exist only in memory during the approved apply operation.
- Persist runtime values to Kubernetes Secrets plus Argo `valuesObject`; keep OpenBao as a future-compatible seam.

## Provider readiness contract

The detection API must distinguish these states:

- desktop missing
- SDK auth missing
- provider SDK auth missing
- desktop integration/account access unavailable
- account present but metadata read still blocked
- metadata read ready

The backend should probe with SDK/REST metadata-only calls; SDK metadata readiness gates preview/apply.

When 1Password app approval needs desktop integration, Morgan should open official 1Password SDK/app-integration guidance and explain that this is a one-time desktop setting.

Service accounts are not required for the local setup happy path. Use interactive desktop-app authentication first, then write only the approved credentials CTO needs into local Kubernetes Secrets.

## Conditional media keys

These condition branches are source-owned contracts for later Morgan P-Video/P-Avatar generation. Existing 1Password files use the `onepassword-*.mp3/.mp4` naming pattern in `ui/public/uploads/morgan/02_saved-access/`.

- `onepassword-ready.mp3/.mp4`
- `onepassword-missing-desktop.mp3/.mp4`
- `onepassword-sdk-auth-needed.mp3/.mp4`
- `onepassword-desktop-integration.mp3/.mp4`
- `onepassword-needs-access.mp3/.mp4`
- `onepassword-no-account.mp3/.mp4`
- `bitwarden-detected.mp3/.mp4` — Bitwarden Secrets Manager connection can be offered as an equal Secrets peer.
- `bitwarden-locked.mp3/.mp4` — Bitwarden Secrets Manager SDK auth is not ready; never ask for a master password.
- `bitwarden-unlocked.mp3/.mp4` — SDK auth and approval gate preview/apply.