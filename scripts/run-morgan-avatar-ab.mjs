#!/usr/bin/env node
import Scenario, { RateLimitError } from "@scenario-labs/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();

const OUT_DIR = "ui/public/uploads/morgan/ab/01_intro";
const LEDGER_PATH = path.join(OUT_DIR, "ledger.json");
const REFERENCE_IMAGE_ASSET_ID = "asset_qD8pdsjsSaZhoyUxWG523aiU";
const INTRO_AUDIO_ASSET_ID = "asset_MW4ncj5gWkpdQg4aWqH58fvs";
const INTRO_TEXT = "Welcome to CTO. I’m Morgan. First I’m going to prepare the Client Cluster on this workstation: the local runtime, Kind, ingress, Argo CD, and the baseline CTO services. You can watch the status here while I do the heavy lifting. When the cluster is ready, we’ll check saved access before touching Cloudflare or Source.";
const MOTION_PROMPT = "natural head motion, eye blinks, subtle friendly presenter gestures; preserve Morgan identity, leather gloves, clipboard, outfit, and calm technical-guide presence";

const CANDIDATES = {
  "p-avatar": {
    modelId: "model_pruna-p-avatar",
    label: "P-Video Avatar / Pruna",
    body: {
      image: REFERENCE_IMAGE_ASSET_ID,
      audio: INTRO_AUDIO_ASSET_ID,
      resolution: "720p",
      videoPrompt: MOTION_PROMPT,
      stylePrompt: "warm confident CTO setup guide; stable identity and outfit",
      seed: 1234,
    },
  },
  aurora: {
    modelId: "model_creatify-aurora",
    label: "Creatify Aurora",
    body: {
      image: REFERENCE_IMAGE_ASSET_ID,
      audio: INTRO_AUDIO_ASSET_ID,
      resolution: "720p",
    },
  },
  kling: {
    modelId: "model_kling-video-ai-avatar-v2-pro",
    label: "Kling AI Avatar 2 Pro",
    body: {
      image: REFERENCE_IMAGE_ASSET_ID,
      audio: INTRO_AUDIO_ASSET_ID,
      resolution: "720p",
    },
  },
  seedance: {
    modelId: "model_bytedance-seedance-2-0",
    label: "Seedance 2.0",
    body: {
      image: REFERENCE_IMAGE_ASSET_ID,
      prompt: `Morgan speaks to camera. ${MOTION_PROMPT}. Dialogue: ${INTRO_TEXT}`,
      resolution: "720p",
      duration: 15,
      aspectRatio: "1:1",
      seed: 1234,
    },
  },
};

function parseArgs(argv) {
  const options = {
    models: Object.keys(CANDIDATES),
    submit: true,
    wait: true,
    download: true,
    force: false,
    pollSeconds: 15,
    timeoutMinutes: 45,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--models" && next) {
      options.models = next.split(",").map((value) => value.trim()).filter(Boolean);
      i += 1;
    } else if (arg === "--submit-only") {
      options.wait = false;
      options.download = false;
    } else if (arg === "--wait-only") {
      options.submit = false;
      options.wait = true;
      options.download = true;
    } else if (arg === "--no-download") {
      options.download = false;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--poll-seconds" && next) {
      options.pollSeconds = Number(next);
      i += 1;
    } else if (arg === "--timeout-minutes" && next) {
      options.timeoutMinutes = Number(next);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Run Morgan 01_intro Scenario avatar A/B jobs without touching production morgan.mp4.\n\nOptions:\n  --models <aliases>    Comma list: ${Object.keys(CANDIDATES).join(",")}\n  --submit-only         Submit jobs and write ledger, do not wait/download\n  --wait-only           Wait/download existing ledger jobs\n  --force               Resubmit even if an alias already has a job\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  for (const alias of options.models) {
    if (!CANDIDATES[alias]) throw new Error(`Unknown model alias ${alias}`);
  }
  return options;
}

async function loadLedger() {
  try {
    return JSON.parse(await readFile(LEDGER_PATH, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      source: {
        screen: "01_intro",
        productionVideo: "ui/public/uploads/morgan/01_intro/morgan.mp4",
        productionAudioAssetId: INTRO_AUDIO_ASSET_ID,
        referenceImageAssetId: REFERENCE_IMAGE_ASSET_ID,
        prompt: INTRO_TEXT,
      },
      candidates: {},
    };
  }
}

async function saveLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
}

async function retryRateLimit(action, maxWaitSeconds = 3600) {
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
      await sleep(waitSeconds * 1000);
    }
  }
}

