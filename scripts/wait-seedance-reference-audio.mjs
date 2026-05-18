#!/usr/bin/env node
import Scenario from "@scenario-labs/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();
const OUT_DIR = "ui/public/uploads/morgan/ab/01_intro/seedance-reference-audio";
const INPUT_LEDGER = ".local/seedance-reference-audio-submit.json";
const LEDGER_PATH = path.join(OUT_DIR, "ledger.json");
const client = new Scenario({ timeout: 120_000, maxRetries: 2 });
const TERMINAL = new Set(["success", "failure", "canceled"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function saveLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
}
async function main() {
  let ledger;
  try { ledger = JSON.parse(await readFile(LEDGER_PATH, "utf8")); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
    ledger = JSON.parse(await readFile(INPUT_LEDGER, "utf8"));
  }
  for (;;) {
    let allTerminal = true;
    for (const [alias, entry] of Object.entries(ledger.jobs)) {
      if (TERMINAL.has(entry.status)) continue;
      const { job } = await client.jobs.retrieve(entry.jobId);
      entry.status = job.status;
      entry.progress = job.progress;
      entry.assetId = job.metadata?.assetIds?.[0];
      entry.error = job.metadata?.error ?? undefined;
      entry.lastPolledAt = new Date().toISOString();
      if (!TERMINAL.has(entry.status)) allTerminal = false;
      console.log(`${alias}: ${entry.status} progress=${entry.progress ?? "?"} asset=${entry.assetId ?? ""}`);
    }
    await saveLedger(ledger);
    if (allTerminal) break;
    await sleep(10_000);
  }
  for (const [alias, entry] of Object.entries(ledger.jobs)) {
    if (entry.status !== "success") continue;
    if (entry.localPath) continue;
    if (!entry.assetId) throw new Error(`${alias} succeeded without asset id`);
    const response = await client.assets.retrieve(entry.assetId);
    const bytes = await response.asset.download();
    const videoPath = path.join(OUT_DIR, `${alias}.mp4`);
    await writeFile(videoPath, bytes);
    entry.localPath = videoPath;
    entry.downloadedAt = new Date().toISOString();
    console.log(`downloaded ${alias} ${entry.assetId} -> ${videoPath} (${bytes.length} bytes)`);
  }
  await saveLedger(ledger);
}
main().catch((error) => { console.error(error?.stack ?? error?.message ?? String(error)); process.exit(1); });
