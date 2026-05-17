import fs from "node:fs";
import path from "node:path";
import Scenario from "@scenario-labs/sdk";

const client = new Scenario({ timeout: 60_000, maxRetries: 1 });
const outDir = path.join(process.cwd(), ".local/origin-icon-scenario/job_nM2r57YfU9FYxJsxQipAGG9p");
fs.mkdirSync(outDir, { recursive: true });
const ids = process.argv.slice(2);
if (!ids.length) throw new Error("usage: node download-scenario-assets.mjs <assetId...>");
const manifest = [];
for (const id of ids) {
  const r = await client.assets.retrieve(id, { originalAssets: true });
  const asset = r.asset ?? r;
  const url = asset.url ?? asset.preview?.url ?? asset.thumbnail?.url;
  if (!url) throw new Error(`No URL for ${id}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${id} download failed: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  let ext = ".png";
  if (contentType.includes("jpeg")) ext = ".jpg";
  else if (contentType.includes("webp")) ext = ".webp";
  else if (contentType.includes("svg")) ext = ".svg";
  const file = path.join(outDir, `${id}${ext}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  manifest.push({ id, file, contentType, createdAt: asset.createdAt, type: asset.metadata?.type ?? asset.type });
}
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest.map(({id,file,contentType}) => ({id,file,contentType})), null, 2));
