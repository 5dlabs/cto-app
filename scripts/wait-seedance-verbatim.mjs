#!/usr/bin/env node
import Scenario from "@scenario-labs/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();

const args = new Set(process.argv.slice(2));
const daemon = args.has("--daemon") || args.has("--forever");
const once = args.has("--once");
const OUT_DIR = "ui/public/uploads/morgan/ab/01_intro/seedance-verbatim";
const SUBMIT_PATH = ".local/seedance-verbatim-submit.json";
const LEDGER_PATH = path.join(OUT_DIR, "ledger.json");
const TERMINAL = new Set(["success", "failure", "canceled"]);
const client = new Scenario({ timeout: 120_000, maxRetries: 2 });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadLedger() {
  try {
    return JSON.parse(await readFile(LEDGER_PATH, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return JSON.parse(await readFile(SUBMIT_PATH, "utf8"));
  }
}

async function saveLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
}

async function pollJob(ledger) {
  const { job } = await client.jobs.retrieve(ledger.jobId);
  ledger.status = job.status;
  ledger.progress = job.progress;
  ledger.assetId = job.metadata?.assetIds?.[0];
  ledger.error = job.metadata?.error ?? undefined;
  ledger.lastPolledAt = new Date().toISOString();
  ledger.lastConnectionError = undefined;
  ledger.consecutiveConnectionErrors = 0;
  await saveLedger(ledger);
  console.log(`${new Date().toISOString()} ${ledger.status} progress=${ledger.progress ?? "?"} asset=${ledger.assetId ?? ""}`);
}

async function downloadIfReady(ledger) {
  if (ledger.status !== "success") return false;
  if (!ledger.assetId) throw new Error(`job ${ledger.jobId} succeeded without asset id`);
  if (ledger.localPath) return true;
  const response = await client.assets.retrieve(ledger.assetId);
  const bytes = await response.asset.download();
  const out = path.join(OUT_DIR, "seedance-verbatim-first15s.mp4");
  await writeFile(out, bytes);
  ledger.localPath = out;
  ledger.downloadedAt = new Date().toISOString();
  await saveLedger(ledger);
  console.log(`downloaded ${ledger.assetId} -> ${out} (${bytes.length} bytes)`);
  return true;
}

async function main() {
  const ledger = await loadLedger();
  let delayMs = 10_000;
  for (;;) {
    try {
      await pollJob(ledger);
      if (TERMINAL.has(ledger.status)) {
        if (ledger.status !== "success") {
          throw new Error(`job ${ledger.jobId} ended ${ledger.status}: ${ledger.error ?? "<no error>"}`);
        }
        await downloadIfReady(ledger);
        return;
      }
      delayMs = 10_000;
      if (once) return;
      await sleep(delayMs);
    } catch (error) {
      ledger.lastConnectionError = String(error?.message ?? error);
      ledger.lastConnectionErrorAt = new Date().toISOString();
      ledger.consecutiveConnectionErrors = (ledger.consecutiveConnectionErrors ?? 0) + 1;
      await saveLedger(ledger);
      console.error(`${new Date().toISOString()} transient error #${ledger.consecutiveConnectionErrors}: ${ledger.lastConnectionError}`);
      if (!daemon && !once && ledger.consecutiveConnectionErrors >= 6) {
        console.error(`continuing after repeated errors because this script is resumable; rerun it anytime with node scripts/wait-seedance-verbatim.mjs`);
      }
      if (once) process.exitCode = 75;
      if (once) return;
      delayMs = Math.min(120_000, Math.max(10_000, delayMs * 1.6));
      await sleep(delayMs);
    }
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exit(1);
});
