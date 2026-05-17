#!/usr/bin/env node
import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const out = resolve(".hermes/tmp/dogfood-postfix-report.json");
mkdirSync(dirname(out), { recursive: true });

async function exec(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  const value = result.result ?? result.content;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}
async function wait(ms) { await new Promise((r) => setTimeout(r, ms)); }
async function main() {
  await exec(`(() => { window.__ctoPostfix = []; const log=(type,detail={})=>window.__ctoPostfix.push({t:Math.round(performance.now()),type,heading:document.querySelector('h1')?.textContent?.trim()??'',detail}); window.__ctoPostfixLog=log; const orig=HTMLMediaElement.prototype.__ctoPostfixOrigPlay || HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.__ctoPostfixOrigPlay=orig; HTMLMediaElement.prototype.play=function(...args){log('play.call',{tag:this.tagName,src:this.currentSrc||this.getAttribute('src'),muted:this.muted,paused:this.paused,currentTime:Number(this.currentTime||0).toFixed(2),readyState:this.readyState}); const p=orig.apply(this,args); p?.catch?.(err=>log('play.reject',{tag:this.tagName,src:this.currentSrc||this.getAttribute('src'),name:err?.name,message:String(err?.message??err)})); return p;}; for (const n of ['loadedmetadata','canplay','play','playing','pause','ended','error']) document.addEventListener(n,e=>{const el=e.target; if(el instanceof HTMLMediaElement) log(n,{tag:el.tagName,src:el.currentSrc||el.getAttribute('src'),muted:el.muted,paused:el.paused,currentTime:Number(el.currentTime||0).toFixed(2),duration:Number.isFinite(el.duration)?Number(el.duration).toFixed(2):null,readyState:el.readyState,error:el.error?{code:el.error.code,message:el.error.message}:null});},true); return true; })()`);
  await exec(`(() => { const next = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('title') === 'Next setup screen'); next?.click(); return true; })()`);
  await wait(3500);
  const state = await exec(`(() => ({ heading: document.querySelector('h1')?.textContent?.trim() ?? '', text: (document.body?.innerText ?? '').replace(/\\s+/g,' ').slice(0,500), media: Array.from(document.querySelectorAll('video,audio')).map(el=>({tag:el.tagName,src:el.currentSrc||el.getAttribute('src'),paused:el.paused,muted:el.muted,currentTime:Number(el.currentTime||0).toFixed(2),duration:Number.isFinite(el.duration)?Number(el.duration).toFixed(2):null,readyState:el.readyState,error:el.error?{code:el.error.code,message:el.error.message}:null})), events: window.__ctoPostfix ?? [] }))()`);
  writeFileSync(out, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ out, heading: state.heading, media: state.media, events: state.events.length }, null, 2));
}
try { await main(); } finally { socketClient.client?.destroy?.(); socketClient.client?.end?.(); }
process.exit(0);
