# Saved access

Saved access now comes before Cloudflare so Morgan can check whether 1Password is already ready before provider-specific credential work.

## User intent

Keep the screen icon-first and low-text. Do not describe or narrate the control count. Morgan should explain the actual setup flow:

1. Try to read safe 1Password metadata through the CLI.
2. If the desktop app is missing, guide the user to install/sign in.
3. If the `op` CLI is missing, install it where possible, then retry metadata read.
4. If the CLI reports desktop integration/account access is not enabled, open the official 1Password app-integration instructions in the browser and wait for the user to enable it in the desktop app.
5. Once vault metadata can be read, discover candidate credentials with redacted previews only and require explicit approval before applying any Kubernetes/OpenBao secret.
6. If the user does not want to use 1Password here, allow continuing and collect provider credentials later through manual/provider-specific flows.

## Required controls

- `Use 1Password saved access` — opens the 1Password readiness modal and runs `detect_secret_sources`.
- `More saved access options` — reveals secondary providers without promoting them to first view.
- `Bitwarden saved access` — secondary-only: visible after **More saved access options** or local `bw` CLI detection; opens official Bitwarden CLI docs and does not run item/list/get commands here.
- `Continue without saved access` — keeps provider-specific manual paths available later.
- `Continue to Cloudflare` — enabled after the user continues or after saved access is ready/skipped.

## Visual rules

- No visible explanatory heading/subtitle that repeats Morgan.
- Morgan narration should describe behavior directly and avoid counting obvious controls.
- Keep explanations in Morgan audio/captions, `aria-label`, `title`, or screen-reader-only copy.
- Use official auth/CLI/API flows only.
- Do not scrape password-manager UI.
- Do not copy browser cookies or sessions.
- Do not ask for vault master passwords.
- Never persist raw secret values.
- Raw secret values may exist only in memory during the approved apply operation.

## 1Password readiness contract

The detection API must distinguish these states:

- desktop missing
- CLI missing
- CLI installed but desktop integration/account access unavailable
- account present but metadata read still blocked
- metadata read ready

The backend should probe with `op vault list --format json` or an equivalent safe metadata-only call, not `op --version` alone. `op --version` only proves the binary exists.

When the CLI returns the official “No accounts configured for use with 1Password CLI” / “Turn on the 1Password desktop app integration” message, Morgan should open `https://developer.1password.com/docs/cli/app-integration/` and explain that this is a one-time desktop setting.

Service accounts are not required for the local setup happy path. Use interactive desktop-app authentication first, then write only the approved credentials CTO needs into local Kubernetes/OpenBao secrets.

## Conditional media keys

These condition branches are source-owned contracts for later Morgan P-Video/P-Avatar generation. Existing 1Password files use the `onepassword-*.mp3/.mp4` naming pattern in `ui/public/uploads/morgan/02_saved-access/`.

- `onepassword-ready.mp3/.mp4`
- `onepassword-missing-desktop.mp3/.mp4`
- `onepassword-missing-cli.mp3/.mp4`
- `onepassword-desktop-integration.mp3/.mp4`
- `onepassword-needs-access.mp3/.mp4`
- `onepassword-no-account.mp3/.mp4`
- `bitwarden-detected.mp3/.mp4` — local `bw` is present, but Bitwarden remains secondary behind More options.
- `bitwarden-locked.mp3/.mp4` — local `bw status` is `locked`; ask the user to unlock outside CTO, never for a master password.
- `bitwarden-unlocked.mp3/.mp4` — local `bw status` is `unlocked`; keep preview/apply behind explicit future approval tests before it can become quick connect.