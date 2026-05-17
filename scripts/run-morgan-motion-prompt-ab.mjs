#!/usr/bin/env node
import Scenario, { RateLimitError } from "@scenario-labs/sdk";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();

const execFileAsync = promisify(execFile);
const MODEL_ID = "model_pruna-p-avatar";
const MORGAN_REFERENCE_IMAGE_ASSET_ID = "asset_qD8pdsjsSaZhoyUxWG523aiU";
const MEDIA_ROOT = "ui/public/uploads/morgan";
const OUT_ROOT = "ui/public/uploads/morgan/ab/motion-prompt";
const SCREEN_BY_ID = new Map([
  ["01", { id: "01", slug: "intro", folder: "01_intro" }],
  ["02", { id: "02", slug: "saved-access", folder: "02_saved-access" }],
  ["03", { id: "03", slug: "endpoint", folder: "03_endpoint" }],
  ["04", { id: "04", slug: "source", folder: "04_source" }],
  ["05", { id: "05", slug: "harness", folder: "05_harness" }],
  ["06", { id: "06", slug: "clis", folder: "06_clis" }],
  ["07", { id: "07", slug: "providers", folder: "07_providers" }],
  ["08", { id: "08", slug: "provider-models", folder: "08_provider-models" }],
  ["09", { id: "09", slug: "harness-routing", folder: "09_harness-routing" }],
  ["10", { id: "10", slug: "provider-auth", folder: "10_provider-auth" }],
  ["11", { id: "11", slug: "tools", folder: "11_tools" }],
  ["12", { id: "12", slug: "agent-tokens", folder: "12_agent-tokens" }],
  ["13", { id: "13", slug: "install-start", folder: "13_install-start" }],
]);
const SCREEN_BY_SLUG = new Map([...SCREEN_BY_ID.values()].flatMap((screen) => [[screen.slug, screen], [screen.folder, screen]]));

