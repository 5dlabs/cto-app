#!/usr/bin/env node
import Scenario, { RateLimitError } from "@scenario-labs/sdk";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();

const execFileAsync = promisify(execFile);
const OUT_DIR = "ui/public/uploads/morgan/02_saved-access";
const LEGACY_LEDGER_PATH = path.join(OUT_DIR, "onepassword-condition-videos-ledger.json");
const DEFAULT_PROVIDER = "onepassword";
const PROVIDER_CONDITIONS = {
  onepassword: [
    "ready",
    "missing-desktop",
    "sdk-auth-needed",
    "desktop-integration",
    "needs-access",
    "no-account",
  ],
  bitwarden: ["detected", "locked", "unlocked"],
};
const LEDGER_PATH = path.join(OUT_DIR, "saved-access-condition-videos-ledger.json");
const MODEL_ID = "model_pruna-p-avatar";
const MODEL_ALIAS = "p-avatar";
const REFERENCE_IMAGE_ASSET_ID = "asset_qD8pdsjsSaZhoyUxWG523aiU";
const TERMINAL_FAILURES = new Set(["failure", "canceled"]);
const CONDITIONS = PROVIDER_CONDITIONS[DEFAULT_PROVIDER];

function parseArgs(argv) {
  const options = {
    provider: DEFAULT_PROVIDER,
    conditions: CONDITIONS,
    resolution: "720p",
    force: false,
    submit: true,
    wait: true,
    download: true,
    rateLimitMaxWaitSeconds: 3600,
    videoPrompt:
      "natural head motion, eye blinks, accurate mouth movement on the canine muzzle, subtle friendly presenter gestures, preserve Morgan as a non-human golden retriever dog character with glasses, leather gloves, clipboard, outfit, and calm CTO guide identity; no background music",
    stylePrompt: "use the uploaded audio exactly as the speech track; no generated voice, no music, no paraphrasing",
    seed: 5102,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--provider" && next) {
      if (!PROVIDER_CONDITIONS[next]) throw new Error(`Unknown provider: ${next}`);
      options.provider = next;
      options.conditions = PROVIDER_CONDITIONS[next];
      index += 1;
    } else if (arg === "--conditions" && next) {
      options.conditions = next.split(",").map((value) => value.trim()).filter(Boolean);
      index += 1;
    } else if (arg === "--resolution" && next) {
      options.resolution = next;
      index += 1;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--submit-only") {
      options.wait = false;
      options.download = false;
    } else if (arg === "--wait-only") {
      options.submit = false;
      options.wait = true;
      options.download = true;
    } else if (arg === "--no-download") {
      options.download = false;
    } else if (arg === "--rate-limit-max-wait-seconds" && next) {
      options.rateLimitMaxWaitSeconds = Number(next);
      index += 1;
    } else if (arg === "--seed" && next) {
      options.seed = Number(next);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Generate Morgan Saved access condition MP4s with P-Video Avatar.\n\nOptions:\n  --provider <name>    Provider: ${Object.keys(PROVIDER_CONDITIONS).join(",")}\n  --conditions <list>  Comma list for selected provider\n  --force              Regenerate existing outputs\n  --submit-only        Upload/submit without waiting\n  --wait-only          Wait/download existing ledger jobs\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  for (const condition of options.conditions) {
    if (!PROVIDER_CONDITIONS[options.provider].includes(condition)) {
      throw new Error(`Unknown ${options.provider} condition ${condition}`);
    }
  }
  return options;
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function loadLedger() {
  try {
    const sourcePath = (await pathExists(LEDGER_PATH)) ? LEDGER_PATH : LEGACY_LEDGER_PATH;
    const existing = JSON.parse(await readFile(sourcePath, "utf8"));
    existing.providers ??= Object.fromEntries(Object.keys(PROVIDER_CONDITIONS).map((provider) => [provider, { conditions: {} }]));
    for (const provider of Object.keys(PROVIDER_CONDITIONS)) {
      existing.providers[provider] ??= { conditions: {} };
      existing.providers[provider].conditions ??= {};
    }
    for (const [condition, entry] of Object.entries(existing.conditions ?? {})) {
      existing.providers[DEFAULT_PROVIDER].conditions[condition] = { provider: DEFAULT_PROVIDER, ...entry };
    }
    existing.conditions ??= existing.providers[DEFAULT_PROVIDER].conditions;
    return existing;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return {
      schemaVersion: 1,
      modelAlias: MODEL_ALIAS,
      modelId: MODEL_ID,
      referenceImageAssetId: REFERENCE_IMAGE_ASSET_ID,
      providers: Object.fromEntries(Object.keys(PROVIDER_CONDITIONS).map((provider) => [provider, { conditions: {} }])),
      conditions: {},
    };
  }
}

async function saveLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(LEDGER_PATH), { recursive: true });
  await writeFile(`${LEDGER_PATH}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`);
  await execFileAsync("mv", [`${LEDGER_PATH}.tmp`, LEDGER_PATH]);
}

