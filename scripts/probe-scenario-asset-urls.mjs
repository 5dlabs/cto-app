import Scenario from "@scenario-labs/sdk";
const client = new Scenario({ timeout: 60_000, maxRetries: 1 });
const ids = process.argv.slice(2);
for (const id of ids) {
  try {
    const r = await client.assets.retrieve(id, { originalAssets: true });
    const asset = r.asset ?? r;
    console.log(JSON.stringify({
      id: asset.id,
      name: asset.name,
      kind: asset.metadata?.kind ?? asset.kind,
      type: asset.metadata?.type ?? asset.type,
      url: asset.url,
      thumbnail: asset.thumbnail?.url,
      preview: asset.preview?.url,
      originalFileUrl: asset.originalFileUrl,
      createdAt: asset.createdAt,
    }, null, 2));
  } catch (e) {
    console.error(`${id}: ${e?.message ?? e}`);
  }
}
