#!/usr/bin/env node
import Scenario, { RateLimitError } from "@scenario-labs/sdk";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadHermesEnv } from "./lib/load-hermes-env.mjs";

loadHermesEnv();
const execFileAsync = promisify(execFile);
const OUT_DIR = "ui/public/uploads/morgan/ab/01_intro/lipsync-offset";
const SOURCE_AUDIO = "ui/public/uploads/morgan/01_intro/morgan.mp3";
const SOURCE_VIDEO = "ui/public/uploads/morgan/01_intro/morgan.mp4";
const REFERENCE_IMAGE = "asset_qD8pdsjsSaZhoyUxWG523aiU";
const MODEL_ID = "model_pruna-p-avatar";
const PROMPT = "Morgan speaks from the same calm seated pose as the reference image. Natural but restrained mouth movement; keep the approved dog character, glasses, leather gloves, clipboard, outfit, and background. no background music; no generated voice";
const STYLE = "calm CTO setup guide; subtle expression; focus on accurate lip synchronization to the uploaded audio";
const VOICE = "use the uploaded audio exactly as the speech track; prioritize exact lip synchronization; no generated voice, no music, no paraphrasing";
const TERMINAL = new Set(["success", "failure", "canceled"]);

function parseArgs(argv) {
  const options = { variants: ["raw", "audio-pad-150", "audio-pad-250", "video-delay-150", "video-delay-250"], force: false, pollSeconds: 15, rateLimitMaxWaitSeconds: 3600 };
  for (let i=0;i<argv.length;i++) {
    const a=argv[i], n=argv[i+1];
    if (a === "--variants" && n) { options.variants = n.split(",").map(v=>v.trim()).filter(Boolean); i++; }
    else if (a === "--force") options.force = true;
    else if (a === "--rate-limit-max-wait-seconds" && n) { options.rateLimitMaxWaitSeconds = Number(n); i++; }
    else throw new Error(`unknown arg ${a}`);
  }
  return options;
}
const sleep = (ms) => new Promise((r)=>setTimeout(r,ms));
async function exists(p) { try { await import('node:fs/promises').then(fs=>fs.stat(p)); return true; } catch(e){ if(e?.code==='ENOENT') return false; throw e; } }
async function retryRateLimit(action, maxWaitSeconds) {
  const start=Date.now();
  for (;;) {
    try { return await action(); } catch (e) {
      const retryAfter = Number(e?.headers?.get?.('retry-after'));
      const wait = e instanceof RateLimitError || e?.status === 429 ? (Number.isFinite(retryAfter)&&retryAfter>0?Math.ceil(retryAfter):60) : null;
      if (!wait) throw e;
      if ((Date.now()-start)/1000 + wait > maxWaitSeconds) throw e;
      console.log(`rate limited; waiting ${wait}s`); await sleep(wait*1000);
    }
  }
}
async function loadLedger(){ try { return JSON.parse(await readFile(path.join(OUT_DIR,'ledger.json'),'utf8')); } catch(e){ if(e?.code!=='ENOENT') throw e; return {schemaVersion:1, variants:{}}; } }
async function saveLedger(l){ l.updatedAt=new Date().toISOString(); await mkdir(OUT_DIR,{recursive:true}); await writeFile(path.join(OUT_DIR,'ledger.json'), JSON.stringify(l,null,2)+'\n'); }
async function makeAudio(name) {
  const out = path.join(OUT_DIR, `${name}.mp3`);
  if (name === 'raw') return SOURCE_AUDIO;
  const match = name.match(/^audio-pad-(\d+)$/);
  if (!match) return SOURCE_AUDIO;
  const ms = Number(match[1]);
  await mkdir(OUT_DIR,{recursive:true});
  await execFileAsync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-t', String(ms/1000), '-i','anullsrc=channel_layout=mono:sample_rate=44100','-i', SOURCE_AUDIO, '-filter_complex','[0:a][1:a]concat=n=2:v=0:a=1[a]','-map','[a]','-c:a','libmp3lame','-b:a','128k', out]);
  return out;
}
async function uploadAudio(client, file, name, entry) {
  const res = await client.uploads.uploadFile({ file, fileName: `morgan-intro-${name}.mp3`, contentType: 'audio/mpeg', kind:'audio', partConcurrency: 2, pollIntervalMs: 2000, pollTimeoutMs: 300000 });
  entry.audioPath=file; entry.audioAssetId=res.asset.id; entry.audioUploadedAt=new Date().toISOString();
}
async function submit(client, name, entry, options) {
  const body = { image: REFERENCE_IMAGE, audio: entry.audioAssetId, resolution: '720p', videoPrompt: PROMPT, stylePrompt: STYLE, voicePrompt: VOICE, disablePromptUpsampling: true, seed: 8601 };
  const run = await retryRateLimit(() => client.generate.runModel(MODEL_ID, { body }), options.rateLimitMaxWaitSeconds);
  entry.body=body; entry.jobId=run.job.jobId; entry.status=run.job.status; entry.submittedAt=new Date().toISOString();
}
async function waitDownload(client, name, entry) {
  for (;;) {
    const {job} = await client.jobs.retrieve(entry.jobId);
    entry.status=job.status; entry.progress=job.progress; entry.assetId=job.metadata?.assetIds?.[0]; entry.error=job.metadata?.error ?? undefined; entry.lastPolledAt=new Date().toISOString();
    if (TERMINAL.has(job.status)) break;
    console.log(`[${name}] ${job.status} progress=${job.progress??'?'}`); await sleep(15000);
  }
  if (entry.status !== 'success') throw new Error(`[${name}] ended ${entry.status}: ${entry.error}`);
  const bytes = await (await client.assets.retrieve(entry.assetId)).asset.download();
  const raw = path.join(OUT_DIR, `${name}.mp4`); await writeFile(raw, bytes); entry.path=raw; entry.downloadedAt=new Date().toISOString();
  let review = path.join(OUT_DIR, `${name}-review.mp4`);
  if (name.startsWith('video-delay-')) {
    const ms=Number(name.match(/(\d+)/)[1]);
    // Delay video relative to the original audio by padding video start with first frame, keeping original audio untouched.
    await execFileAsync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-i', raw, '-i', SOURCE_AUDIO, '-filter_complex', `[0:v]trim=start=0:end=0.001,setpts=PTS-STARTPTS,loop=loop=${Math.max(1, Math.round(ms/1000*30))}:size=1:start=0,tpad=stop_mode=clone:stop_duration=${ms/1000}[pad];[0:v]setpts=PTS-STARTPTS+${ms/1000}/TB[v0];[pad][v0]overlay=eof_action=pass[v]`, '-map','[v]','-map','1:a:0','-t','20.506','-c:v','libx264','-preset','slow','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart', review]).catch(async()=>{
      await execFileAsync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-itsoffset', String(ms/1000), '-i', raw, '-i', SOURCE_AUDIO, '-map','0:v:0','-map','1:a:0','-t','20.506','-c:v','libx264','-preset','slow','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart', review]);
    });
  } else {
    await execFileAsync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-i', raw, '-vf','scale=720:720', '-c:v','libx264','-preset','slow','-crf','26','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart', review]);
  }
  entry.reviewPath=review;
  console.log(`[${name}] review ${review}`);
}
async function main(){
  const options=parseArgs(process.argv.slice(2)); const client=new Scenario({timeout:120000,maxRetries:2}); const ledger=await loadLedger();
  for (const name of options.variants) {
    const entry=ledger.variants[name] ??= {};
    if (!options.force && entry.reviewPath && await exists(entry.reviewPath)) { console.log(`[${name}] keeping ${entry.reviewPath}`); continue; }
    if (name.startsWith('video-delay-')) { entry.path=SOURCE_VIDEO; entry.reviewPath=''; await waitDownload({jobs:{retrieve:async()=>({job:{status:'success',metadata:{assetIds:['local']}}})}}, name, entry).catch(()=>{}); }
    if (name.startsWith('video-delay-')) {
      const ms=Number(name.match(/(\d+)/)[1]); const review=path.join(OUT_DIR, `${name}-review.mp4`);
      await execFileAsync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-itsoffset', String(ms/1000), '-i', SOURCE_VIDEO, '-i', SOURCE_AUDIO, '-map','0:v:0','-map','1:a:0','-t','20.506','-c:v','libx264','-preset','slow','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart', review]);
      entry.reviewPath=review; entry.kind='postprocess-video-delay'; entry.delayMs=ms; console.log(`[${name}] review ${review}`); await saveLedger(ledger); continue;
    }
    const audio=await makeAudio(name); await uploadAudio(client,audio,name,entry); await saveLedger(ledger); await submit(client,name,entry,options); await saveLedger(ledger); console.log(`[${name}] submitted ${entry.jobId}`); await waitDownload(client,name,entry); await saveLedger(ledger);
  }
}
main().catch(e=>{ console.error(e?.stack??e?.message??String(e)); process.exit(1); });
