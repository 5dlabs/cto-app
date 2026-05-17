import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

async function exec(code) {
  const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const value = result?.result ?? result?.value ?? result;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

const state = await exec(`(() => {
  const devNext = document.querySelector('button[aria-label="Next setup screen"]');
  for (let i = 0; i < 2; i += 1) devNext?.click();
  const video = document.querySelector('video');
  if (video) { video.muted = true; video.currentTime = 0; void video.play().catch(() => {}); }
  return new Promise((resolve) => setTimeout(() => {
    const heading = document.querySelector('h1')?.textContent?.trim() ?? null;
    const stage = document.querySelector('[data-testid="morgan-conversation-shell"]')?.className ?? null;
    const prompt = document.querySelector('.local-bootstrap__decision-card strong')?.textContent?.trim() ?? null;
    const panelTitle = document.querySelector('.local-bootstrap__panel-title')?.textContent?.trim() ?? null;
    const labels = Array.from(document.querySelectorAll('button strong')).map((el) => el.textContent?.trim()).filter(Boolean);
    const video = document.querySelector('video');
    resolve(JSON.stringify({ heading, stage, prompt, panelTitle, labels, video: video ? { src: video.currentSrc || video.src, currentTime: video.currentTime, duration: video.duration, paused: video.paused, ended: video.ended } : null }));
  }, 300));
})()`);
console.log(JSON.stringify(state, null, 2));
process.exit(0);
