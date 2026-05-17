import Scenario from "@scenario-labs/sdk";

const queries = ["BoardyLabs", "Boardy", "boardylabs", "boardy"];
const client = new Scenario({ timeout: 60_000, maxRetries: 1 });
const seen = new Set();

function pick(asset) {
  const fields = {
    id: asset.id,
    name: asset.name ?? asset.fileName ?? asset.filename ?? asset.title ?? "",
    type: asset.type ?? asset.kind ?? asset.mimeType ?? asset.contentType ?? "",
    url: asset.url ?? asset.uri ?? asset.imageUrl ?? asset.downloadUrl ?? "",
    createdAt: asset.createdAt ?? asset.created_at ?? "",
    updatedAt: asset.updatedAt ?? asset.updated_at ?? "",
  };
  return fields;
}

async function collectFromList(params = {}, max = 200) {
  const out = [];
  let page;
  try {
    page = await client.assets.list(params);
  } catch (error) {
    console.error(`list failed for ${JSON.stringify(params)}: ${error?.message ?? error}`);
    return out;
  }
  while (page && out.length < max) {
    for (const asset of page.assets ?? []) {
      const text = JSON.stringify(asset).toLowerCase();
      if (queries.some((q) => text.includes(q.toLowerCase()))) {
        const item = pick(asset);
        if (!seen.has(item.id)) {
          seen.add(item.id);
          out.push(item);
        }
      }
    }
    if (!page.hasNextPage?.() || out.length >= max) break;
    page = await page.getNextPage();
  }
  return out;
}

const results = [];
for (const q of queries) {
  for (const params of [{ search: q }, { name: q }, { query: q }, { q }, { tag: q }]) {
    results.push(...await collectFromList(params, 50));
  }
}
results.push(...await collectFromList({}, 200));

if (!results.length) {
  console.log("No BoardyLabs/Boardy assets found in accessible Scenario asset pages.");
} else {
  console.log(JSON.stringify(results, null, 2));
}
