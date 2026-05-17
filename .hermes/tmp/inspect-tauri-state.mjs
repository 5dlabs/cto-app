import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

function normalize(result) {
  return result?.result ?? result?.value ?? result;
}

const code = `(() => {
  const text = (el) => el?.textContent?.replace(/\s+/g, ' ')?.trim() || null;
  const video = document.querySelector('video');
  const buttons = Array.from(document.querySelectorAll('button')).slice(0, 24).map((button) => ({
    text: button.textContent?.replace(/\s+/g, ' ')?.trim() || '',
    aria: button.getAttribute('aria-label'),
    title: button.getAttribute('title'),
    disabled: button.disabled,
    testid: button.getAttribute('data-testid'),
  }));
  const cards = Array.from(document.querySelectorAll('.local-bootstrap__decision-card, [data-testid]')).slice(0, 24).map((el) => ({
    tag: el.tagName,
    testid: el.getAttribute('data-testid'),
    text: el.textContent?.replace(/\s+/g, ' ')?.trim()?.slice(0, 180) || '',
    aria: el.getAttribute('aria-label'),
    title: el.getAttribute('title'),
  }));
  return JSON.stringify({
    url: location.href,
    title: document.title,
    heading: text(document.querySelector('h1')),
    subheading: text(document.querySelector('h2')),
    morganPrompt: text(document.querySelector('.local-bootstrap__decision-card strong, .local-bootstrap__morgan-prompt, [data-testid="morgan-prompt"]')),
    panelTitle: text(document.querySelector('.local-bootstrap__panel h2, .local-bootstrap__panel-title, [data-testid="setup-panel-title"]')),
    statusText: text(document.querySelector('[data-testid="cluster-prep-status"], .local-bootstrap__status, .local-bootstrap__progress, [role="status"]')),
    bodyTextSample: document.body?.textContent?.replace(/\s+/g, ' ')?.trim()?.slice(0, 1000) || '',
    video: video ? {
      currentSrc: video.currentSrc || video.getAttribute('src'),
      paused: video.paused,
      ended: video.ended,
      currentTime: Number(video.currentTime?.toFixed?.(2) ?? video.currentTime),
      duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : null,
      readyState: video.readyState,
      muted: video.muted,
    } : null,
    buttons,
    cards,
  });
})()`;

const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
const normalized = normalize(result);
let payload = normalized;
if (typeof payload === 'string') {
  try { payload = JSON.parse(payload); } catch {}
}
console.log(JSON.stringify(payload, null, 2));
process.exit(0);
