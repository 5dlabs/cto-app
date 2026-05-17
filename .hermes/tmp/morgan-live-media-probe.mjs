import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

async function exec(code) {
  const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const value = result?.result ?? result?.value ?? result?.content ?? result;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

const installResult = await exec(`(() => {
  window.__ctoMorganMediaProbe = [];
  const log = (type, detail = {}) => window.__ctoMorganMediaProbe.push({
    t: Math.round(performance.now()),
    type,
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    detail,
  });
  if (!window.__ctoMorganOriginalPlay) {
    window.__ctoMorganOriginalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      log('media.play.call', {
        tag: this.tagName,
        src: this.currentSrc || this.getAttribute('src'),
        muted: this.muted,
        paused: this.paused,
        currentTime: Number(this.currentTime || 0).toFixed(2),
        readyState: this.readyState,
      });
      const promise = window.__ctoMorganOriginalPlay.apply(this, args);
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
  return JSON.stringify({ installed: true, href: location.href, heading: document.querySelector('h1')?.textContent?.trim() ?? '' });
})()`);

const before = await exec(`(() => JSON.stringify({
  href: location.href,
  heading: document.querySelector('h1')?.textContent?.trim() ?? '',
  title: document.title,
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
  devButtons: [...document.querySelectorAll('.local-bootstrap__dev-control')].map((b) => ({ title: b.getAttribute('title'), label: b.getAttribute('aria-label'), disabled: b.disabled }))
}))()`);

await exec(`(() => {
  const next = [...document.querySelectorAll('.local-bootstrap__dev-control')].find((b) => /Next setup screen/i.test(b.getAttribute('aria-label') || ''));
  if (next && !next.disabled) next.click();
  return JSON.stringify({ clickedNext: Boolean(next && !next.disabled), heading: document.querySelector('h1')?.textContent?.trim() ?? '' });
})()`);

await new Promise((resolve) => setTimeout(resolve, 1800));

const after = await exec(`(() => JSON.stringify({
  href: location.href,
  heading: document.querySelector('h1')?.textContent?.trim() ?? '',
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
  log: window.__ctoMorganMediaProbe.slice(-80),
}))()`);

console.log(JSON.stringify({ installResult, before, after }, null, 2));
process.exit(0);
