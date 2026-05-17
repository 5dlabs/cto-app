import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function exec(code) {
  const raw = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const value = raw?.result ?? raw?.value ?? raw;
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return value; }
}
async function snapshot(label) {
  const state = await exec(`(() => {
    const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => ({ text: b.textContent.trim().replace(/\s+/g, ' '), aria: b.getAttribute('aria-label'), title: b.getAttribute('title'), disabled: b.disabled, testid: b.getAttribute('data-testid') })).filter((b) => b.text || b.aria || b.title || b.testid);
    const video = document.querySelector('video');
    return JSON.stringify({ label: ${JSON.stringify(label)}, heading: text('h1'), prompt: text('.local-bootstrap__decision-card strong') || text('.local-bootstrap__setup-panel h2') || text('.local-bootstrap__setup-panel h3'), video: video ? { src: video.currentSrc || video.src, paused: video.paused, ended: video.ended, currentTime: Number(video.currentTime.toFixed(1)), duration: Number((video.duration || 0).toFixed(1)) } : null, buttons });
  })()`);
  console.log(JSON.stringify(state, null, 2));
  return state;
}
async function clickFirst(label, matcher) {
  const result = await exec(`(() => {
    const matcher = ${matcher};
    const button = Array.from(document.querySelectorAll('button')).find(matcher);
    if (button && !button.disabled) { button.scrollIntoView({ block: 'center', inline: 'center' }); button.click(); }
    return JSON.stringify({ label: ${JSON.stringify(label)}, clicked: Boolean(button && !button.disabled), disabled: Boolean(button?.disabled), matched: button?.textContent?.trim().replace(/\s+/g, ' ') || button?.getAttribute('aria-label') || button?.getAttribute('title') || null });
  })()`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

await snapshot('paused on Source auth branch');
await clickFirst('continue via explicit title', `(b) => ((b.textContent || '').trim() === 'Continue' || (b.getAttribute('title') || '').includes('Continue to harness selection'))`);
await wait(2500);
let state = await snapshot('after explicit Continue attempt');
if (state.heading === 'Source') {
  await clickFirst('use top next arrow fallback', `(b) => (b.getAttribute('aria-label') || '') === 'Next setup screen'`);
  await wait(4500);
  state = await snapshot('after Next arrow fallback');
}
process.exit(0);
