#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";

const SAVED_ACCESS = {
  "onepassword-ready": "1Password is ready. I can look up saved access without showing secrets, then you can approve anything before CTO uses it.",
  "onepassword-missing-desktop": "I do not see the 1Password desktop app yet. Install and sign in to 1Password first, then I will check SDK access again.",
  "onepassword-sdk-auth-needed": "1Password SDK access is not ready yet. Use app approval, choose an account, or paste a service account token, then I will check access again.",
  "onepassword-desktop-integration": "It looks like 1Password desktop app integration is not enabled yet. I opened the official 1Password SDK and app-integration guidance so you can turn it on, then I will check again.",
  "onepassword-needs-access": "1Password access is not ready. Open and unlock 1Password, approve the app prompt, or use a service account token.",
  "onepassword-no-account": "I do not see a 1Password account available for app approval yet. Add or unlock an account, then I will check again.",
  "bitwarden-detected": "Bitwarden Secrets Manager support is available. I will not ask for your master password or read secret values during setup.",
  "bitwarden-locked": "Bitwarden Secrets Manager SDK auth is not ready yet. Add a Secrets Manager access token when you are ready, or continue with manual paste.",
  "bitwarden-unlocked": "Bitwarden Secrets Manager SDK auth is ready. I can preview metadata, but I will still wait for explicit approval before reading or mapping any secret values.",
};

const CLOUDFLARE = {
  "cloudflare-login": "Cloudflare browser sign-in selected. I’ll use it for Morgan’s durable public endpoint.",
  "cloudflare-saved-access": "I’ll check saved access for approved Cloudflare credentials before Source.",
  "cloudflare-quick-tunnel": "Temporary Cloudflare tunnel selected. Good for a live walkthrough.",
  "cloudflare-local": "Local-only selected. We can continue without public webhooks for now.",
};

function escapeVtt(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cue(text) {
  const duration = Math.max(4, Math.min(18, Math.ceil(text.length / 18)));
  return `WEBVTT\n\n00:00:00.000 --> 00:00:${String(duration).padStart(2, "0")}.000\n${escapeVtt(text)}\n`;
}

for (const [key, text] of Object.entries(SAVED_ACCESS)) {
  await writeFile(path.join("ui/public/uploads/morgan/02_saved-access", `${key}.vtt`), cue(text));
  await writeFile(path.join("ui/public/uploads/morgan/02_saved-access", `${key}.md`), `${text}\n`);
}
for (const [key, text] of Object.entries(CLOUDFLARE)) {
  await writeFile(path.join("ui/public/uploads/morgan/03_endpoint", `${key}.vtt`), cue(text));
  await writeFile(path.join("ui/public/uploads/morgan/03_endpoint", `${key}.md`), `${text}\n`);
}
console.log(`wrote ${Object.keys(SAVED_ACCESS).length + Object.keys(CLOUDFLARE).length} conditional transcript pairs`);
