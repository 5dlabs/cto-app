import Scenario, { RateLimitError } from "@scenario-labs/sdk";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Load env
async function loadEnv() {
  try {
    const { readFile } = await import("node:fs/promises");
    const envText = await readFile(path.join(process.env.HOME, ".hermes", ".env"), "utf8");
    for (const line of envText.split("\n")) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
await loadEnv();

const REF_IMAGE_ASSET = "asset_qD8pdsjsSaZhoyUxWG523aiU";
const MODEL_ID = "model_pruna-p-avatar";
const MP3_PATH = "/Users/edge_kase/5dlabs/cto-app/ui/public/uploads/morgan/01_intro/already-set.mp3";
const MP4_PATH = "/Users/edge_kase/5dlabs/cto-app/ui/public/uploads/morgan/01_intro/already-set.mp4";

const client = new Scenario({ timeout: 120_000, maxRetries: 2 });

// Upload audio
console.log("Uploading audio to Scenario...");
const audioBuf = await readFile(MP3_PATH);
const upload = await client.uploads.uploadFile({
  file: audioBuf,
  fileName: "already-set.mp3",
  contentType: "audio/mpeg",
  kind: "audio",
  partConcurrency: 2,
  pollIntervalMs: 2_000,
  pollTimeoutMs: 300_000,
});
const audioAssetId = upload.asset.id;
console.log(`Audio uploaded: ${audioAssetId}`);

// Submit video job
console.log("Submitting video job...");
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

// Wait
console.log("Waiting for completion (may take 2-5 min)...");
const job = await run.job.wait({ intervalMs: 15_000, timeoutMs: 30 * 60_000 });
console.log(`Job completed: ${job.status}`);

if (job.status !== "success") {
  console.error("Job failed:", job.status, job.metadata?.error);
  process.exit(1);
}

const assetId = job.metadata?.assetIds?.[0];
if (!assetId) throw new Error("No assetId");

// Download
console.log(`Downloading asset ${assetId}...`);
const response = await client.assets.retrieve(assetId);
const bytes = await response.asset.download();
await writeFile(MP4_PATH, bytes);
console.log(`MP4 saved: ${MP4_PATH} (${bytes.length} bytes)`);
console.log("All done!");
