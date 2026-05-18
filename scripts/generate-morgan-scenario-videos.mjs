#!/usr/bin/env node

import Scenario, { RateLimitError } from "@scenario-labs/sdk";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();

const execFileAsync = promisify(execFile);

const TEAM_ID = "team_XfrxmeZdwYVdv8QuYZGoCLRD";
const PROJECT_ID = "proj_vep6btTPJRGyLAypys4kvxkL";
const MODEL_ALIASES = {
  veed: "model_veed-fabric-1-0",
  "p-avatar": "model_pruna-p-avatar",
  pavatar: "model_pruna-p-avatar",
  pruna: "model_pruna-p-avatar",
  aurora: "model_creatify-aurora",
  kling: "model_kling-video-ai-avatar-v2-pro",
};
const DEFAULT_MODEL_ALIAS = process.env.SCENARIO_MORGAN_MODEL_ALIAS ?? "veed";
const DEFAULT_MODEL_ID =
  process.env.SCENARIO_MORGAN_MODEL_ID ?? MODEL_ALIASES[DEFAULT_MODEL_ALIAS] ?? DEFAULT_MODEL_ALIAS;
const DEFAULT_MORGAN_REFERENCE_IMAGE_ASSET_ID = "asset_qD8pdsjsSaZhoyUxWG523aiU";
const MORGAN_REFERENCE_IMAGE_ASSET_ID =
  process.env.SCENARIO_MORGAN_REFERENCE_IMAGE_ASSET_ID ?? DEFAULT_MORGAN_REFERENCE_IMAGE_ASSET_ID;
const MEDIA_ROOT = "ui/public/uploads/morgan";
const LEDGER_PATH = path.join(MEDIA_ROOT, "scenario-ledger.json");

const SCREENS = [
  { id: "01", slug: "intro", folder: "01_intro" },
  { id: "02", slug: "saved-access", folder: "02_saved-access" },
  { id: "03", slug: "endpoint", folder: "03_endpoint" },
  { id: "04", slug: "source", folder: "04_source" },
  { id: "05", slug: "harness", folder: "05_harness" },
  { id: "06", slug: "clis", folder: "06_clis" },
  { id: "07", slug: "providers", folder: "07_providers" },
  { id: "08", slug: "provider-models", folder: "08_provider-models" },
  { id: "09", slug: "harness-routing", folder: "09_harness-routing" },
  { id: "10", slug: "provider-auth", folder: "10_provider-auth" },
  { id: "11", slug: "tools", folder: "11_tools" },
  { id: "12", slug: "agent-tokens", folder: "12_agent-tokens" },
  { id: "13", slug: "install-start", folder: "13_install-start" },
];

const TERMINAL_FAILURES = new Set(["failure", "canceled"]);

