#!/usr/bin/env node
import Scenario from "@scenario-labs/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();

const DEFAULT_CANDIDATE_IDS = [
  "model_veed-fabric-1-0",
  "model_pruna-p-avatar",
  "model_creatify-aurora",
  "model_kling-video-ai-avatar-v2-pro",
  "model_heygen-avatar4-i2v",
  "model_bytedance-omni-human-1-5",
];

const client = new Scenario({ timeout: 120_000, maxRetries: 1 });
const server = new McpServer({ name: "cto-scenario", version: "0.1.0" });

function textResult(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function pickModel(model) {
  const raw = model?.model ?? model;
  return {
    id: raw?.id,
    name: raw?.name,
    type: raw?.type,
    tags: raw?.tags,
    capabilities: raw?.capabilities,
    custom: raw?.custom,
    inputKeys: raw?.inputSchema?.properties ? Object.keys(raw.inputSchema.properties) : undefined,
    required: raw?.inputSchema?.required,
    inputs: raw?.inputSchema?.properties,
  };
}

async function searchModels(query, limit = 8) {
  const page = await client.search.modelSearch({ query, public: true, limit, querySemanticRatio: 0.8 });
  const models = [];
  for await (const model of page) {
    models.push({ ...pickModel(model), score: model?.score });
    if (models.length >= limit) break;
  }
  return models;
}

async function describeModel(id) {
  const model = pickModel(await client.models.retrieve(id));
  try {
    const description = await client.models.description.retrieve(id);
    model.descriptionMarkdown = description.description?.value;
  } catch (error) {
    model.descriptionError = error?.message ?? String(error);
  }
  return model;
}

function scoreMorganCandidate(model) {
  const blob = [model.name, ...(model.tags ?? []), model.descriptionMarkdown ?? ""].join(" ").toLowerCase();
  let score = 0;
  const reasons = [];
  const add = (points, reason) => { score += points; reasons.push(reason); };
  if (blob.includes("avatar")) add(3, "explicit avatar model");
  if (blob.includes("lipsync") || blob.includes("lip-sync") || blob.includes("lip sync")) add(3, "explicit lip-sync support");
  if (blob.includes("audio")) add(2, "accepts/targets audio-driven speech");
  if (blob.includes("micro-expression") || blob.includes("expressive") || blob.includes("head tilt") || blob.includes("gesture") || blob.includes("upper-body")) add(2, "more expressive movement than mouth-only lip-sync");
  if (blob.includes("stylized illustration") || blob.includes("portrait")) add(1, "fits Morgan portrait workflow");
  if (blob.includes("1080p")) add(1, "can output 1080p");
  if (model.id === "model_veed-fabric-1-0") add(1, "known current baseline");
  if (blob.includes("built-in voice") && !blob.includes("upload your own audio")) { score -= 2; reasons.push("may be less compatible with required local Morgan voice MP3"); }
  if (blob.includes("while unavailable on scenario")) { score -= 6; reasons.push("description says unavailable on Scenario"); }
  return { score, reasons };
}

async function recommendMorganAvatarModels(includeSearch = true) {
  const ids = new Set(DEFAULT_CANDIDATE_IDS);
  const searchResults = {};
  if (includeSearch) {
    const queries = [
      "e-video avatar talking head lip sync audio image avatar movement",
      "p video avatar pruna talking head lip sync audio image",
      "avatar audio to video lip sync expressive movement",
      "image to video avatar speech audio lipsync",
    ];
    for (const query of queries) {
      searchResults[query] = await searchModels(query, 10);
      for (const model of searchResults[query]) {
        if (model.id && /avatar|lipsync|lip sync|speech|audio/i.test(`${model.name} ${(model.tags ?? []).join(" ")}`)) {
          ids.add(model.id);
        }
      }
    }
  }
  const candidates = [];
  for (const id of ids) {
    try {
      const model = await describeModel(id);
      const evaluation = scoreMorganCandidate(model);
      candidates.push({ ...model, evaluation });
    } catch (error) {
      candidates.push({ id, error: error?.message ?? String(error), status: error?.status });
    }
  }
  candidates.sort((a, b) => (b.evaluation?.score ?? -999) - (a.evaluation?.score ?? -999));
  const veed = candidates.find((m) => m.id === "model_veed-fabric-1-0");
  const pAvatar = candidates.find((m) => m.id === "model_pruna-p-avatar");
  return {
    recommendation: {
      primaryTrial: "model_pruna-p-avatar",
      primaryTrialName: "P-Video Avatar (Pruna)",
      reason: "It is the closest match to the requested e-video/avatar direction: audio-upload driven talking portrait, accurate lip sync, natural micro-expressions, optional motion/style prompts, 720p/1080p, and featured on Scenario. It should look less stiff than VEED for Morgan if the portrait remains stable.",
      keepBaseline: "model_veed-fabric-1-0 remains the safe baseline for high-fidelity educational lip sync when mouth accuracy is more important than extra movement.",
      secondaryTrials: ["model_creatify-aurora", "model_kling-video-ai-avatar-v2-pro"],
      caveat: "Run a one-screen A/B before replacing all setup media; more motion can cause identity/hand/glove drift in a stylized Morgan portrait.",
    },
    comparison: {
      veed: veed && { id: veed.id, name: veed.name, descriptionMarkdown: veed.descriptionMarkdown, evaluation: veed.evaluation },
      pAvatar: pAvatar && { id: pAvatar.id, name: pAvatar.name, descriptionMarkdown: pAvatar.descriptionMarkdown, evaluation: pAvatar.evaluation },
    },
    candidates,
    searchResults,
  };
}

server.registerTool("scenario_search_models", {
  description: "Search Scenario public models by natural language query.",
  inputSchema: { query: z.string(), limit: z.number().int().min(1).max(20).default(8) },
}, async ({ query, limit }) => textResult(await searchModels(query, limit)));

server.registerTool("scenario_describe_model", {
  description: "Retrieve Scenario model metadata and Markdown description.",
  inputSchema: { modelId: z.string() },
}, async ({ modelId }) => textResult(await describeModel(modelId)));

server.registerTool("scenario_recommend_morgan_avatar_models", {
  description: "Compare avatar/lip-sync Scenario models for CTO Morgan setup videos, including e-video/P-Video Avatar versus VEED Fabric.",
  inputSchema: { includeSearch: z.boolean().default(true) },
}, async ({ includeSearch }) => textResult(await recommendMorganAvatarModels(includeSearch)));

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("Scenario MCP server error:", error);
  process.exit(1);
});