function getClient() {
  const hasBasic = process.env.SCENARIO_SDK_API_KEY && process.env.SCENARIO_SDK_API_SECRET;
  const hasJwt = process.env.SCENARIO_SDK_JWT;
  if (!hasBasic && !hasJwt) {
    throw new Error("Set SCENARIO_SDK_API_KEY and SCENARIO_SDK_API_SECRET, or SCENARIO_SDK_JWT.");
  }
  return new Scenario({ timeout: 120_000, maxRetries: 2 });
}

async function retryRateLimit(action, maxWaitSeconds) {
  const startedAt = Date.now();
  for (;;) {
    try {
      return await action();
    } catch (error) {
      const waitSeconds = rateLimitWaitSeconds(error);
      if (waitSeconds == null) throw error;
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      if (elapsedSeconds + waitSeconds > maxWaitSeconds) throw error;
      console.log(`Scenario rate limit; waiting ${waitSeconds}s before retrying.`);
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }
  }
}

function rateLimitWaitSeconds(error) {
  if (!(error instanceof RateLimitError) && error?.status !== 429) return null;
  const retryAfterHeader = Number(error?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) return Math.ceil(retryAfterHeader);
  const match = String(error?.message ?? "").match(/wait\s+(\d+)\s+seconds/i);
  return match ? Number(match[1]) : 60;
}

async function uploadAudio(client, provider, condition, entry) {
  const audioPath = path.join(OUT_DIR, `${provider}-${condition}.mp3`);
  if (!(await pathExists(audioPath))) throw new Error(`${provider}-${condition} missing ${audioPath}`);
  console.log(`[${provider}:${condition}] uploading audio ${audioPath}`);
  const response = await client.uploads.uploadFile({
    file: audioPath,
    fileName: `morgan-${provider}-${condition}.mp3`,
    contentType: "audio/mpeg",
    kind: "audio",
    partConcurrency: 2,
    pollIntervalMs: 2_000,
    pollTimeoutMs: 300_000,
  });
  entry.audioPath = audioPath;
  entry.audioAssetId = response.asset.id;
  entry.audioUploadedAt = new Date().toISOString();
}

async function submitJob(client, provider, condition, entry, options) {
  if (!entry.audioAssetId) throw new Error(`[${provider}:${condition}] missing audioAssetId`);
  const body = {
    image: REFERENCE_IMAGE_ASSET_ID,
    audio: entry.audioAssetId,
    resolution: options.resolution,
    videoPrompt: options.videoPrompt,
    stylePrompt: options.stylePrompt,
    voicePrompt: "use the uploaded audio exactly as the speech track; no generated voice, no music, no paraphrasing",
    disablePromptUpsampling: true,
    seed: options.seed,
  };
  console.log(`[${provider}:${condition}] submitting ${MODEL_ALIAS} job with audio ${entry.audioAssetId}`);
  const run = await retryRateLimit(() => client.generate.runModel(MODEL_ID, { body }), options.rateLimitMaxWaitSeconds);
  entry.modelId = MODEL_ID;
  entry.modelAlias = MODEL_ALIAS;
  entry.body = body;
  entry.videoJobId = run.job.jobId;
  entry.videoJobSubmittedAt = new Date().toISOString();
  entry.status = run.job.status;
  entry.videoAssetId = undefined;
  entry.videoDownloadedAt = undefined;
}

