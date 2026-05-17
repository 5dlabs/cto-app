import { writeFileSync } from 'node:fs';
import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

async function exec(code) {
  const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const value = result?.result ?? result?.value ?? result?.content ?? result;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await exec(`(() => {
  window.__ctoMorganAllProbe = [];
  const log = (type, detail = {}) => window.__ctoMorganAllProbe.push({
    t: Math.round(performance.now()),
    type,
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    detail,
  });
  if (!window.__ctoMorganAllOriginalPlay) {
    window.__ctoMorganAllOriginalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      log('media.play.call', {
        tag: this.tagName,
        src: this.currentSrc || this.getAttribute('src'),
        muted: this.muted,
        paused: this.paused,
        currentTime: Number(this.currentTime || 0).toFixed(2),
        readyState: this.readyState,
      });
      const promise = window.__ctoMorganAllOriginalPlay.apply(this, args);
      promise?.then?.(() => log('media.play.resolve', {
        tag: this.tagName,
        src: this.currentSrc || this.getAttribute('src'),
        muted: this.muted,
        paused: this.paused,
        currentTime: Number(this.currentTime || 0).toFixed(2),
        readyState: this.readyState,
      }));
      promise?.catch?.((error) => log('media.play.reject', {
        tag: this.tagName,
        src: this.currentSrc || this.getAttribute('src'),
        name: error?.name,
        message: String(error?.message ?? error),
      }));
      return promise;
    };
    for (const eventName of ['loadstart','loadedmetadata','canplay','play','playing','pause','ended','error','volumechange']) {
      document.addEventListener(eventName, (event) => {
        const target = event.target;
        if (!(target instanceof HTMLMediaElement)) return;
        log('media.' + eventName, {
          tag: target.tagName,
          src: target.currentSrc || target.getAttribute('src'),
          muted: target.muted,
          paused: target.paused,
          currentTime: Number(target.currentTime || 0).toFixed(2),
          duration: Number.isFinite(target.duration) ? Number(target.duration).toFixed(2) : null,
          readyState: target.readyState,
          error: target.error ? { code: target.error.code, message: target.error.message } : null,
        });
      }, true);
    }
  }
  return JSON.stringify({ ok: true, heading: document.querySelector('h1')?.textContent?.trim() ?? '' });
})()`);

async function state() {
  return await exec(`(() => JSON.stringify({
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    banner: document.querySelector('.local-bootstrap__preview-banner')?.textContent?.trim() ?? '',
    media: [...document.querySelectorAll('video,audio')].map((m) => ({
      tag: m.tagName,
      src: m.currentSrc || m.getAttribute('src'),
      muted: m.muted,
      paused: m.paused,
      ended: m.ended,
      currentTime: Number(m.currentTime || 0).toFixed(2),
      duration: Number.isFinite(m.duration) ? Number(m.duration).toFixed(2) : null,
      readyState: m.readyState,
      error: m.error ? { code: m.error.code, message: m.error.message } : null,
    })),
    buttons: [...document.querySelectorAll('.local-bootstrap__dev-control')].map((b) => ({ label: b.getAttribute('aria-label'), disabled: b.disabled })),
  }))()`);
}

async function clickDev(label) {
  return await exec(`(() => {
    const button = [...document.querySelectorAll('.local-bootstrap__dev-control')]
      .find((b) => new RegExp(${JSON.stringify(label)}, 'i').test(b.getAttribute('aria-label') || ''));
    if (!button || button.disabled) return JSON.stringify({ clicked: false, label: ${JSON.stringify(label)}, heading: document.querySelector('h1')?.textContent?.trim() ?? '' });
    button.click();
    return JSON.stringify({ clicked: true, label: ${JSON.stringify(label)}, heading: document.querySelector('h1')?.textContent?.trim() ?? '' });
  })()`);
}

// Return to intro without destructive start-over.
for (let i = 0; i < 15; i++) {
  const current = await state();
  if (current.heading === 'CTO') break;
  const clicked = await clickDev('Previous setup screen');
  if (!clicked.clicked) break;
  await sleep(350);
}

const expected = [
  { heading: 'CTO', slug: '01_intro' },
  { heading: 'Saved access', slug: '02_saved-access' },
  { heading: 'Cloudflare', slug: '03_endpoint' },
  { heading: 'Source', slug: '04_source' },
  { heading: 'Harnesses', slug: '05_harness' },
  { heading: 'ACP CLIs', slug: '06_clis' },
  { heading: 'Providers', slug: '07_providers' },
  { heading: 'Models', slug: '08_provider-models' },
  { heading: 'Harness routing', slug: '09_harness-routing' },
  { heading: 'Provider auth', slug: '10_provider-auth' },
  { heading: 'Tool keys', slug: '11_tools' },
  { heading: 'Agent tokens', slug: '12_agent-tokens' },
];

const snapshots = [];
for (let i = 0; i < expected.length; i++) {
  await sleep(1100);
  const snap = await state();
  const video = snap.media.find((m) => m.tag === 'VIDEO');
  snapshots.push({
    expected: expected[i],
    heading: snap.heading,
    video,
    audio: snap.media.find((m) => m.tag === 'AUDIO'),
    ok: snap.heading === expected[i].heading && Boolean(video?.src?.includes(`/uploads/morgan/${expected[i].slug}/morgan.mp4`)) && video.paused === false && video.error === null,
  });
  if (i < expected.length - 1) {
    await clickDev('Next setup screen');
    await sleep(200);
  }
}

// Leave the workstation at the beginning for the user.
for (let i = 0; i < 15; i++) {
  const current = await state();
  if (current.heading === 'CTO') break;
  const clicked = await clickDev('Previous setup screen');
  if (!clicked.clicked) break;
  await sleep(250);
}
await sleep(700);
const finalState = await state();
const log = await exec(`(() => JSON.stringify(window.__ctoMorganAllProbe ?? []))()`);
const report = { snapshots, finalState, logTail: log.slice(-120) };
writeFileSync('.hermes/tmp/morgan-all-media-live-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: snapshots.every((s) => s.ok),
  count: snapshots.length,
  failures: snapshots.filter((s) => !s.ok),
  finalHeading: finalState.heading,
  reportPath: '.hermes/tmp/morgan-all-media-live-report.json',
}, null, 2));
process.exit(snapshots.every((s) => s.ok) && finalState.heading === 'CTO' ? 0 : 1);
