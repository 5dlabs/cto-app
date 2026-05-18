# Cloudflare endpoint conditional Morgan media

Source contracts for Cloudflare conditional P-Video/P-Avatar clips under `ui/public/uploads/morgan/03_endpoint/`. These clips are optional branch media and must not block the main `03_endpoint/morgan.mp4` screen video.

## Conditional media keys

- `cloudflare-login.mp3/.mp4` — durable Cloudflare browser sign-in path.
- `cloudflare-saved-access.mp3/.mp4` — use approved Cloudflare access discovered through Saved access, currently 1Password quick-connect.
- `cloudflare-quick-tunnel.mp3/.mp4` — temporary Cloudflare tunnel walkthrough path.
- `cloudflare-local.mp3/.mp4` — local-only/no public webhook path.

## Scripts

Generate narration with the approved Morgan ElevenLabs voice (`iP95p4xoKVk53GoZ742B`) and generate P-Video/P-Avatar conditionals through Scenario:

```bash
node scripts/generate-morgan-conditional-mp3s.mjs --cloudflare-only --force
node scripts/generate-morgan-cloudflare-condition-videos.mjs --force
```

For long Scenario queues, split submit/wait:

```bash
node scripts/generate-morgan-cloudflare-condition-videos.mjs --submit-only
node scripts/generate-morgan-cloudflare-condition-videos.mjs --wait-only
```

Do not scrape browser sessions/cookies; use official Cloudflare flows or approved saved access only.