function parseArgs(argv) {
  const options = {
    screens: SCREENS.map((screen) => screen.id),
    resolution: "720p",
    uploadAudio: true,
    submit: true,
    wait: true,
    download: true,
    notify: false,
    force: false,
    concurrency: 1,
    rateLimitMaxWaitSeconds: 3600,
    notifyCommand: process.env.SCENARIO_NOTIFY_CMD ?? "",
    referenceImageAssetId: MORGAN_REFERENCE_IMAGE_ASSET_ID,
    modelAlias: DEFAULT_MODEL_ALIAS,
    modelId: DEFAULT_MODEL_ID,
    videoPrompt: process.env.SCENARIO_MORGAN_VIDEO_PROMPT ?? "",
    stylePrompt: process.env.SCENARIO_MORGAN_STYLE_PROMPT ?? "",
    voicePrompt: process.env.SCENARIO_MORGAN_VOICE_PROMPT ?? "",
    seed: process.env.SCENARIO_MORGAN_SEED ? Number(process.env.SCENARIO_MORGAN_SEED) : undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--screens" && next) {
      options.screens = next.split(",").map((value) => value.trim()).filter(Boolean);
      index += 1;
    } else if (arg === "--resolution" && next) {
      options.resolution = next;
      index += 1;
    } else if (arg === "--reuse-audio") {
      options.uploadAudio = false;
    } else if (arg === "--upload-audio") {
      options.uploadAudio = true;
    } else if (arg === "--submit-only") {
      options.wait = false;
      options.download = false;
    } else if (arg === "--wait-only") {
      options.uploadAudio = false;
      options.submit = false;
      options.wait = true;
      options.download = true;
    } else if (arg === "--no-download") {
      options.download = false;
    } else if (arg === "--notify") {
      options.notify = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--concurrency" && next) {
      options.concurrency = Number(next);
      index += 1;
    } else if (arg === "--rate-limit-max-wait-seconds" && next) {
      options.rateLimitMaxWaitSeconds = Number(next);
      index += 1;
    } else if (arg === "--notify-cmd" && next) {
      options.notifyCommand = next;
      index += 1;
    } else if (arg === "--reference-image-asset-id" && next) {
      options.referenceImageAssetId = next;
      index += 1;
    } else if (arg === "--model" && next) {
      options.modelAlias = next;
      options.modelId = MODEL_ALIASES[next] ?? next;
      index += 1;
    } else if (arg === "--video-prompt" && next) {
      options.videoPrompt = next;
      index += 1;
    } else if (arg === "--style-prompt" && next) {
      options.stylePrompt = next;
      index += 1;
    } else if (arg === "--voice-prompt" && next) {
      options.voicePrompt = next;
      index += 1;
    } else if (arg === "--seed" && next) {
      options.seed = Number(next);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["480p", "720p", "1080p"].includes(options.resolution)) {
    throw new Error(`Unsupported resolution "${options.resolution}". Use 480p, 720p, or 1080p.`);
  }

  if (!Number.isFinite(options.rateLimitMaxWaitSeconds) || options.rateLimitMaxWaitSeconds < 0) {
    throw new Error("--rate-limit-max-wait-seconds must be a non-negative number.");
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer.");
  }
  if (!options.referenceImageAssetId) {
    throw new Error("--reference-image-asset-id must be non-empty when provided.");
  }
  if (!options.modelId) {
    throw new Error("--model must resolve to a Scenario model ID.");
  }
  if (options.seed !== undefined && !Number.isFinite(options.seed)) {
    throw new Error("--seed must be a finite number when provided.");
  }

  return options;
}

function printHelp() {
  console.log(`Generate Morgan setup MP4s with Scenario avatar/lip-sync models.

Required auth:
  SCENARIO_SDK_API_KEY + SCENARIO_SDK_API_SECRET, or SCENARIO_SDK_JWT.

Examples:
  npm run scenario:morgan-videos -- --force --notify
  npm run scenario:morgan-videos -- --screens 03,09 --force
  npm run scenario:morgan-videos -- --wait-only --notify

Options:
  --screens <ids>                     Comma-separated screen ids, default all.
  --resolution <480p|720p|1080p>      Scenario output resolution, default 720p.
                                      VEED supports 480p/720p; P-Avatar supports 720p/1080p.
  --upload-audio                      Upload local morgan.mp3 files first, default.
  --reuse-audio                       Reuse audio asset IDs from scenario-ledger.json.
  --submit-only                       Upload/submit jobs but do not wait or download.
  --wait-only                         Reuse existing job IDs, wait, and download.
  --no-download                       Wait but do not download final assets.
  --force                             Regenerate even when a local morgan.mp4 exists.
  --concurrency <n>                   Number of screens to process in parallel, default 1.
  --notify                            Show a local completion notification when done.
  --notify-cmd <command>              Shell command to run after completion/failure.
  --reference-image-asset-id <asset>   Override Morgan reference image asset ID.
  --model <veed|p-avatar|aurora|kling|model_id>
                                      Scenario model to use, default veed.
  --video-prompt <prompt>             Optional motion prompt for models that support it.
  --style-prompt <prompt>             Optional style/emotion prompt for models that support it.
  --seed <n>                          Optional deterministic seed for models that support it.
  --rate-limit-max-wait-seconds <n>   Retry Scenario 429s up to this many seconds.

Environment:
  SCENARIO_MORGAN_REFERENCE_IMAGE_ASSET_ID overrides the approved leather-glove Morgan reference.
`);
}

function selectScreens(ids) {
  const byId = new Map(SCREENS.map((screen) => [screen.id, screen]));
  const bySlug = new Map(SCREENS.map((screen) => [screen.slug, screen]));
  return ids.map((id) => {
    const screen = byId.get(id) ?? bySlug.get(id);
    if (!screen) {
      throw new Error(`Unknown screen "${id}". Expected one of ${SCREENS.map((item) => item.id).join(", ")}.`);
    }
    return screen;
  });
}

