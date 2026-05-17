import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const wait=(ms)=>new Promise((r)=>setTimeout(r,ms));
async function exec(code){const raw=await socketClient.sendCommand('execute_js',{window_label:'main',code});const value=raw?.result??raw?.value??raw;try{return typeof value==='string'?JSON.parse(value):value}catch{return value}}
async function snap(label){const s=await exec(`(()=>{const text=(sel)=>document.querySelector(sel)?.textContent?.trim()??null;const buttons=Array.from(document.querySelectorAll('button')).map((b)=>({text:b.textContent.trim().replace(/\s+/g,' '),aria:b.getAttribute('aria-label'),title:b.getAttribute('title'),disabled:b.disabled,testid:b.getAttribute('data-testid'),cls:b.className})).filter((b)=>b.text||b.aria||b.title||b.testid);const video=document.querySelector('video');return JSON.stringify({label:${JSON.stringify(label)},heading:text('h1'),prompt:text('.local-bootstrap__decision-card strong')||text('.local-bootstrap__setup-panel h2')||text('.local-bootstrap__setup-panel h3'),video:video?{src:video.currentSrc||video.src,paused:video.paused,ended:video.ended,currentTime:Number(video.currentTime.toFixed(1)),duration:Number((video.duration||0).toFixed(1))}:null,buttons});})()`);console.log(JSON.stringify(s,null,2));return s}
async function click(label,predicate){const r=await exec(`(()=>{const button=Array.from(document.querySelectorAll('button')).find(${predicate});if(button&&!button.disabled){button.scrollIntoView({block:'center',inline:'center'});button.click();}return JSON.stringify({label:${JSON.stringify(label)},clicked:Boolean(button&&!button.disabled),disabled:Boolean(button?.disabled),matched:button?.textContent?.trim().replace(/\s+/g,' ')||button?.getAttribute('aria-label')||button?.getAttribute('title')||null});})()`);console.log(JSON.stringify(r,null,2));return r}

await click('reselect GitHub source provider', `(b)=>b.getAttribute('data-testid')==='source-provider-github'`);
await wait(1500);
await snap('after reselecting GitHub provider');
await click('continue with top next arrow for observed flow', `(b)=>(b.getAttribute('aria-label')||'')==='Next setup screen'`);
await wait(6500);
await snap('Harnesses after top next arrow');
await wait(7000);
await click('select Hermes harness', `(b)=>/hermes/i.test(b.textContent||'')`);
await wait(2000);
await snap('after selecting Hermes');
await click('continue to ACP CLIs', `(b)=>(b.textContent||'').trim()==='Continue' && /(ACP CLIs|providers)/i.test(b.getAttribute('title')||'')`);
await wait(6500);
await snap('ACP CLIs after continue');
process.exit(0);
