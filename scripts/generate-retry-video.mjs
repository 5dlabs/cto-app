import Scenario, { RateLimitError } from "@scenario-labs/sdk";
import { writeFile } from "node:fs/promises";

const API_KEY = (await (await import("node:fs/promises")).readFile("/tmp/scenario_api.key", "utf8")).trim();
const API_SECRET = (await (await import("node:fs/promises")).readFile("/tmp/scenario_secret.key", "utf8")).trim();

process.env.SCENARIO_SDK_API_KEY = API_KEY;
process.env.SCENARIO_SDK_API_SECRET = API_SECRET;

const client = new Scenario({ timeout: 120_000, maxRetries: 2 });
const AUDIO_PATH = "/Users/edge_kase/5dlabs/cto-app/ui/public/uploads/morgan/01_intro/retry-cluster-setup.mp3";
const VIDEO_PATH = "/Users/edge_kase/5dlabs/cto-app/ui/public/uploads/morgan/01_intro/retry-cluster-setup.mp4";
const REF_IMAGE_ASSET = "asset_qD8pdsjsSaZhoyUxWG523aiU";
const MODEL_ID = "model_pruna-p-avatar";

console.log("Uploading audio...");
const upload = await client.uploads.uploadFile({
  file: AUDIO_PATH,
  fileName: "retry-cluster-setup.mp3",
  contentType: "audio/mpeg",
  kind: "audio",
  partConcurrency: 2,
  pollIntervalMs: 2_000,
  pollTimeoutMs: 300_000,
});
console.log("Audio uploaded:", upload.asset.id);

console.log("Submitting video job...");
const run = await client.generate.runModel(MODEL_ID, {
  body: {
    image: REF_IMAGE_ASSET,
    audio: upload.asset.id,
    resolution: "720p",
    disablePromptUpsampling: true,
  },
});
console.log("Job submitted:", run.job.jobId);

console.log("Waiting for completion...");
const job = await run.job.wait({ intervalMs: 15_000, timeoutMs: 30 * 60_000 });
console.log("Job completed:", job.status);

if (job.status === "success") {
  const assetId = job.metadata?.assetIds?.[0];
  console.log("Downloading asset:", assetId);
  const response = await client.assets.retrieve(assetId);
  const bytes = await response.asset.download();
  await writeFile(VIDEO_PATH, bytes);
  console.log("Saved to:", VIDEO_PATH);
} else {
  console.error("Job failed:", job.status, job.metadata?.error);
  process.exit(1);
}
