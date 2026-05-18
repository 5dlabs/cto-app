import Scenario from "@scenario-labs/sdk";
const client = new Scenario({ timeout: 120_000, maxRetries: 1 });
const queries = [
  "e-video avatar talking head lip sync audio image avatar movement",
  "e video avatar image audio talking head",
  "VEED Fabric Lipsync 1.0 talking head audio image",
  "avatar audio to video lip sync expressive movement",
  "image to video avatar speech audio lipsync",
];
function pick(obj) {
  const raw = obj?.model ?? obj;
  return {
    id: raw?.id,
    name: raw?.name,
    type: raw?.type,
    tags: raw?.tags,
    score: raw?.score,
    description: raw?.description,
    capabilities: raw?.capabilities,
    custom: raw?.custom,
    inputKeys: raw?.inputSchema?.properties ? Object.keys(raw.inputSchema.properties) : undefined,
    required: raw?.inputSchema?.required,
    inputs: raw?.inputSchema?.properties,
  };
}
async function collectSearch(query) {
  const page = await client.search.modelSearch({ query, public: true, limit: 10, querySemanticRatio: 0.8 });
  const arr = [];
  for await (const model of page) {
    arr.push(pick(model));
    if (arr.length >= 10) break;
  }
  return arr;
}
const searchResults = {};
for (const query of queries) {
  try { searchResults[query] = await collectSearch(query); }
  catch (err) { searchResults[query] = { error: err?.message ?? String(err), status: err?.status }; }
}
const ids = new Set(["model_veed-fabric-1-0"]);
for (const arr of Object.values(searchResults)) {
  if (Array.isArray(arr)) for (const m of arr) if (m.id) ids.add(m.id);
}
const candidateDetails = [];
for (const id of ids) {
  try {
    const model = await client.models.retrieve(id);
    const raw = model.model ?? model;
    let description;
    try {
      const d = await client.models.description.retrieve(id);
      description = d.description?.value;
    } catch (e) {
      description = undefined;
    }
    candidateDetails.push({ ...pick(raw), descriptionMarkdown: description?.slice(0, 4000) });
  } catch (err) {
    candidateDetails.push({ id, error: err?.message ?? String(err), status: err?.status });
  }
}
console.log(JSON.stringify({ sdk: "@scenario-labs/sdk", queries, searchResults, candidateDetails }, null, 2));
