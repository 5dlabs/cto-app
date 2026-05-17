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
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => ({
      text: b.textContent.trim().replace(/\s+/g, ' '),
      aria: b.getAttribute('aria-label'),
      title: b.getAttribute('title'),
      disabled: b.disabled,
      testid: b.getAttribute('data-testid'),
    })).filter((b) => b.text || b.aria || b.title || b.testid);
    const video = document.querySelector('video');
    return JSON.stringify({
      label: ${JSON.stringify(label)},
      heading: text('h1'),
      prompt: text('.local-bootstrap__decision-card strong') || text('.local-bootstrap__setup-panel h2') || text('.local-bootstrap__setup-panel h3'),
      video: video ? { src: video.currentSrc || video.src, paused: video.paused, ended: video.ended, currentTime: Number(video.currentTime.toFixed(1)), duration: Number((video.duration || 0).toFixed(1)) } : null,
      buttons,
    });
  })()`);
  console.log(JSON.stringify(state, null, 2));
  return state;
}

async function clickByText(label, patterns) {
  const result = await exec(`(() => {
    const patterns = ${JSON.stringify(patterns)}.map((p) => new RegExp(p, 'i'));
    const buttons = Array.from(document.querySelectorAll('button'));
    const button = buttons.find((b) => patterns.some((p) => p.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.getAttribute('data-testid') || ''))));
    if (button) { button.scrollIntoView({ block: 'center', inline: 'center' }); button.click(); }
    return JSON.stringify({ label: ${JSON.stringify(label)}, clicked: Boolean(button), matched: button?.textContent?.trim().replace(/\s+/g, ' ') || button?.getAttribute('aria-label') || button?.getAttribute('title') || null });
  })()`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

await snapshot('starting screen');
await exec(`(() => { const video = document.querySelector('video'); if (video) { video.muted = false; video.play?.().catch(() => {}); } return JSON.stringify({played: Boolean(video)}); })()`);
console.log('Morgan intro/source media is visible now; pausing for observation.');
await wait(9000);
await clickByText('choose GitHub source', ['^\\s*GitHub\\s*github\\.com', '^\\s*GitHub\\s*$']);
await wait(2500);
await snapshot('after GitHub selection');
await wait(5000);
await clickByText('continue from Source', ['^\\s*Continue\\s*$']);
await wait(4500);
await snapshot('after Source continue');
process.exit(0);