function rateLimitWaitSeconds(error) {
  if (!(error instanceof RateLimitError) && error?.status !== 429) return null;
  const retryAfterHeader = Number(error?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) return Math.ceil(retryAfterHeader);
  const message = String(error?.message ?? "");
  const match = message.match(/wait\s+(\d+)\s+seconds/i);
  return match ? Number(match[1]) : 60;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submit(client, alias, candidate, entry, options) {
  if (entry.jobId && !options.force) {
    console.log(`[${alias}] keeping existing job ${entry.jobId}`);
    return;
  }
  const dryRun = await retryRateLimit(() => client.generate.runModel(candidate.modelId, { dryRun: true, body: candidate.body }));
  const run = await retryRateLimit(() => client.generate.runModel(candidate.modelId, { body: candidate.body }));
  Object.assign(entry, {
    alias,
    label: candidate.label,
    modelId: candidate.modelId,
    body: candidate.body,
    estimatedCreativeUnits: dryRun.creativeUnitsCost,
    jobId: run.job.jobId,
    status: run.job.status,
    submittedAt: new Date().toISOString(),
    assetId: undefined,
    downloadedAt: undefined,
    localPath: path.join(OUT_DIR, `${alias}.mp4`),
  });
  console.log(`[${alias}] submitted ${entry.jobId}; estimated ${entry.estimatedCreativeUnits} CU`);
}

async function waitForJob(client, alias, entry, options) {
  if (!entry.jobId) throw new Error(`[${alias}] no jobId in ledger`);
  if (entry.status === "success" && entry.assetId) {
    console.log(`[${alias}] already success -> ${entry.assetId}`);
    return;
  }
  const deadline = Date.now() + options.timeoutMinutes * 60_000;
  while (Date.now() < deadline) {
    const response = await client.jobs.retrieve(entry.jobId);
    const job = response.job;
    entry.status = job.status;
    entry.progress = job.progress;
    entry.lastPolledAt = new Date().toISOString();
    if (["success", "failure", "canceled"].includes(job.status)) {
      entry.completedAt = new Date().toISOString();
      entry.assetId = job.metadata?.assetIds?.[0];
      entry.error = job.metadata?.error ?? undefined;
      console.log(`[${alias}] ${job.status} ${entry.assetId ?? entry.error ?? ""}`);
      if (job.status !== "success") throw new Error(`[${alias}] job ${entry.jobId} ended ${job.status}: ${entry.error ?? "<no error>"}`);
      if (!entry.assetId) throw new Error(`[${alias}] job ${entry.jobId} succeeded without assetIds[0]`);
      return;
    }
    console.log(`[${alias}] ${job.status} progress=${job.progress ?? "?"}`);
    await sleep(options.pollSeconds * 1000);
  }
  throw new Error(`[${alias}] timed out waiting for ${entry.jobId}`);
}

async function download(client, alias, entry) {
  if (!entry.assetId) throw new Error(`[${alias}] no assetId to download`);
  const outPath = path.join(OUT_DIR, `${alias}.mp4`);
  const response = await client.assets.retrieve(entry.assetId);
  const bytes = await response.asset.download();
  await writeFile(outPath, bytes);
  entry.localPath = outPath;
  entry.downloadedAt = new Date().toISOString();
  console.log(`[${alias}] downloaded ${entry.assetId} -> ${outPath} (${bytes.length} bytes)`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = new Scenario({ timeout: 120_000, maxRetries: 2 });
  const ledger = await loadLedger();
  for (const alias of options.models) {
    const candidate = CANDIDATES[alias];
    const entry = ledger.candidates[alias] ?? {};
    ledger.candidates[alias] = entry;
    if (options.submit) {
      await submit(client, alias, candidate, entry, options);
      await saveLedger(ledger);
    }
  }
  if (options.wait) {
    for (const alias of options.models) {
      const entry = ledger.candidates[alias];
      await waitForJob(client, alias, entry, options);
      await saveLedger(ledger);
      if (options.download) {
        await download(client, alias, entry);
        await saveLedger(ledger);
      }
    }
  }
  await saveLedger(ledger);
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exit(1);
});
