import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function exec(code) {
  const raw = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const value = raw?.result ?? raw?.value ?? raw;
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return value; }
}
async function snapshot(label) {
  const s = await exec(`(() => {
    const text=(sel)=>document.querySelector(sel)?.textContent?.trim()??null;
    const buttons=Array.from(document.querySelectorAll('button')).map((b)=>({text:b.textContent.trim().replace(/\s+/g,' '),aria:b.getAttribute('aria-label'),title:b.getAttribute('title'),disabled:b.disabled,testid:b.getAttribute('data-testid')})).filter((b)=>b.text||b.aria||b.title||b.testid);
    const video=document.querySelector('video');
    return JSON.stringify({label:${JSON.stringify(label)},heading:text('h1'),prompt:text('.local-bootstrap__decision-card strong')||text('.local-bootstrap__setup-panel h2')||text('.local-bootstrap__setup-panel h3'),video:video?{src:video.currentSrc||video.src,paused:video.paused,ended:video.ended,currentTime:Number(video.currentTime.toFixed(1)),duration:Number((video.duration||0).toFixed(1))}:null,buttons});
  })()`);
  console.log(JSON.stringify(s,null,2)); return s;
}
async function click(label, regexes) {
  const r = await exec(`(() => {
    const patterns=${JSON.stringify(regexes)}.map((p)=>new RegExp(p,'i'));
    const button=Array.from(document.querySelectorAll('button')).find((b)=>patterns.some((p)=>p.test((b.textContent||'')+' '+(b.getAttribute('title')||'')+' '+(b.getAttribute('aria-label')||'')+' '+(b.getAttribute('data-testid')||''))));
    if(button&&!button.disabled){button.scrollIntoView({block:'center',inline:'center'});button.click();}
    return JSON.stringify({label:${JSON.stringify(label)},clicked:Boolean(button&&!button.disabled),disabled:Boolean(button?.disabled),matched:button?.textContent?.trim().replace(/\s+/g,' ')||button?.getAttribute('title')||button?.getAttribute('aria-label')||null});
  })()`);
  console.log(JSON.stringify(r,null,2)); return r;
}

await snapshot('on Harnesses; waiting so Morgan can finish the harness narration');
await wait(9000);
await click('select Hermes harness', ['Herme', 'Hermes']);
await wait(2500);
await snapshot('after Hermes harness selection');
await click('continue to ACP CLIs', ['^\\s*Continue\\s*$', 'Continue to ACP CLIs']);
await wait(6500);
await snapshot('arrived on ACP CLIs');
process.exit(0);
