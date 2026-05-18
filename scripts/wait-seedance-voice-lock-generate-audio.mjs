#!/usr/bin/env node
import Scenario from "@scenario-labs/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();
const OUT_DIR = "ui/public/uploads/morgan/ab/01_intro/seedance-voice-lock-generate-audio";
const LEDGER_PATH = path.join(OUT_DIR, "ledger.json");
const JOB_ID = "job_nJ7P7R7weYg7iFZWPMmtH2tR";
const client = new Scenario({ timeout: 120_000, maxRetries: 2 });
const TERMINAL = new Set(["success", "failure", "canceled"]);
async function loadLedger(){try{return JSON.parse(await readFile(LEDGER_PATH,"utf8"));}catch(e){if(e?.code!=="ENOENT")throw e;return{schemaVersion:1,jobId:JOB_ID,modelId:"model_bytedance-seedance-2-0"};}}
async function saveLedger(l){l.updatedAt=new Date().toISOString();await mkdir(OUT_DIR,{recursive:true});await writeFile(LEDGER_PATH,`${JSON.stringify(l,null,2)}\n`);}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function main(){const l=await loadLedger();for(;;){const {job}=await client.jobs.retrieve(l.jobId);l.status=job.status;l.progress=job.progress;l.assetId=job.metadata?.assetIds?.[0];l.error=job.metadata?.error??undefined;l.lastPolledAt=new Date().toISOString();await saveLedger(l);console.log(`${job.status} progress=${job.progress??"?"} asset=${l.assetId??""}`);if(TERMINAL.has(job.status))break;await sleep(10000);}if(l.status!=="success")throw new Error(`job ${l.jobId} ended ${l.status}: ${l.error??"<no error>"}`);if(!l.assetId)throw new Error(`job ${l.jobId} succeeded without asset id`);const response=await client.assets.retrieve(l.assetId);const bytes=await response.asset.download();const videoPath=path.join(OUT_DIR,"seedance-audio-input-generate-audio.mp4");await writeFile(videoPath,bytes);l.localPath=videoPath;l.downloadedAt=new Date().toISOString();await saveLedger(l);console.log(`downloaded ${l.assetId} -> ${videoPath} (${bytes.length} bytes)`);}
main().catch(e=>{console.error(e?.stack??e?.message??String(e));process.exit(1);});
