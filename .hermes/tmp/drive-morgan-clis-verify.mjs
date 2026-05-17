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
    const stage = document.querySelector('[data-testid="morgan-conversation-shell"]')?.className ?? null;
    const prompt = document.querySelector('.local-bootstrap__decision-card strong')?.textContent?.trim() ?? null;
    const panelTitle = document.querySelector('.local-bootstrap__panel-title')?.textContent?.trim() ?? null;
    const labels = Array.from(document.querySelectorAll('button strong')).map((el) => el.textContent?.trim()).filter(Boolean);
    const video = document.querySelector('video');
    return JSON.stringify({ heading, stage, prompt, panelTitle, labels, video: video ? { src: video.currentSrc || video.src, currentTime: Number(video.currentTime.toFixed(2)), duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : null, paused: video.paused, ended: video.ended } : null });
  })()`);
}

async function clickDev(label) {
  await exec(`(() => { document.querySelector('button[aria-label="${label}"]')?.click(); return JSON.stringify({clicked:true}); })()`);
}

async function playMorganMutedFromStart() {
  await exec(`(() => { const v = document.querySelector('video'); if (v) { v.muted = true; try { v.currentTime = 0; void v.play(); } catch (_) {} } return JSON.stringify({ok:true}); })()`);
}

await exec(`(() => { window.location.reload(); return JSON.stringify({reloading:true}); })()`);
await sleep(1200);

const order = ['CTO', 'Source', 'Harnesses', 'ACP CLIs', 'Providers', 'Models', 'Harness routing', 'Provider auth', 'Tool keys', 'Agent tokens'];
for (let i = 0; i < 10; i += 1) {
  const current = await state();
  if (current.heading === 'ACP CLIs') break;
  const currentIndex = order.indexOf(current.heading ?? '');
  const targetIndex = order.indexOf('ACP CLIs');
  if (currentIndex === -1 || currentIndex < targetIndex) {
    await clickDev('Next setup screen');
  } else {
    await clickDev('Previous setup screen');
  }
  await sleep(350);
}
await playMorganMutedFromStart();
await sleep(500);
const finalState = await state();
console.log(JSON.stringify(finalState, null, 2));
process.exit(0);