async function loadLedger() {
  try {
    return JSON.parse(await readFile(LEDGER_PATH, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    return {
      schemaVersion: 1,
      scenario: {
        teamId: TEAM_ID,
        projectId: PROJECT_ID,
        modelId: DEFAULT_MODEL_ID,
        modelAlias: DEFAULT_MODEL_ALIAS,
        referenceImageAssetId: MORGAN_REFERENCE_IMAGE_ASSET_ID,
      },
      screens: {},
    };
  }
}

function buildModelBody(entry, options) {
  const body = {
    image: options.referenceImageAssetId,
    resolution: options.resolution,
  };

  if (options.modelId === MODEL_ALIASES["p-avatar"]) {
    body.audio = entry.audioAssetId;
    if (options.videoPrompt) body.videoPrompt = options.videoPrompt;
    if (options.stylePrompt) body.stylePrompt = options.stylePrompt;
    if (options.voicePrompt) body.voicePrompt = options.voicePrompt;
    body.disablePromptUpsampling = true;
    if (options.seed !== undefined) body.seed = options.seed;
  } else {
    body.audioUrl = entry.audioAssetId;
  }

  return body;
}

async function saveLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(LEDGER_PATH), { recursive: true });
  await writeFile(`${LEDGER_PATH}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`);
  await execFileAsync("mv", [`${LEDGER_PATH}.tmp`, LEDGER_PATH]);
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function screenPaths(screen) {
  const folderPath = path.join(MEDIA_ROOT, screen.folder);
  return {
    folderPath,
    audioPath: path.join(folderPath, "morgan.mp3"),
    videoPath: path.join(folderPath, "morgan.mp4"),
  };
}

function getClient() {
  const hasBasic = process.env.SCENARIO_SDK_API_KEY && process.env.SCENARIO_SDK_API_SECRET;
  const hasJwt = process.env.SCENARIO_SDK_JWT;
  if (!hasBasic && !hasJwt) {
    throw new Error("Set SCENARIO_SDK_API_KEY and SCENARIO_SDK_API_SECRET, or SCENARIO_SDK_JWT.");
  }
  return new Scenario({ timeout: 120_000, maxRetries: 2 });
}

async function uploadAudio(client, screen, entry) {
  const { audioPath } = screenPaths(screen);
  if (!(await pathExists(audioPath))) {
    throw new Error(`${screen.folder} is missing ${audioPath}`);
  }

  console.log(`[${screen.folder}] uploading audio ${audioPath}`);
  const response = await client.uploads.uploadFile({
    file: audioPath,
    fileName: `morgan-${screen.folder}.mp3`,
    contentType: "audio/mpeg",
    kind: "audio",
    partConcurrency: 2,
    pollIntervalMs: 2_000,
    pollTimeoutMs: 300_000,
  });

  entry.audioAssetId = response.asset.id;
  entry.audioUploadedAt = new Date().toISOString();
  return entry.audioAssetId;
}

async function submitVideoJob(client, screen, entry, options) {
  if (!entry.audioAssetId) {
    throw new Error(`[${screen.folder}] missing audioAssetId; upload first or add one to ${LEDGER_PATH}.`);
  }

  console.log(`[${screen.folder}] submitting ${options.modelAlias} job (${options.modelId}) with image ${options.referenceImageAssetId} and audio ${entry.audioAssetId}`);
  const run = await retryRateLimit(
    () => client.generate.runModel(options.modelId, { body: buildModelBody(entry, options) }),
    options.rateLimitMaxWaitSeconds,
  );

  entry.videoJobId = run.job.jobId;
  entry.modelId = options.modelId;
  entry.modelAlias = options.modelAlias;
  entry.body = buildModelBody(entry, options);
  entry.videoJobSubmittedAt = new Date().toISOString();
  entry.videoAssetId = undefined;
  entry.videoDownloadedAt = undefined;
  entry.status = run.job.status;
  return run.job;
}

async function waitForVideoJob(client, screen, entry) {
  if (!entry.videoJobId) {
    throw new Error(`[${screen.folder}] missing videoJobId; submit first or add one to ${LEDGER_PATH}.`);
  }

  console.log(`[${screen.folder}] waiting for job ${entry.videoJobId}`);
  const response = await client.jobs.retrieve(entry.videoJobId);
  const job = await response.job.wait({ intervalMs: 15_000, timeoutMs: 30 * 60_000 });
  entry.status = job.status;
  entry.videoJobCompletedAt = new Date().toISOString();
  entry.videoAssetId = job.metadata?.assetIds?.[0];

  if (TERMINAL_FAILURES.has(job.status)) {
    throw new Error(`[${screen.folder}] Scenario job ${job.jobId} ended with ${job.status}: ${job.metadata?.error ?? "<no error>"}`);
  }
  if (!entry.videoAssetId) {
    throw new Error(`[${screen.folder}] Scenario job ${job.jobId} succeeded without metadata.assetIds[0].`);
  }

  console.log(`[${screen.folder}] completed ${job.jobId} -> ${entry.videoAssetId}`);
  return entry.videoAssetId;
}

async function downloadVideo(client, screen, entry) {
  if (!entry.videoAssetId) {
    throw new Error(`[${screen.folder}] missing videoAssetId; cannot download.`);
  }

  const { videoPath } = screenPaths(screen);
  const response = await client.assets.retrieve(entry.videoAssetId);
  const bytes = await response.asset.download();
  await writeFile(videoPath, bytes);
  entry.videoDownloadedAt = new Date().toISOString();
  entry.localPath = videoPath;
  console.log(`[${screen.folder}] downloaded ${entry.videoAssetId} -> ${videoPath}`);
}

async function retryRateLimit(action, maxWaitSeconds) {
  const startedAt = Date.now();
  for (;;) {
    try {
      return await action();
    } catch (error) {
      const waitSeconds = rateLimitWaitSeconds(error);
      if (waitSeconds == null) {
        throw error;
      }
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      if (elapsedSeconds + waitSeconds > maxWaitSeconds) {
        throw error;
      }
      console.log(`Scenario rate limit; waiting ${waitSeconds}s before retrying.`);
      await sleep(waitSeconds * 1000);
    }
  }
}

function rateLimitWaitSeconds(error) {
  if (!(error instanceof RateLimitError) && error?.status !== 429) {
    return null;
  }
  const retryAfterHeader = Number(error?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
    return Math.ceil(retryAfterHeader);
  }
  const message = String(error?.message ?? "");
  const match = message.match(/wait\s+(\d+)\s+seconds/i);
  return match ? Number(match[1]) : 60;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notify(options, title, message, failed) {
  if (options.notifyCommand) {
    await execFileAsync("sh", ["-c", options.notifyCommand], {
      env: { ...process.env, SCENARIO_MORGAN_STATUS: failed ? "failure" : "success" },
    });
  }

  if (!options.notify) {
    return;
  }

  process.stdout.write("\u0007");
  if (process.platform === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
    ]);
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) {
          return;
        }
        await worker(items[index]);
      }
    }),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = getClient();
  const ledger = await loadLedger();
  ledger.scenario = {
    teamId: TEAM_ID,
    projectId: PROJECT_ID,
    modelId: options.modelId,
    modelAlias: options.modelAlias,
    referenceImageAssetId: options.referenceImageAssetId,
  };

  const selectedScreens = selectScreens(options.screens);
  let failed = false;
  let saveLedgerQueue = Promise.resolve();
  const saveCurrentLedger = () => {
    saveLedgerQueue = saveLedgerQueue.then(() => saveLedger(ledger));
    return saveLedgerQueue;
  };

  try {
    await runWithConcurrency(selectedScreens, options.concurrency, async (screen) => {
      const entry = {
        id: screen.id,
        slug: screen.slug,
        folder: screen.folder,
        ...(ledger.screens[screen.folder] ?? {}),
      };
      ledger.screens[screen.folder] = entry;

      const { videoPath } = screenPaths(screen);
      if (!options.force && options.submit && await pathExists(videoPath)) {
        console.log(`[${screen.folder}] local morgan.mp4 exists; use --force to regenerate.`);
        entry.localPath = videoPath;
        entry.status = "local-exists";
        await saveCurrentLedger();
        return;
      }

      if (options.uploadAudio) {
        await uploadAudio(client, screen, entry);
        await saveCurrentLedger();
      }

      if (options.submit) {
        await submitVideoJob(client, screen, entry, options);
        await saveCurrentLedger();
      }

      if (options.wait) {
        await waitForVideoJob(client, screen, entry);
        await saveCurrentLedger();
      }

      if (options.download) {
        await downloadVideo(client, screen, entry);
        await saveCurrentLedger();
      }
    });
  } catch (error) {
    failed = true;
    await saveCurrentLedger();
    await notify(options, "Morgan video generation failed", error.message, true);
    throw error;
  }

  await notify(options, "Morgan video generation complete", `${selectedScreens.length} screen(s) processed.`, failed);
  console.log(`Updated ${LEDGER_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
