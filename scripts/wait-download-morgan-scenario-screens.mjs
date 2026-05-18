#!/usr/bin/env node
import Scenario from "@scenario-labs/sdk";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();
const execFileAsync = promisify(execFile);
const MEDIA_ROOT = "ui/public/uploads/morgan";
const LEDGER_PATH = path.join(MEDIA_ROOT, "scenario-ledger.json");
const SCREENS = new Map([
  ["01", "01_intro"], ["02", "02_saved-access"], ["03", "03_endpoint"], ["04", "04_source"],
  ["05", "05_harness"], ["06", "06_clis"], ["07", "07_providers"], ["08", "08_provider-models"],
  ["09", "09_harness-routing"], ["10", "10_provider-auth"], ["11", "11_tools"], ["12", "12_agent-tokens"],
  ["13", "13_install-start"],
]);

function parseArgs(argv) {
  const options = { screens: [], timeoutMinutes: 45, pollSeconds: 20 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--screens" && next) {
      options.screens = next.split(",").map((v) => v.trim()).filter(Boolean).map((id) => SCREENS.get(id) ?? id);
      i += 1;
    } else if (arg === "--timeout-minutes" && next) {
      options.timeoutMinutes = Number(next); i += 1;
    } else if (arg === "--poll-seconds" && next) {
      options.pollSeconds = Number(next); i += 1;
    } else {
      throw new Error(`unknown arg ${arg}`);
    }
  }
  if (!options.screens.length) throw new Error("--screens required");
  return options;
}
async function loadLedger() { return JSON.parse(await readFile(LEDGER_PATH, "utf8")); }
async function saveLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  await writeFile(`${LEDGER_PATH}.tmp`, `${JSON.stringify(ledger, null, 2)}\n`);
  await execFileAsync("mv", [`${LEDGER_PATH}.tmp`, LEDGER_PATH]);
}
async function downloadAsset(client, assetId, outPath) {
  const response = await client.assets.retrieve(assetId);
  const bytes = await response.asset.download();
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);
  return bytes.length;
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = new Scenario({ timeout: 120_000, maxRetries: 2 });
  const ledger = await loadLedger();
  const deadline = Date.now() + options.timeoutMinutes * 60_000;
  for (const folder of options.screens) {
    const entry = ledger.screens[folder];
    if (!entry?.videoJobId) throw new Error(`[${folder}] no videoJobId in ${LEDGER_PATH}`);
    console.log(`[${folder}] waiting ${entry.videoJobId}`);
    while (Date.now() < deadline) {
      const response = await client.jobs.retrieve(entry.videoJobId);
      const job = response.job;
      entry.status = job.status;
      entry.progress = job.progress;
      entry.lastPolledAt = new Date().toISOString();
      if (["success", "failure", "canceled"].includes(job.status)) {
        entry.videoJobCompletedAt = new Date().toISOString();
        entry.videoAssetId = job.metadata?.assetIds?.[0];
        entry.error = job.metadata?.error ?? undefined;
        await saveLedger(ledger);
        console.log(`[${folder}] ${job.status} ${entry.videoAssetId ?? entry.error ?? ""}`);
        if (job.status !== "success") break;
        const outPath = path.join(MEDIA_ROOT, folder, "morgan.mp4");
        const bytes = await downloadAsset(client, entry.videoAssetId, outPath);
        entry.localPath = outPath;
        entry.videoDownloadedAt = new Date().toISOString();
        await saveLedger(ledger);
        console.log(`[${folder}] downloaded ${bytes} bytes -> ${outPath}`);
        break;
      }
      console.log(`[${folder}] ${job.status} progress=${job.progress ?? "?"}`);
      await new Promise((r) => setTimeout(r, options.pollSeconds * 1000));
    }
  }
}
main().catch((error) => { console.error(error?.stack ?? error?.message ?? String(error)); process.exit(1); });
