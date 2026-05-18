#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";

const SAVED_ACCESS = {
  "onepassword-ready": "1Password is ready. I can look up saved access without showing secrets, then you can approve anything before CTO uses it.",
  "onepassword-missing-desktop": "I do not see the 1Password desktop app yet. Install and sign in to 1Password first, then I will check the command line again.",
  "onepassword-missing-cli": "The 1Password app is installed, but the op command line tool is missing. I’ll install the official CLI, then check access again.",
  "onepassword-desktop-integration": "It looks like you have the 1Password desktop app and the op CLI installed, but desktop app integration is not enabled yet. I opened the official 1Password CLI app-integration guide so you can turn it on, then I will check again.",
  "onepassword-needs-access": "The op command is present, but access is not ready. Unlock 1Password and enable command line integration in the desktop app settings.",
  "onepassword-no-account": "The app and CLI are installed, but I do not see a 1Password account connected to the CLI yet. Add or unlock an account, then I will check again.",
  "bitwarden-detected": "I found Bitwarden support locally. I’ll keep it secondary, and I will not ask for your master password or read vault items during setup.",
  "bitwarden-locked": "Bitwarden is installed, but the CLI session is locked or not signed in. Unlock it yourself with the official bw flow, or continue with manual paste.",
  "bitwarden-unlocked": "Bitwarden looks unlocked. I can treat it as available metadata, but I’ll still keep raw secret access behind explicit approval.",
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
