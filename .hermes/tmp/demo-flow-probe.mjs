import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
import { writeFileSync } from "node:fs";

async function exec(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  const value = result.result ?? result.content;
  try { return JSON.parse(String(value)); } catch { return value; }
}

try {
  await exec(`(() => {
    window.__ctoDemoProbe = [];
    window.__ctoDemoOriginalPlay ??= HTMLMediaElement.prototype.play;
    const log = (type, detail = {}) => window.__ctoDemoProbe.push({
      t: Math.round(performance.now()),
      type,
      heading: document.querySelector('h1')?.textContent?.trim() ?? '',
      detail,
    });
    HTMLMediaElement.prototype.play = function (...args) {
      log('media.play.call', {
        tag: this.tagName,
        src: this.currentSrc || this.getAttribute('src'),
        muted: this.muted,
        paused: this.paused,
        currentTime: Number(this.currentTime || 0).toFixed(2),
        readyState: this.readyState,
      });
      const promise = window.__ctoDemoOriginalPlay.apply(this, args);
      promise?.then?.(() => log('media.play.resolve', {
        tag: this.tagName,
        src: this.currentSrc || this.getAttribute('src'),
        muted: this.muted,
        paused: this.paused,
        currentTime: Number(this.currentTime || 0).toFixed(2),
        readyState: this.readyState,
      }));
      promise?.catch?.((error) => log('media.play.reject', {
        src: this.currentSrc || this.getAttribute('src'),
        name: error?.name,
        message: String(error?.message ?? error),
      }));
      return promise;
    };
    for (const eventName of ['loadedmetadata','canplay','play','playing','pause','ended','error','volumechange']) {
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
    window.history.replaceState(null, '', window.location.pathname + '?setupDemo=1');
    log('probe.installed', { url: location.href });
    return JSON.stringify({ ok: true });
  })()`);

  const result = await exec(`(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clickBy = (matcher) => {
      const match = Array.from(document.querySelectorAll('button')).find((button) => !button.disabled && matcher((button.textContent || '').trim(), button.getAttribute('title') || '', button.getAttribute('aria-label') || ''));
      if (!match) return false;
      match.click();
      return true;
    };
    clickBy((text, title, aria) => /Prepare|Retry/i.test(text) || /Prepare Client Cluster baseline/i.test(title + ' ' + aria));
    await delay(5000);
    return JSON.stringify({
      url: location.href,
      heading: document.querySelector('h1')?.textContent?.trim() ?? '',
      text: (document.body?.innerText ?? '').slice(0, 2000),
      buttons: Array.from(document.querySelectorAll('button')).map((button) => ({ text: (button.textContent || '').trim(), title: button.getAttribute('title') || '', aria: button.getAttribute('aria-label') || '', disabled: button.disabled })),
      videos: Array.from(document.querySelectorAll('video')).map((media) => ({ src: media.currentSrc || media.getAttribute('src'), muted: media.muted, paused: media.paused, ended: media.ended, currentTime: media.currentTime, readyState: media.readyState })),
      audios: Array.from(document.querySelectorAll('audio')).map((media) => ({ src: media.currentSrc || media.getAttribute('src'), muted: media.muted, paused: media.paused, ended: media.ended, currentTime: media.currentTime, readyState: media.readyState })),
      events: window.__ctoDemoProbe ?? [],
    });
  })()`);
  writeFileSync('.hermes/tmp/demo-flow-probe.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ heading: result.heading, eventCount: result.events?.length ?? 0, text: result.text?.slice(0, 300), videos: result.videos, audios: result.audios }, null, 2));
} finally {
  socketClient.client?.end?.();
  setTimeout(() => process.exit(0), 50);
}
