import Scenario from '@scenario-labs/sdk';

const ids = [
  'model_openai-gpt-image-1-5-editing',
  'model_recraft-vectorize',
  'model_recraft-v4-pro-svg',
  'model_recraft-v4-svg',
  'model_recraft-v3-svg',
];

const client = new Scenario({ timeout: 120_000, maxRetries: 1 });

function simplify(value, depth = 0) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => simplify(item, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (/url|href|download|signed|thumbnail/i.test(key)) continue;
    if (depth > 3 && typeof val === 'object') continue;
    out[key] = simplify(val, depth + 1);
  }
  return out;
}

for (const id of ids) {
  try {
    const response = await client.models.retrieve(id, { originalAssets: false });
    const model = response.model ?? response;
    const relevant = {
      id: model.id ?? id,
      name: model.name,
      displayName: model.displayName,
      description: model.description,
      type: model.type,
      category: model.category,
      tags: model.tags,
      inputs: model.inputs ?? model.inputSchema ?? model.parameters ?? model.schema?.inputs,
      output: model.output ?? model.outputs,
      cost: model.cost,
      metadata: model.metadata,
    };
    console.log(JSON.stringify(simplify(relevant), null, 2));
  } catch (error) {
    console.log(JSON.stringify({ id, error: error?.message ?? String(error) }, null, 2));
  }
}
