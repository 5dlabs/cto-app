# Cloudflare endpoint

Cloudflare now follows Secrets. This screen stays icon-first: Morgan explains which endpoint choice fits while the UI only shows the recognizable paths.

## User intent

Choose how Morgan gets a public endpoint for webhooks and app callbacks:

- Sign in with Cloudflare for a durable tunnel/domain path.
- Use approved Cloudflare access discovered from 1Password when available.
- Use a temporary Cloudflare tunnel for walkthroughs.

## Required controls

- `Sign in with Cloudflare`
- `Find Cloudflare access in 1Password`
- `Use a temporary Cloudflare tunnel`
- `Continue to Source`

## Guardrails

- No “skip real-time” copy on this screen.
- Keep visible explanatory text minimal; narration carries the why/how.
- Prefer official Cloudflare auth flows and saved approved access. Do not scrape browser sessions or cookies.

## Conditional media keys

Cloudflare conditionals are source-owned contracts for later Morgan media generation under `ui/public/uploads/morgan/03_endpoint/`. They should not block the main `03_endpoint/morgan.mp4` screen video.

- `cloudflare-login.mp3/.mp4` — durable Cloudflare browser sign-in path.
- `cloudflare-saved-access.mp3/.mp4` — use approved Cloudflare access discovered through Secrets, currently 1Password quick-connect.
- `cloudflare-quick-tunnel.mp3/.mp4` — temporary Cloudflare tunnel walkthrough path.
- `cloudflare-local.mp3/.mp4` — local-only/no public webhook path.
