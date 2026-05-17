import fs from "node:fs";
import path from "node:path";
import Scenario from "@scenario-labs/sdk";

const repo = process.cwd();
const referencePath = path.join(repo, "ui/src/assets/5d-labs-mark.png");
const referenceB64 = fs.readFileSync(referencePath).toString("base64");
const client = new Scenario({ timeout: 120_000, maxRetries: 1 });

const prompt = `Create a clean 1:1 app icon for "5D Origin" using the provided 5D Labs logo image as the source of truth.

Preserve the recognizable 5D identity: angular neon cyan/aqua "5" on the left, bold "D" on the right, and a glowing vertical dimensional portal/core between them. Keep the black/dark background, cyan/aqua edge glow, deep teal/navy/purple shadows, and crystalline beveled energy look.

Make it suitable for a small desktop/setup UI icon at 24px, 40px, and 64px: simplify clutter, reduce paint splatter/noise, increase silhouette clarity, keep the 5D readable, center it with safe padding, and use transparent background outside the logo if possible. Avoid generic line-art, avoid a plain text "5D", avoid replacing the shape with unrelated Git/source-control symbols. It should resemble the actual 5D Labs mark but be cleaner and icon-ready.`;

const uploaded = await client.assets.upload({
  name: "5d-labs-mark-reference.png",
  image: `data:image/png;base64,${referenceB64}`,
  originalAssets: true,
});
const referenceAsset = uploaded.asset ?? uploaded;

const result = await client.generate.runModel("model_openai-gpt-image-1-5-editing", {
  body: {
    referenceImages: [referenceAsset.id],
    prompt,
    numOutputs: 4,
    aspectRatio: "1:1",
    inputFidelity: "high",
    quality: "high",
    background: "transparent",
  },
});

console.log(JSON.stringify({
  referenceAssetId: referenceAsset.id,
  jobId: result.job?.jobId,
  status: result.job?.status,
  progress: result.job?.progress,
  assetIds: result.job?.metadata?.assetIds ?? [],
  creativeUnitsCost: result.creativeUnitsCost,
}, null, 2));
