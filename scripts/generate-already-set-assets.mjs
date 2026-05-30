import Scenario, { RateLimitError } from "@scenario-labs/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Load env from ~/.hermes/.env if available
async function loadEnv() {
  try {
    const envPath = path.join(process.env.HOME, ".hermes", ".env");
    const envText = await readFile(envPath, "utf8");
    for (const line of envText.split("\n")) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

await loadEnv();

const VOICE_ID = process.env.MORGAN_VOICE_ID ?? "iP95p4xoKVk53GoZ742B";
const REF_IMAGE_ASSET = "asset_qD8pdsjsSaZhoyUxWG523aiU";
const MODEL_ID = "model_pruna-p-avatar";
const TEXT = "It looks like everything is already set up. Let's proceed.";
const OUT_DIR = "ui/public/uploads/morgan/01_intro";
const MP3_PATH = path.join(OUT_DIR, "already-set.mp3");
const MP4_PATH = path.join(OUT_DIR, "already-set.mp4");

await mkdir(OUT_DIR, { recursive: true });

// 1. Generate MP3 via ElevenLabs
console.log("Generating ElevenLabs MP3...");
const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
  method: "POST",
  headers: {
    "xi-api-key": process.env.ELEVENLABS_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: TEXT,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  }),
});
if (!elevenRes.ok) {
  const body = await elevenRes.text();
  throw new Error(`ElevenLabs ${elevenRes.status}: ${body}`);
}
const mp3Buf = Buffer.from(await elevenRes.arrayBuffer());
await writeFile(MP3_PATH, mp3Buf);
console.log(`MP3 saved: ${MP3_PATH} (${mp3Buf.length} bytes)`);

// 2. Upload to Scenario
console.log("Uploading audio to Scenario...");
const client = new Scenario({ timeout: 120_000, maxRetries: 2 });
const upload = await client.uploads.uploadFile({
  file: mp3Buf,
  fileName: "already-set.mp3",
  contentType: "audio/mpeg",
  kind: "audio",
  partConcurrency: 2,
  pollIntervalMs: 2_000,
  pollTimeoutMs: 300_000,
});
const audioAssetId = upload.asset.id;
console.log(`Audio uploaded: ${audioAssetId}`);

// 3. Submit video job
console.log("Submitting Scenario video job...");
const run = await client.generate.runModel(MODEL_ID, {
  body: {
    image: REF_IMAGE_ASSET,
    audio: audioAssetId,
    resolution: "720p",
    disablePromptUpsampling: true,
  },
});
const jobId = run.job.jobId;
console.log(`Job submitted: ${jobId}`);

// 4. Wait for completion
console.log("Waiting for video generation (may take 2-5 min)...");
const job = await run.job.wait({ intervalMs: 15_000, timeoutMs: 30 * 60_000 });
console.log(`Job completed: ${job.status}`);

if (job.status !== "success") {
  console.error("Job failed:", job.status, job.metadata?.error);
  process.exit(1);
}

const assetId = job.metadata?.assetIds?.[0];
if (!assetId) {
  throw new Error("Job succeeded without assetIds[0]");
}

// 5. Download
console.log(`Downloading asset ${assetId}...`);
const response = await client.assets.retrieve(assetId);
const bytes = await response.asset.download();
await writeFile(MP4_PATH, bytes);
console.log(`MP4 saved: ${MP4_PATH} (${bytes.length} bytes)`);
console.log("All done!");