const VARIANTS = {
  calm: {
    label: "calm technical guide",
    videoPrompt:
      "calm restrained CTO technical guide; subtle lip sync only; keep Morgan's nose and muzzle level with the camera; avoid upward nose lifts, head tosses, bouncing, wagging, celebratory energy, or exaggerated excitement; small controlled head motion, slow eye blinks, stable posture, quiet confidence, attentive listening expression; hold clipboard and leather-gloved paws mostly still; friendly but composed while discussing technical setup details; preserve Morgan as a non-human golden retriever dog character with glasses and the approved outfit; no background music; no generated voice",
    stylePrompt:
      "measured technical briefing tone; understated warmth; low-energy professional presence; do not overact",
    voicePrompt: "use the uploaded audio exactly as the speech track; no generated voice, no music, no paraphrasing",
    seed: 7301,
  },
  anchored: {
    label: "anchored muzzle / minimal motion",
    videoPrompt:
      "locked-off calm presenter portrait; accurate mouth movement on the canine muzzle with minimal facial expression; Morgan's nose stays level and centered, eyes face forward, no looking up, no nose-up gestures, no excited leaning, no big paw movement; only tiny blinks and tiny natural breathing/head drift; serious but friendly CTO guide explaining technical steps; preserve dog identity, glasses, leather gloves, clipboard, outfit, and background exactly; no background music; no generated voice",
    stylePrompt:
      "neutral calm technical support guide; restrained motion; focused and trustworthy",
    voicePrompt: "use the uploaded audio exactly as the speech track; no generated voice, no music, no paraphrasing",
    seed: 7302,
  },
  "head-still": {
    label: "head-still / no upward head lift",
    videoPrompt:
      "strictly keep Morgan's head, nose, and muzzle level and steady for the full clip. Do not lift his head upward. Do not tilt his nose upward. Do not look up. Do not raise the chin. Do not make proud, excited, celebratory, sniffing, or howling-like head motions. Use only mouth/viseme movement for speech plus tiny eye blinks. The head remains facing forward at camera height, calm and composed, with minimal natural breathing only. Leather-gloved paws and clipboard remain still. Morgan is a friendly but restrained CTO technical guide explaining source control; preserve the exact golden retriever dog identity, glasses, outfit, and background. no background music; no generated voice",
    stylePrompt:
      "very restrained professional technical narration; no head lift; no overacting; quiet confidence",
    voicePrompt: "use the uploaded audio exactly as the speech track; no generated voice, no music, no paraphrasing",
    seed: 7401,
  },
  "micro-mouth": {
    label: "micro-mouth / near-static head",
    videoPrompt:
      "near-static talking portrait. Animate Morgan only with accurate small mouth shapes for the uploaded speech. Keep the skull, head, nose, muzzle, chin, and neck locked to the original pose; no upward head movement, no upward muzzle tilt, no chin raise, no looking up, no nodding up, no leaning back. Tiny eye blinks are allowed. No paw gestures. No excited expression. Calm technical support guide, measured and grounded. Preserve exact dog character, glasses, leather gloves, clipboard, outfit, and scene. no background music; no generated voice",
    stylePrompt:
      "minimal-motion lip-sync only; head locked; calm professional CTO guide",
    voicePrompt: "use the uploaded audio exactly as the speech track; no generated voice, no music, no paraphrasing",
    seed: 7402,
  },
  "nose-level": {
    label: "nose-level / grounded presenter",
    videoPrompt:
      "grounded presenter with Morgan's nose line pinned level to the camera. Throughout the video, the nose should not travel upward and the muzzle should not point upward. Avoid all head lift, chin lift, looking-up, bounce, excitement, celebration, sniffing, or emphatic head gestures. Keep the face forward and level; use restrained mouth movement, subtle blinks, and almost no head motion. Technical setup narration should feel composed, patient, and low-key. Preserve Morgan as the exact non-human golden retriever dog with glasses, leather gloves, clipboard, outfit, and background. no background music; no generated voice",
    stylePrompt:
      "composed low-key technical presenter; muzzle stays level; minimal movement",
    voicePrompt: "use the uploaded audio exactly as the speech track; no generated voice, no music, no paraphrasing",
    seed: 7403,
  },
  "chin-tucked": {
    label: "chin-tucked / lowered head posture",
    videoPrompt:
      "Morgan speaks from the same calm seated pose as the reference image, with his chin gently tucked and his muzzle angled level-to-slightly-downward while addressing the viewer. Maintain a grounded, lowered head posture for the entire clip. Keep the eyes forward with a mild downward technical-focus expression, like a patient CTO reading from a checklist. Use accurate small mouth shapes for speech, tiny blinks, and almost no head travel. Keep the head posture relaxed, humble, and composed rather than proud or excited. Leather-gloved paws and clipboard remain still. Preserve the exact golden retriever dog identity, glasses, outfit, and background. no background music; no generated voice",
    stylePrompt:
      "grounded low-key technical briefing; chin gently tucked; level-to-downward muzzle; humble calm presence",
    voicePrompt: "use the uploaded audio exactly as the speech track; no generated voice, no music, no paraphrasing",
    seed: 7501,
  },
  "reference-lock": {
    label: "reference-lock / original pose hold",
    videoPrompt:
      "hold Morgan's original reference-image head pose throughout the whole video. Treat the head, neck, chin, and muzzle orientation as locked to the source portrait pose; animate primarily the mouth for speech and only subtle eye blinks. The head stays grounded and steady at the original height and angle, with the muzzle level or slightly downward. Keep motion restrained and documentary-like, as if Morgan is calmly explaining source control to a technical teammate. Keep paws and clipboard still. Preserve the exact golden retriever dog identity, glasses, outfit, lighting, and background. no background music; no generated voice",
    stylePrompt:
      "reference pose hold; near-static technical narrator; mouth-only animation; calm and grounded",
    voicePrompt: "use the uploaded audio exactly as the speech track; no generated voice, no music, no paraphrasing",
    seed: 7502,
  },
  "clipboard-focus": {
    label: "clipboard-focus / slight downward attention",
    videoPrompt:
      "Morgan is a calm CTO guide with a slight downward attention toward the clipboard and checklist, then eyes calmly forward; his muzzle remains level-to-slightly-downward, with a modest lowered head posture. The performance should feel thoughtful, focused, and technical, not excited. Use subtle lip-sync, small blinks, and very restrained movement. Keep the head low and steady, the chin relaxed, paws and clipboard still. Preserve the exact dog character, glasses, leather gloves, outfit, and background. no background music; no generated voice",
    stylePrompt:
      "thoughtful low-key technical guide; slight downward checklist focus; restrained and steady",
    voicePrompt: "use the uploaded audio exactly as the speech track; no generated voice, no music, no paraphrasing",
    seed: 7503,
  },
};

