import Scenario from "@scenario-labs/sdk";

const client = new Scenario({ timeout: 120_000, maxRetries: 1 });

const queries = [
  "logo icon reference image editing transparent background small UI provider icon",
  "vectorize png to svg logo icon",
  "svg logo icon generation vector transparent background",
  "OpenAI image editing reference fidelity transparent icon",
  "Recraft SVG vector logo icon",
];

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj?.[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

async function collectSearch(query) {
  const page = await client.search.modelSearch({
    query,
    public: true,
    limit: 12,
    querySemanticRatio: 0.8,
  });
  const arr = [];
  for await (const model of page) {
    arr.push(pick(model, ["id", "name", "type", "tags", "score", "description", "trainingImagesNumber"]));
    if (arr.length >= 12) break;
  }
  return arr;
}

const searchResults = {};
for (const query of queries) {
  searchResults[query] = await collectSearch(query);
}

const candidateIds = [
  "model_openai-gpt-image-1-5-editing",
  "model_openai-gpt-image-1-5",
  "model_recraft-vectorize",
  "model_recraft-v4-pro-svg",
  "model_recraft-v4-svg",
  "model_recraft-v3-svg",
];

const candidateDetails = [];
for (const id of candidateIds) {
  try {
    const model = await client.models.retrieve(id);
    const raw = model.model ?? model;
    candidateDetails.push({
      id,
      name: raw.name,
      type: raw.type,
      tags: raw.tags,
      inputKeys: raw.inputSchema?.properties ? Object.keys(raw.inputSchema.properties) : undefined,
      required: raw.inputSchema?.required,
      inputs: raw.inputSchema?.properties,
    });
  } catch (err) {
    candidateDetails.push({ id, error: err?.message ?? String(err) });
  }
}

const recommendation = {
  primaryRasterEdit: {
    model: "model_openai-gpt-image-1-5-editing",
    why: [
      "Has referenceImages, so it can preserve the actual 5D/BoardyLabs mark instead of inventing a new logo.",
      "Supports inputFidelity=high, background=transparent, aspectRatio=1:1, and quality=high.",
      "Best first pass for a compact transparent provider glyph from an existing mark.",
    ],
  },
  vectorFinalization: {
    model: "model_recraft-vectorize",
    why: [
      "Takes the selected raster result as referenceImage and converts it to SVG.",
      "Use only after selecting a raster candidate that survives 24/28/40/64px checks.",
    ],
  },
  notFirstChoice: {
    model: "model_recraft-v4-pro-svg",
    why: [
      "It is useful for prompt-native SVG generation, but inspected schema does not expose referenceImages.",
      "For our case, faithful reference preservation matters more than direct SVG output.",
    ],
  },
  prompt: "Convert the provided 5D Labs / BoardyLabs mark into a compact UI provider icon for a dark desktop setup screen. Preserve the exact recognizable swirl/ribbon geometry and cyan-blue-purple color identity of the reference mark. Do not invent a new logo. Do not add text, letters, git branches, network nodes, frames, badges, app tiles, shadows, 3D objects, mascots, or backgrounds. Use a transparent background. Center the mark with generous safe padding. Make it readable at 24px, 28px, 40px, and 64px. Output should feel like a clean brand mark placed beside GitHub and GitLab provider icons, not marketing artwork.",
};

console.log(JSON.stringify({ queries, searchResults, candidateDetails, recommendation }, null, 2));
