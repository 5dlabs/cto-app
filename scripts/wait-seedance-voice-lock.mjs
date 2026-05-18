#!/usr/bin/env node
import Scenario from "@scenario-labs/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();

const OUT_DIR = "ui/public/uploads/morgan/ab/01_intro/seedance-voice-lock";
const LEDGER_PATH = path.join(OUT_DIR, "ledger.json");
const JOB_ID = "job_2TUZFtXUebUxZFuGqmjWHXBh";
const TERMINAL = new Set(["success", "failure", "canceled"]);
const client = new Scenario({ timeout: 120_000, maxRetries: 2 });

async function loadLedger() {
  try { return JSON.parse(await readFile(LEDGER_PATH, "utf8")); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { schemaVersion: 1, jobId: JOB_ID, modelId: "model_bytedance-seedance-2-0" };
  }
}
async function saveLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
}
async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function main() {
  const ledger = await loadLedger();
  for (;;) {
    const response = await client.jobs.retrieve(ledger.jobId);
    const job = response.job;
    ledger.status = job.status;
    ledger.progress = job.progress;
    ledger.assetId = job.metadata?.assetIds?.[0];
    ledger.error = job.metadata?.error ?? undefined;
    ledger.lastPolledAt = new Date().toISOString();
    await saveLedger(ledger);
    console.log(`${job.status} progress=${job.progress ?? "?"} asset=${ledger.assetId ?? ""}`);
    if (TERMINAL.has(job.status)) break;
    await sleep(10_000);
  }
  if (ledger.status !== "success") throw new Error(`job ${ledger.jobId} ended ${ledger.status}: ${ledger.error ?? "<no error>"}`);
  if (!ledger.assetId) throw new Error(`job ${ledger.jobId} succeeded without asset id`);
  const response = await client.assets.retrieve(ledger.assetId);
  const bytes = await response.asset.download();
  const videoPath = path.join(OUT_DIR, "seedance-audio-input.mp4");
  await writeFile(videoPath, bytes);
  ledger.localPath = videoPath;
  ledger.downloadedAt = new Date().toISOString();
  await saveLedger(ledger);
  console.log(`downloaded ${ledger.assetId} -> ${videoPath} (${bytes.length} bytes)`);
}
main().catch((error) => { console.error(error?.stack ?? error?.message ?? String(error)); process.exit(1); });
