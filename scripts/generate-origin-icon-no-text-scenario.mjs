import fs from "node:fs";
import path from "node:path";
import Scenario from "@scenario-labs/sdk";

const repo = process.cwd();
const logoPath = path.join(repo, "ui/src/assets/5d-labs-mark.png");
const candidatePath = path.join(repo, ".local/origin-icon-scenario/job_nM2r57YfU9FYxJsxQipAGG9p/asset_ygUu81xgnfdcVEzKAmvGqm9N.png");
const client = new Scenario({ timeout: 120_000, maxRetries: 1 });

async function uploadReference(filePath, name) {
  const b64 = fs.readFileSync(filePath).toString("base64");
  const uploaded = await client.assets.upload({
    name,
    image: `data:image/png;base64,${b64}`,
    originalAssets: true,
  });
  return uploaded.asset ?? uploaded;
}

const logoAsset = await uploadReference(logoPath, "5d-labs-mark-reference.png");
const candidateAsset = fs.existsSync(candidatePath)
  ? await uploadReference(candidatePath, "5d-origin-text-candidate-reference.png")
  : null;

const prompt = `Create a clean 1:1 app/setup icon for "5D Origin" using the provided 5D Labs logo as the source of truth.

IMPORTANT: no text, no words, no caption, no "5D Origin" label underneath. The GitHub and GitLab source icons are icon-only, so this must also be icon-only.

Preserve the recognizable 5D Labs identity: angular neon cyan/aqua "5" on the left, bold "D" on the right, and a glowing vertical dimensional portal/core between them. Keep the dark/black background, cyan/aqua rim light, deep teal/navy/purple shadows, and crystalline beveled energy feel.

Make it work at 24px, 28px, 40px, and 64px: larger central 5D mark, strong silhouette, fewer tiny shards/splatters, less bloom, crisp edge clarity, centered with safe padding. Avoid generic line art, avoid source-control branch symbols, avoid unrelated logos, and avoid any readable text.`;

const result = await client.generate.runModel("model_openai-gpt-image-1-5-editing", {
  body: {
    referenceImages: [logoAsset.id, ...(candidateAsset ? [candidateAsset.id] : [])],
    prompt,
    numOutputs: 4,
    aspectRatio: "1:1",
    inputFidelity: "high",
    quality: "high",
    background: "transparent",
  },
});

console.log(JSON.stringify({
  logoReferenceAssetId: logoAsset.id,
  candidateReferenceAssetId: candidateAsset?.id ?? null,
  jobId: result.job?.jobId,
  status: result.job?.status,
  progress: result.job?.progress,
  assetIds: result.job?.metadata?.assetIds ?? [],
  creativeUnitsCost: result.creativeUnitsCost,
}, null, 2));
