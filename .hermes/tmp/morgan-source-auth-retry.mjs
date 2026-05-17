import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function exec(code) { const raw = await socketClient.sendCommand('execute_js', { window_label: 'main', code }); const value = raw?.result ?? raw?.value ?? raw; try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return value; } }
async function snap(label) { const s = await exec(`(() => { const text=(sel)=>document.querySelector(sel)?.textContent?.trim()??null; const buttons=Array.from(document.querySelectorAll('button')).map((b)=>({text:b.textContent.trim().replace(/\s+/g,' '),aria:b.getAttribute('aria-label'),title:b.getAttribute('title'),disabled:b.disabled,testid:b.getAttribute('data-testid')})).filter((b)=>b.text||b.aria||b.title||b.testid); const video=document.querySelector('video'); return JSON.stringify({label:${JSON.stringify(label)},heading:text('h1'),prompt:text('.local-bootstrap__decision-card strong')||text('.local-bootstrap__setup-panel h2')||text('.local-bootstrap__setup-panel h3'),message:text('.local-bootstrap__credential-status')||text('.local-bootstrap__oauth-code-card')||text('.field__help'), video: video?{src:video.currentSrc||video.src,paused:video.paused,ended:video.ended,currentTime:Number(video.currentTime.toFixed(1)),duration:Number((video.duration||0).toFixed(1))}:null,buttons}); })()`); console.log(JSON.stringify(s,null,2)); return s; }
async function click(label, predicate) { const r=await exec(`(() => { const button=Array.from(document.querySelectorAll('button')).find(${predicate}); if(button&&!button.disabled){button.scrollIntoView({block:'center',inline:'center'});button.click();} return JSON.stringify({label:${JSON.stringify(label)},clicked:Boolean(button&&!button.disabled),disabled:Boolean(button?.disabled),matched:button?.textContent?.trim().replace(/\s+/g,' ')||button?.getAttribute('aria-label')||button?.getAttribute('title')||null}); })()`); console.log(JSON.stringify(r,null,2)); return r; }

await snap('before resetting stale GitHub auth');
await click('reset GitHub authorization', `(b)=>/reset authorization/i.test(b.textContent||'')`);
await wait(1000);
await snap('after reset');
await click('start GitHub authorization again', `(b)=>(b.getAttribute('data-testid')==='source-github-sign-in'||/sign in with github|add github token/i.test(b.textContent||''))`);
await wait(8000);
let state = await snap('after GitHub auth retry wait');
if (state.heading === 'Source' && state.buttons?.some((b)=>b.text==='Continue' && !b.disabled)) {
  await click('continue after GitHub auth retry', `(b)=>(b.textContent||'').trim()==='Continue'`);
  await wait(5000);
  state = await snap('after continuing to harness');
}
process.exit(0);
