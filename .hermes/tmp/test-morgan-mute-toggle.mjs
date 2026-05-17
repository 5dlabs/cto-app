import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

function normalize(result) {
  return result?.result ?? result?.value ?? result;
}

async function exec(code) {
  const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const normalized = normalize(result);
  if (typeof normalized === 'string') {
    try { return JSON.parse(normalized); } catch { return normalized; }
  }
  return normalized;
}

const snapshotCode = `(() => {
  const video = document.querySelector('video');
  const audioButton = Array.from(document.querySelectorAll('button')).find((button) => /Mute Morgan audio|Unmute Morgan audio/.test(button.getAttribute('aria-label') || ''));
  return JSON.stringify({
    aria: audioButton?.getAttribute('aria-label') || null,
    pressed: audioButton?.getAttribute('aria-pressed') || null,
    videoMuted: video?.muted ?? null,
    audioWarning: document.querySelector('.local-bootstrap__audio-warning')?.textContent?.trim() || null,
    bodyHasLocalStack: /local stack/i.test(document.body.textContent || ''),
    bodyHasIntroPrompt: /prepare the Client Cluster first/i.test(document.body.textContent || ''),
  });
})()`;

const before = await exec(snapshotCode);
await exec(`(() => {
  const button = Array.from(document.querySelectorAll('button')).find((button) => /Mute Morgan audio|Unmute Morgan audio/.test(button.getAttribute('aria-label') || ''));
  button?.click();
  return JSON.stringify(true);
})()`);
await new Promise((resolve) => setTimeout(resolve, 100));
const afterFirstClick = await exec(snapshotCode);
await exec(`(() => {
  const button = Array.from(document.querySelectorAll('button')).find((button) => /Mute Morgan audio|Unmute Morgan audio/.test(button.getAttribute('aria-label') || ''));
  button?.click();
  return JSON.stringify(true);
})()`);
await new Promise((resolve) => setTimeout(resolve, 100));
const afterSecondClick = await exec(snapshotCode);
console.log(JSON.stringify({ before, afterFirstClick, afterSecondClick }, null, 2));
process.exit(0);
