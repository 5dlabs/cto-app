import Scenario from "@scenario-labs/sdk";

const client = new Scenario({ timeout: 60_000, maxRetries: 1 });
let page = await client.assets.list({ pageSize: 100, sortBy: "createdAt", sortDirection: "desc", originalAssets: true });
let scanned = 0;
const matches = [];
const imageAssets = [];
while (page && scanned < 1000) {
  for (const asset of page.assets ?? []) {
    scanned += 1;
    const record = {
      id: asset.id,
      name: asset.name ?? asset.fileName ?? asset.filename ?? asset.title ?? null,
      type: asset.type ?? asset.kind ?? asset.mimeType ?? asset.contentType ?? null,
      createdAt: asset.createdAt ?? asset.created_at ?? null,
      tags: asset.tags ?? null,
    };
    const text = JSON.stringify(asset).toLowerCase();
    if (text.includes("boardy") || text.includes("boardylabs")) matches.push(record);
    if (String(record.type ?? "").includes("image")) imageAssets.push(record);
  }
  if (!page.hasNextPage?.() || scanned >= 1000) break;
  page = await page.getNextPage();
}
console.log(JSON.stringify({ scanned, matches, imageAssets: imageAssets.slice(0, 80) }, null, 2));
