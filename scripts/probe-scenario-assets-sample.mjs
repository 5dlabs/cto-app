import Scenario from "@scenario-labs/sdk";

const client = new Scenario({ timeout: 60_000, maxRetries: 1 });
const queries = ["boardy", "boardylabs"];
const page = await client.assets.list({ pageSize: 100, sortBy: "createdAt", sortDirection: "desc", originalAssets: true });
const rows = [];
for (const asset of page.assets ?? []) {
  const text = JSON.stringify(asset).toLowerCase();
  if (queries.some((q) => text.includes(q))) {
    rows.push(asset);
  }
}
if (!rows.length) {
  console.log(`No Boardy/BoardyLabs match in first ${page.assets?.length ?? 0} newest accessible original assets.`);
  console.log("Newest sample:");
  for (const asset of (page.assets ?? []).slice(0, 15)) {
    console.log(JSON.stringify({
      id: asset.id,
      name: asset.name ?? asset.fileName ?? asset.filename ?? asset.title ?? null,
      type: asset.type ?? asset.kind ?? asset.mimeType ?? asset.contentType ?? null,
      createdAt: asset.createdAt ?? asset.created_at ?? null,
      tags: asset.tags ?? null,
    }));
  }
} else {
  console.log(JSON.stringify(rows.map((asset) => ({
    id: asset.id,
    name: asset.name ?? asset.fileName ?? asset.filename ?? asset.title ?? null,
    type: asset.type ?? asset.kind ?? asset.mimeType ?? asset.contentType ?? null,
    createdAt: asset.createdAt ?? asset.created_at ?? null,
    tags: asset.tags ?? null,
  })), null, 2));
}
