import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
import { writeFileSync } from "node:fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function exec(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  const value = result.result ?? result.content;
  return JSON.parse(String(value));
}
try {
  const runId = Date.now();
  await socketClient.sendCommand("execute_js", { window_label: "main", code: `location.href='http://localhost:5173/?setupDemo=1&run=${runId}'; 'ok';` });
  socketClient.client?.end?.(); socketClient.client = undefined;
  await wait(1200);
  const start = await exec(`(() => JSON.stringify({
    url: location.href,
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    text: (document.body?.innerText ?? '').slice(0, 1000),
    videos: Array.from(document.querySelectorAll('video')).map(v => ({src:v.currentSrc||v.getAttribute('src'), muted:v.muted, paused:v.paused, ended:v.ended, t:Number(v.currentTime||0).toFixed(2), readyState:v.readyState})),
    audios: Array.from(document.querySelectorAll('audio')).map(a => ({src:a.currentSrc||a.getAttribute('src'), muted:a.muted, paused:a.paused, ended:a.ended, t:Number(a.currentTime||0).toFixed(2), readyState:a.readyState}))
  }))()`);
  await wait(5000);
  const end = await exec(`(() => JSON.stringify({
    url: location.href,
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    text: (document.body?.innerText ?? '').slice(0, 2000),
    buttons: Array.from(document.querySelectorAll('button')).map(b => ({text:(b.textContent||'').trim(), title:b.getAttribute('title')||'', aria:b.getAttribute('aria-label')||'', disabled:b.disabled})),
    videos: Array.from(document.querySelectorAll('video')).map(v => ({src:v.currentSrc||v.getAttribute('src'), muted:v.muted, paused:v.paused, ended:v.ended, t:Number(v.currentTime||0).toFixed(2), readyState:v.readyState})),
    audios: Array.from(document.querySelectorAll('audio')).map(a => ({src:a.currentSrc||a.getAttribute('src'), muted:a.muted, paused:a.paused, ended:a.ended, t:Number(a.currentTime||0).toFixed(2), readyState:a.readyState}))
  }))()`);
  const evidence = { start, end };
  writeFileSync('.hermes/tmp/fast-demo-verification.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ startHeading:start.heading, startVideo:start.videos[0], endHeading:end.heading, endText:end.text.slice(0,400), endVideoCount:end.videos.length, endAudioCount:end.audios.length }, null, 2));
} finally {
  socketClient.client?.end?.();
  setTimeout(() => process.exit(0), 50);
}
