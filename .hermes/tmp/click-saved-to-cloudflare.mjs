import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
function normalize(result) { return result?.result ?? result?.value ?? result; }
async function exec(code) {
  const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  let payload = normalize(result);
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch {} }
  return payload;
}
const after = await exec(`(() => {
  const text = (el) => el?.textContent?.replace(/\\s+/g, ' ')?.trim() || null;
  const button = document.querySelector('[data-testid="saved-access-continue"]');
  if (button && !button.disabled) button.click();
  return JSON.stringify({ clicked: Boolean(button && !button.disabled), title: button?.getAttribute('title') || null });
})()`);
await new Promise((resolve) => setTimeout(resolve, 500));
const state = await exec(`(() => {
  const text = (el) => el?.textContent?.replace(/\\s+/g, ' ')?.trim() || null;
  return JSON.stringify({
    heading: text(document.querySelector('h1')),
    panelTitle: text(document.querySelector('.local-bootstrap__panel-title')),
    body: document.body?.textContent?.replace(/\\s+/g, ' ')?.trim()?.slice(0, 600) || '',
    video: document.querySelector('video')?.getAttribute('src') || document.querySelector('video')?.currentSrc || null,
    buttons: Array.from(document.querySelectorAll('button')).map((button) => ({ text: text(button)||'', aria: button.getAttribute('aria-label'), title: button.getAttribute('title'), disabled: button.disabled, testid: button.getAttribute('data-testid') })).slice(0, 18),
  });
})()`);
console.log(JSON.stringify({ click: after, state }, null, 2));
process.exit(0);
