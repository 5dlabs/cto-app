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

await exec(`(() => { window.location.reload(); return JSON.stringify({reloading:true}); })()`);
await sleep(1200);
for (let i = 0; i < 4; i += 1) {
  const current = await exec(`(() => JSON.stringify({ heading: document.querySelector('h1')?.textContent?.trim() ?? null }))()`);
  if (current.heading === 'Source') break;
  await exec(`(() => { const button = document.querySelector('button[aria-label="Next setup screen"]'); button?.click(); return JSON.stringify({clicked:Boolean(button)}); })()`);
  await sleep(650);
}
const metrics = await exec(`(() => {
  const content = document.querySelector('.local-bootstrap__content--setup');
  const machine = document.querySelector('.local-bootstrap__machine--ambient');
  const avatar = document.querySelector('.local-bootstrap__avatar');
  const video = document.querySelector('.local-bootstrap__avatar-video');
  const warning = document.querySelector('.local-bootstrap__audio-warning');
  const cs = (el) => el ? getComputedStyle(el) : null;
  const rect = (el) => {
    const r = el?.getBoundingClientRect();
    return r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null;
  };
  return JSON.stringify({
    heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    content: { rect: rect(content), gridTemplateColumns: cs(content)?.gridTemplateColumns ?? null },
    machine: { rect: rect(machine) },
    avatar: { rect: rect(avatar), overflow: cs(avatar)?.overflow ?? null },
    video: { rect: rect(video), objectFit: cs(video)?.objectFit ?? null, src: video?.currentSrc || video?.src || null },
    warning: { rect: rect(warning), position: cs(warning)?.position ?? null },
  });
})()`);
const firstColumn = Number(metrics.content.gridTemplateColumns?.match(/^(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
const ok = metrics.heading === 'Source'
  && firstColumn >= 280
  && metrics.machine.rect?.width >= 280
  && metrics.video.objectFit === 'contain'
  && metrics.avatar.overflow === 'visible'
  && (!metrics.warning.rect || metrics.warning.position === 'relative');
console.log(JSON.stringify({ ok, metrics }, null, 2));
process.exit(ok ? 0 : 1);
