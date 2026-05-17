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
    const disabledContinue = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Continue')?.disabled ?? null;
    const banner = document.querySelector('.local-bootstrap__preview-banner')?.textContent?.trim() ?? null;
    const video = document.querySelector('video');
    return JSON.stringify({ heading, prompt, panelTitle, labels, selected, disabledContinue, banner, video: video ? { src: video.currentSrc || video.src, currentTime: Number(video.currentTime.toFixed(2)), duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : null, paused: video.paused, ended: video.ended } : null });
  })()`);
}

async function clickButtonByStrong(label) {
  return exec(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(label)});
    button?.click();
    return JSON.stringify({ clicked: Boolean(button), disabled: button?.disabled ?? null });
  })()`);
}

async function clickContinue() {
  return exec(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === 'Continue');
    button?.click();
    return JSON.stringify({ clicked: Boolean(button), disabled: button?.disabled ?? null });
  })()`);
}

let before = await state();
if (before.heading !== 'ACP CLIs') {
  console.log(JSON.stringify({ before, skipped: 'not-on-clis' }, null, 2));
  process.exit(0);
}

if (before.video && !before.video.ended && before.video.duration && before.video.currentTime < before.video.duration) {
  await sleep(Math.min(20_000, Math.ceil((before.video.duration - before.video.currentTime) * 1000) + 600));
}

const selected = await clickButtonByStrong('Copilot');
await sleep(2500);
const afterSelect = await state();
const continued = await clickContinue();
await sleep(800);
const afterContinue = await state();
console.log(JSON.stringify({ before, selected, afterSelect, continued, afterContinue }, null, 2));
process.exit(0);
