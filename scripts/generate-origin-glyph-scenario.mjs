import fs from "node:fs";
import path from "node:path";
import Scenario from "@scenario-labs/sdk";

const repo = process.cwd();
const logoPath = path.join(repo, "ui/src/assets/5d-labs-mark.png");
const client = new Scenario({ timeout: 120_000, maxRetries: 1 });

const b64 = fs.readFileSync(logoPath).toString("base64");
const uploaded = await client.assets.upload({
  name: "5d-labs-mark-reference-for-glyph.png",
  image: `data:image/png;base64,${b64}`,
  originalAssets: true,
});
const logoAsset = uploaded.asset ?? uploaded;

const prompt = `Convert the provided 5D Labs logo into a SMALL UI ICON GLYPH, not an app tile.

Hard requirements:
- transparent background only; do NOT draw a rounded square, app badge, tile, frame, label, caption, or text underneath
- output only the central 5D mark as a standalone symbol
- it must read as an icon beside GitHub and GitLab source icons at 28px
- preserve the recognizable 5D Labs geometry: angular 5 on left, bold D on right, vertical glowing origin/portal core between them
- simplify aggressively: one strong silhouette, fewer internal shards, fewer rings, less glow, no splatter, no small decorative particles
- keep cyan/aqua primary shape with dark navy/purple cutouts/shadows, but make edges crisp and high contrast
- centered on transparent canvas with safe padding, similar visual weight to a GitHub/GitLab provider icon
- no words, no letters beyond the 5D mark itself, no "Origin" label, no source-control branch symbols

Think: provider logo mark / toolbar icon / SVG-ready glyph, not illustration.`;

const result = await client.generate.runModel("model_openai-gpt-image-1-5-editing", {
  body: {
    referenceImages: [logoAsset.id],
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
  jobId: result.job?.jobId,
  status: result.job?.status,
  progress: result.job?.progress,
  assetIds: result.job?.metadata?.assetIds ?? [],
  creativeUnitsCost: result.creativeUnitsCost,
}, null, 2));
