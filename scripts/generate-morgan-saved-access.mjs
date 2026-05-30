import Scenario from "@scenario-labs/sdk";
import { readFile, writeFile } from "node:fs/promises";

const API_KEY = (await readFile("/tmp/scenario_api.key.clean", "utf8")).trim();
const API_SECRET = (await readFile("/tmp/scenario_secret.key.clean", "utf8")).trim();
process.env.SCENARIO_SDK_API_KEY = API_KEY;
process.env.SCENARIO_SDK_API_SECRET = API_SECRET;

const client = new Scenario({ timeout: 120_000, maxRetries: 2 });
const AUDIO_PATH = "ui/public/uploads/morgan/02_saved-access/morgan.mp3";
const VIDEO_PATH = "ui/public/uploads/morgan/02_saved-access/morgan.mp4";
const REF_IMAGE = "asset_qD8pdsjsSaZhoyUxWG523aiU";
const MODEL_ID = "model_pruna-p-avatar";

console.log("Uploading audio...");
const upload = await client.uploads.uploadFile({
  file: AUDIO_PATH,
  fileName: "morgan.mp3",
  contentType: "audio/mpeg",
  kind: "audio",
  partConcurrency: 2,
  pollIntervalMs: 2_000,
  pollTimeoutMs: 300_000,
});
console.log("Audio uploaded:", upload.asset.id);

console.log("Submitting P-Video Avatar job...");
const run = await client.generate.runModel(MODEL_ID, {
  body: {
    image: REF_IMAGE,
    audio: upload.asset.id,
    resolution: "720p",
    disablePromptUpsampling: true,
  },
});
console.log("Job submitted:", run.job.id);

console.log("Waiting for completion (up to 30 min)...");
const job = await run.job.wait({ intervalMs: 15_000, timeoutMs: 30 * 60_000 });
console.log("Job status:", job.status);

if (job.status === "success" && job.metadata?.assetIds?.[0]) {
  const assetId = job.metadata.assetIds[0];
  console.log("Downloading asset:", assetId);
  const response = await client.assets.retrieve(assetId);
  const buffer = await response.asset.download();
  await writeFile(VIDEO_PATH, Buffer.from(buffer));
  console.log("Video saved to:", VIDEO_PATH);
} else {
  console.error("Job failed or no asset:", job);
  process.exit(1);
}
