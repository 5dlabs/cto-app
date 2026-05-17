import Scenario from "@scenario-labs/sdk";
const client = new Scenario({ timeout: 60_000, maxRetries: 1 });
for (const id of [
  "model_recraft-v4-svg",
  "model_recraft-v4-pro-svg",
  "model_recraft-v3-svg",
  "model_openai-gpt-image-1-5-editing",
  "model_openai-gpt-image-1-editing",
  "model_recraft-vectorize",
  "model_bfl-flux-2-pro-editing",
]) {
  try {
    const m = await client.models.retrieve(id, { originalAssets: true });
    console.log(JSON.stringify({
      id: m.model?.id ?? m.id,
      name: m.model?.name ?? m.name,
      type: m.model?.type ?? m.type,
      status: m.model?.status ?? m.status,
      tags: m.model?.tags ?? m.tags,
      parameters: m.model?.parameters ?? m.parameters,
      inputs: m.model?.inputs ?? m.inputs,
      uiConfig: m.model?.uiConfig ?? m.uiConfig,
      topLevelKeys: Object.keys(m),
    }, null, 2));
  } catch (e) {
    console.error(`${id}: ${e?.message ?? e}`);
  }
}
