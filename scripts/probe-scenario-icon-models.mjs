import Scenario from "@scenario-labs/sdk";

const client = new Scenario({ timeout: 60_000, maxRetries: 1 });
const needles = [
  "icon", "logo", "vector", "svg", "image edit", "edit", "gpt-image", "qwen", "flux", "kontext", "recraft"
];
const publicTypes = [
  "gpt-image-1",
  "qwen-image-edit-lora",
  "qwen-image-edit-2509-lora",
  "qwen-image-edit-2511-lora",
  "qwen-image-lora",
  "qwen-image-2512-lora",
  "flux.1-kontext-dev",
  "flux.1-krea-dev",
  "flux.1-pro",
  "flux.1.1-pro-ultra",
  "flux.2-dev-edit-lora",
  "zimage-turbo-lora",
  "zimage-de-turbo-lora",
];

function summarize(m) {
  const text = JSON.stringify(m).toLowerCase();
  return {
    id: m.id,
    name: m.name ?? m.displayName ?? m.title ?? null,
    type: m.type ?? null,
    privacy: m.privacy ?? null,
    status: m.status ?? null,
    class: m.class?.name ?? m.class ?? null,
    tags: m.tags ?? [],
    inputs: (m.inputs ?? []).map((i) => ({ name: i.name, type: i.type, label: i.label })).slice(0, 10),
    score: needles.reduce((n, needle) => n + (text.includes(needle) ? 1 : 0), 0),
  };
}

const models = new Map();
for (const params of [
  { privacy: "public", pageSize: 500, sortBy: "score" },
  { privacy: "public", pageSize: 500, types: publicTypes },
  { privacy: "private", pageSize: 500, status: "trained", sortBy: "createdAt", sortDirection: "desc" },
]) {
  try {
    const page = await client.models.list(params);
    for (const m of page.models ?? []) {
      const text = JSON.stringify(m).toLowerCase();
      if (needles.some((needle) => text.includes(needle)) || publicTypes.includes(m.type)) {
        models.set(m.id, summarize(m));
      }
    }
  } catch (error) {
    console.error(`models.list failed ${JSON.stringify(params)}: ${error?.message ?? error}`);
  }
}
const ranked = [...models.values()].sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name))).slice(0, 40);
console.log(JSON.stringify(ranked, null, 2));
