#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();

const SAVED_ACCESS_DIR = "ui/public/uploads/morgan/02_saved-access";
const CLOUDFLARE_DIR = "ui/public/uploads/morgan/03_endpoint";
const MORGAN_VOICE_ID = process.env.MORGAN_VOICE_ID || "iP95p4xoKVk53GoZ742B";

const CUES = {
  "onepassword-ready": {
    dir: SAVED_ACCESS_DIR,
    text: "1Password is ready. I can look up saved access without showing secrets, then you can approve anything before CTO uses it.",
  },
  "onepassword-missing-desktop": {
    dir: SAVED_ACCESS_DIR,
    text: "I do not see the 1Password desktop app yet. Install and sign in to 1Password first, then I will check SDK access again.",
  },
  "onepassword-sdk-auth-needed": {
    dir: SAVED_ACCESS_DIR,
    text: "1Password SDK access is not ready yet. Use app approval, choose an account, or paste a service account token, then I will check access again.",
  },
  "onepassword-desktop-integration": {
    dir: SAVED_ACCESS_DIR,
    text: "It looks like 1Password desktop app integration is not enabled yet. I opened the official 1Password SDK and app-integration guidance so you can turn it on, then I will check again.",
  },
  "onepassword-needs-access": {
    dir: SAVED_ACCESS_DIR,
    text: "1Password access is not ready. Open and unlock 1Password, approve the app prompt, or use a service account token.",
  },
  "onepassword-no-account": {
    dir: SAVED_ACCESS_DIR,
    text: "I do not see a 1Password account available for app approval yet. Add or unlock an account, then I will check again.",
  },
  "bitwarden-detected": {
    dir: SAVED_ACCESS_DIR,
    text: "Bitwarden Secrets Manager support is available. I will not ask for your master password or read secret values during setup.",
  },
  "bitwarden-locked": {
    dir: SAVED_ACCESS_DIR,
    text: "Bitwarden Secrets Manager SDK auth is not ready yet. Add a Secrets Manager access token when you are ready, or continue with manual paste.",
  },
  "bitwarden-unlocked": {
    dir: SAVED_ACCESS_DIR,
    text: "Bitwarden Secrets Manager SDK auth is ready. I can preview metadata, but I will still wait for explicit approval before reading or mapping any secret values.",
  },
  "cloudflare-login": {
    dir: CLOUDFLARE_DIR,
    text: "Cloudflare sign-in is the durable path for public webhooks and callbacks. I will open the official browser flow and keep CTO from handling raw Cloudflare credentials directly.",
  },
  "cloudflare-saved-access": {
    dir: CLOUDFLARE_DIR,
    text: "I can look for approved Cloudflare access from Saved access before asking you to sign in. You will still review anything sensitive before CTO uses it.",
  },
  "cloudflare-quick-tunnel": {
    dir: CLOUDFLARE_DIR,
    text: "A temporary Cloudflare tunnel is good for a live walkthrough. It gives Morgan a public callback path quickly, without pretending it is the long-term production endpoint.",
  },
  "cloudflare-local": {
    dir: CLOUDFLARE_DIR,
    text: "Local-only mode keeps setup moving without public webhooks. You can connect Cloudflare later when you want durable callbacks from source providers.",
  },
};

function parseArgs(argv) {
  const options = { cues: Object.keys(CUES), force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--cues" && next) {
      options.cues = next.split(",").map((value) => value.trim()).filter(Boolean);
      index += 1;
    } else if (arg === "--saved-access-only") {
      options.cues = Object.keys(CUES).filter((key) => CUES[key].dir === SAVED_ACCESS_DIR);
    } else if (arg === "--cloudflare-only") {
      options.cues = Object.keys(CUES).filter((key) => CUES[key].dir === CLOUDFLARE_DIR);
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Generate Morgan conditional MP3s with ElevenLabs voice ${MORGAN_VOICE_ID}.\n\nOptions:\n  --cues <list>          Comma-separated cue keys\n  --saved-access-only    Generate Saved access cues only\n  --cloudflare-only      Generate Cloudflare cues only\n  --force                Overwrite existing MP3s\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  for (const cue of options.cues) {
    if (!CUES[cue]) throw new Error(`Unknown cue ${cue}. Known cues: ${Object.keys(CUES).join(", ")}`);
  }
  return options;
}

async function pathExists(filePath) {
  try {
    await import("node:fs/promises").then(({ stat }) => stat(filePath));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function generateWithElevenLabs(text) {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not set. Load ~/.hermes/.env or run from the voice-bridge pod.");
  }
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${MORGAN_VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.15,
        use_speaker_boost: true,
      },
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed ${response.status}: ${body.slice(0, 500)}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`ElevenLabs returned only ${bytes.length} bytes`);
  return bytes;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputs = [];
  for (const cue of options.cues) {
    const spec = CUES[cue];
    const outPath = path.join(spec.dir, `${cue}.mp3`);
    if (!options.force && await pathExists(outPath)) {
      outputs.push({ cue, outPath, status: "exists" });
      continue;
    }
    await mkdir(spec.dir, { recursive: true });
    const bytes = await generateWithElevenLabs(spec.text);
    await writeFile(outPath, bytes);
    outputs.push({ cue, outPath, status: "generated", bytes: bytes.length });
    console.log(`${cue} ${bytes.length} ${outPath}`);
  }
  console.log(JSON.stringify({ outputs }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exit(1);
});