function parseArgs(argv) {
  const options = {
    screen: "04",
    variants: ["calm"],
    resolution: "720p",
    force: false,
    submit: true,
    wait: true,
    download: true,
    pollSeconds: 15,
    timeoutMinutes: 45,
    rateLimitMaxWaitSeconds: 3600,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--screen" && next) {
      options.screen = next;
      index += 1;
    } else if (arg === "--variants" && next) {
      options.variants = next.split(",").map((value) => value.trim()).filter(Boolean);
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
    } else if (arg === "--poll-seconds" && next) {
      options.pollSeconds = Number(next);
      index += 1;
    } else if (arg === "--timeout-minutes" && next) {
      options.timeoutMinutes = Number(next);
      index += 1;
    } else if (arg === "--rate-limit-max-wait-seconds" && next) {
      options.rateLimitMaxWaitSeconds = Number(next);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Generate non-production Morgan P-Video motion-prompt A/B clips.\n\nExamples:\n  node scripts/run-morgan-motion-prompt-ab.mjs --screen 04 --variants calm,anchored --force\n  node scripts/run-morgan-motion-prompt-ab.mjs --screen source --variants calm --submit-only\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  const screen = SCREEN_BY_ID.get(options.screen) ?? SCREEN_BY_SLUG.get(options.screen);
  if (!screen) throw new Error(`Unknown screen ${options.screen}`);
  for (const variant of options.variants) {
    if (!VARIANTS[variant]) throw new Error(`Unknown variant ${variant}`);
  }
  return { ...options, screen };
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

function paths(screen, variant) {
  const base = path.join(OUT_ROOT, screen.folder, variant);
  return {
    base,
    ledgerPath: path.join(base, "ledger.json"),
    audioPath: path.join(MEDIA_ROOT, screen.folder, "morgan.mp3"),
    productionVideoPath: path.join(MEDIA_ROOT, screen.folder, "morgan.mp4"),
    candidatePath: path.join(base, `${screen.folder}-${variant}.mp4`),
    discordPath: path.join(base, `${screen.folder}-${variant}-discord.mp4`),
    comparePath: path.join(base, `${screen.folder}-current-left-${variant}-right.mp4`),
  };
}

async function loadLedger(ledgerPath) {
  try {
    return JSON.parse(await readFile(ledgerPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { schemaVersion: 1, createdAt: new Date().toISOString() };
  }
}

async function saveLedger(ledgerPath, ledger) {
  ledger.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

async function uploadAudio(client, screen, variant, p, entry) {
  console.log(`[${screen.folder}/${variant}] uploading ${p.audioPath}`);
  const response = await client.uploads.uploadFile({
    file: p.audioPath,
    fileName: `morgan-${screen.folder}-${variant}.mp3`,
    contentType: "audio/mpeg",
    kind: "audio",
    partConcurrency: 2,
    pollIntervalMs: 2000,
    pollTimeoutMs: 300000,
  });
  entry.audioAssetId = response.asset.id;
  entry.audioUploadedAt = new Date().toISOString();
}

async function submit(client, screen, variant, p, entry, options) {
  if (entry.videoJobId && !options.force) {
    console.log(`[${screen.folder}/${variant}] keeping existing job ${entry.videoJobId}`);
    return;
  }
  const spec = VARIANTS[variant];
  const body = {
    image: MORGAN_REFERENCE_IMAGE_ASSET_ID,
    audio: entry.audioAssetId,
    resolution: options.resolution,
    videoPrompt: spec.videoPrompt,
    stylePrompt: spec.stylePrompt,
    voicePrompt: spec.voicePrompt,
    disablePromptUpsampling: true,
    seed: spec.seed,
  };
  const dryRun = await retryRateLimit(() => client.generate.runModel(MODEL_ID, { dryRun: true, body }), options.rateLimitMaxWaitSeconds);
  const run = await retryRateLimit(() => client.generate.runModel(MODEL_ID, { body }), options.rateLimitMaxWaitSeconds);
  Object.assign(entry, {
    screen,
    variant,
    label: spec.label,
    modelId: MODEL_ID,
    referenceImageAssetId: MORGAN_REFERENCE_IMAGE_ASSET_ID,
    body,
    estimatedCreativeUnits: dryRun.creativeUnitsCost,
    videoJobId: run.job.jobId,
    status: run.job.status,
    submittedAt: new Date().toISOString(),
    videoAssetId: undefined,
    localPath: p.candidatePath,
  });
  console.log(`[${screen.folder}/${variant}] submitted ${entry.videoJobId}; estimated ${entry.estimatedCreativeUnits} CU`);
}

async function waitForJob(client, screen, variant, entry, options) {
  if (!entry.videoJobId) throw new Error(`[${screen.folder}/${variant}] no videoJobId`);
  const deadline = Date.now() + options.timeoutMinutes * 60_000;
  while (Date.now() < deadline) {
    const response = await client.jobs.retrieve(entry.videoJobId);
    const job = response.job;
    entry.status = job.status;
    entry.progress = job.progress;
    entry.lastPolledAt = new Date().toISOString();
    if (["success", "failure", "canceled"].includes(job.status)) {
      entry.completedAt = new Date().toISOString();
      entry.videoAssetId = job.metadata?.assetIds?.[0];
      entry.error = job.metadata?.error ?? undefined;
      console.log(`[${screen.folder}/${variant}] ${job.status} ${entry.videoAssetId ?? entry.error ?? ""}`);
      if (job.status !== "success") throw new Error(`[${screen.folder}/${variant}] job ended ${job.status}: ${entry.error ?? "<no error>"}`);
      if (!entry.videoAssetId) throw new Error(`[${screen.folder}/${variant}] job succeeded without asset id`);
      return;
    }
    console.log(`[${screen.folder}/${variant}] ${job.status} progress=${job.progress ?? "?"}`);
    await sleep(options.pollSeconds * 1000);
  }
  throw new Error(`[${screen.folder}/${variant}] timed out waiting for ${entry.videoJobId}`);
}

async function download(client, screen, variant, p, entry) {
  const response = await client.assets.retrieve(entry.videoAssetId);
  const bytes = await response.asset.download();
  await mkdir(p.base, { recursive: true });
  await writeFile(p.candidatePath, bytes);
  entry.downloadedAt = new Date().toISOString();
  entry.localPath = p.candidatePath;
  console.log(`[${screen.folder}/${variant}] downloaded ${entry.videoAssetId} -> ${p.candidatePath} (${bytes.length} bytes)`);
}

async function makeReviewCopies(screen, variant, p, entry) {
  await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height", "-of", "json", p.candidatePath]).then(({ stdout }) => {
    entry.ffprobe = JSON.parse(stdout);
  });
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", p.candidatePath,
    "-vf", "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2,setsar=1",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", p.discordPath,
  ]);
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", p.productionVideoPath, "-i", p.candidatePath,
    "-filter_complex", "[0:v]scale=540:540:force_original_aspect_ratio=decrease,pad=540:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[1:v]scale=540:540:force_original_aspect_ratio=decrease,pad=540:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];[v0][v1]hstack=inputs=2[v]",
    "-map", "[v]", "-map", "0:a:0", "-shortest",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", p.comparePath,
  ]);
  entry.discordPath = p.discordPath;
  entry.comparePath = p.comparePath;
  console.log(`[${screen.folder}/${variant}] review ${p.discordPath}`);
  console.log(`[${screen.folder}/${variant}] compare ${p.comparePath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = new Scenario({ timeout: 120_000, maxRetries: 2 });
  for (const variant of options.variants) {
    const p = paths(options.screen, variant);
    const ledger = await loadLedger(p.ledgerPath);
    const entry = ledger.entry ?? {};
    ledger.entry = entry;
    if (options.submit) {
      await uploadAudio(client, options.screen, variant, p, entry);
      await saveLedger(p.ledgerPath, ledger);
      await submit(client, options.screen, variant, p, entry, options);
      await saveLedger(p.ledgerPath, ledger);
    }
    if (options.wait) {
      await waitForJob(client, options.screen, variant, entry, options);
      await saveLedger(p.ledgerPath, ledger);
    }
    if (options.download) {
      await download(client, options.screen, variant, p, entry);
      await makeReviewCopies(options.screen, variant, p, entry);
      await saveLedger(p.ledgerPath, ledger);
    }
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exit(1);
});
