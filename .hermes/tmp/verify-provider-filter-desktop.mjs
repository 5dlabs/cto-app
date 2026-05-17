import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function exec(code) {
  const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const value = result?.result ?? result?.value ?? result;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

async function state() {
  return exec(`(() => {
    const heading = document.querySelector('h1')?.textContent?.trim() ?? null;
    const prompt = document.querySelector('.local-bootstrap__decision-card strong')?.textContent?.trim() ?? null;
    const panelTitle = document.querySelector('.local-bootstrap__panel-title')?.textContent?.trim() ?? null;
    const labels = Array.from(document.querySelectorAll('button strong')).map((el) => el.textContent?.trim()).filter(Boolean);
    const selected = Array.from(document.querySelectorAll('.is-selected strong')).map((el) => el.textContent?.trim()).filter(Boolean);
    const banner = document.querySelector('.local-bootstrap__preview-banner')?.textContent?.trim() ?? null;
    const hint = document.querySelector('.local-bootstrap__panel-hint')?.textContent?.trim() ?? null;
    const showAll = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('Show all providers'))?.textContent?.trim() ?? null;
    const video = document.querySelector('video');
    return JSON.stringify({ heading, prompt, panelTitle, labels, selected, banner, hint, showAll, video: video ? { src: video.currentSrc || video.src, currentTime: Number(video.currentTime.toFixed(2)), duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : null, paused: video.paused, ended: video.ended } : null });
  })()`);
}

async function clickDevNext() {
  return exec(`(() => { const button = document.querySelector('button[aria-label="Next setup screen"]'); button?.click(); return JSON.stringify({clicked:Boolean(button), disabled:button?.disabled ?? null}); })()`);
}

async function clickStrong(label) {
  return exec(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(label)});
    button?.click();
    return JSON.stringify({ clicked: Boolean(button), disabled: button?.disabled ?? null });
  })()`);
}

async function clickText(label) {
  return exec(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
    button?.click();
    return JSON.stringify({ clicked: Boolean(button), disabled: button?.disabled ?? null });
  })()`);
}

await exec(`(() => { window.location.reload(); return JSON.stringify({reloading:true}); })()`);
await sleep(1000);
const seen = [];
for (let i = 0; i < 8; i += 1) {
  const current = await state();
  seen.push({ i, heading: current.heading, labels: current.labels, video: current.video?.src });
  if (current.heading === 'ACP CLIs') break;
  await clickDevNext();
  await sleep(700);
}
const atClis = await state();
if (atClis.heading !== 'ACP CLIs') {
  console.log(JSON.stringify({ seen, atClis, error: 'failed-to-reach-clis' }, null, 2));
  process.exit(1);
}
await clickStrong('Copilot');
await sleep(1200);
await clickText('Continue');
await sleep(1400);
const providers = await state();
const ok = providers.heading === 'Providers'
  && providers.labels.includes('GitHub Copilot')
  && providers.labels.length <= 13
  && providers.showAll?.includes('Show all providers')
  && providers.hint?.includes('recommended providers');
console.log(JSON.stringify({ ok, seen, atClis, providers }, null, 2));
process.exit(ok ? 0 : 1);