async function waitForJob(client, provider, condition, entry) {
  if (!entry.videoJobId) throw new Error(`[${provider}:${condition}] missing videoJobId`);
  console.log(`[${provider}:${condition}] waiting for job ${entry.videoJobId}`);
  const response = await client.jobs.retrieve(entry.videoJobId);
  const job = await response.job.wait({ intervalMs: 15_000, timeoutMs: 30 * 60_000 });
  entry.status = job.status;
  entry.videoJobCompletedAt = new Date().toISOString();
  entry.videoAssetId = job.metadata?.assetIds?.[0];
  if (TERMINAL_FAILURES.has(job.status)) {
    throw new Error(`[${provider}:${condition}] Scenario job ${job.jobId} ended with ${job.status}: ${job.metadata?.error ?? "<no error>"}`);
  }
  if (!entry.videoAssetId) throw new Error(`[${provider}:${condition}] Scenario job ${job.jobId} succeeded without assetIds[0]`);
  console.log(`[${provider}:${condition}] completed ${job.jobId} -> ${entry.videoAssetId}`);
}

async function downloadVideo(client, provider, condition, entry) {
  const outPath = path.join(OUT_DIR, `${provider}-${condition}.mp4`);
  if (!entry.videoAssetId) throw new Error(`[${provider}:${condition}] missing videoAssetId`);
  const response = await client.assets.retrieve(entry.videoAssetId);
  const bytes = await response.asset.download();
  await writeFile(outPath, bytes);
  entry.videoPath = outPath;
  entry.videoDownloadedAt = new Date().toISOString();
  console.log(`[${provider}:${condition}] downloaded ${entry.videoAssetId} -> ${outPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = getClient();
  const ledger = await loadLedger();
  ledger.modelAlias = MODEL_ALIAS;
  ledger.modelId = MODEL_ID;
  ledger.referenceImageAssetId = REFERENCE_IMAGE_ASSET_ID;

  const providerLedger = ledger.providers?.[options.provider] ?? { conditions: {} };
  ledger.providers = { ...(ledger.providers ?? {}), [options.provider]: providerLedger };
  providerLedger.conditions ??= {};
  const legacyConditions = options.provider === DEFAULT_PROVIDER ? ledger.conditions : providerLedger.conditions;

  for (const condition of options.conditions) {
    const outPath = path.join(OUT_DIR, `${options.provider}-${condition}.mp4`);
    const entry = { provider: options.provider, condition, ...(legacyConditions[condition] ?? {}), ...(providerLedger.conditions[condition] ?? {}) };
    providerLedger.conditions[condition] = entry;
    if (options.provider === DEFAULT_PROVIDER) ledger.conditions[condition] = entry;
    if (!options.force && options.submit && await pathExists(outPath)) {
      console.log(`[${options.provider}:${condition}] local MP4 exists; use --force to regenerate.`);
      entry.videoPath = outPath;
      entry.status = "local-exists";
      await saveLedger(ledger);
      continue;
    }
    if (options.submit) {
      await uploadAudio(client, options.provider, condition, entry);
      await saveLedger(ledger);
      await submitJob(client, options.provider, condition, entry, options);
      await saveLedger(ledger);
    }
    if (options.wait) {
      await waitForJob(client, options.provider, condition, entry);
      await saveLedger(ledger);
    }
    if (options.download) {
      await downloadVideo(client, options.provider, condition, entry);
      await saveLedger(ledger);
    }
  }

  await saveLedger(ledger);
  console.log(`Updated ${LEDGER_PATH}`);
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exit(1);
});
