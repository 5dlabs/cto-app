import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
import { writeFileSync } from "node:fs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resetClient() {
  try { socketClient.client?.end?.(); } catch {}
  socketClient.client = undefined;
  await delay(150);
}

async function execRaw(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  return result.result ?? result.content;
}

async function execJson(code) {
  const value = await execRaw(code);
  return JSON.parse(String(value));
}

try {
  const runId = String(Date.now());
  await execRaw(`location.href = 'http://localhost:5173/?setupDemo=1&verify=${runId}'; 'reloading';`);
  await resetClient();
  await delay(700);

  const installed = await execJson(`(() => {
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
        ended: this.ended,
        currentTime: Number(this.currentTime || 0).toFixed(2),
        readyState: this.readyState,
      });
      const promise = window.__ctoDemoOriginalPlay.apply(this, args);
      promise?.then?.(() => log('media.play.resolve', {
        tag: this.tagName,
        src: this.currentSrc || this.getAttribute('src'),
        muted: this.muted,
        paused: this.paused,
        ended: this.ended,
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
    if (!window.__ctoDemoProbeListenersInstalled) {
      window.__ctoDemoProbeListenersInstalled = true;
      for (const eventName of ['loadedmetadata','canplay','play','playing','pause','ended','error','volumechange']) {
        document.addEventListener(eventName, (event) => {
          const target = event.target;
          if (!(target instanceof HTMLMediaElement)) return;
          log('media.' + eventName, {
            tag: target.tagName,
            src: target.currentSrc || target.getAttribute('src'),
            muted: target.muted,
            paused: target.paused,
            ended: target.ended,
            currentTime: Number(target.currentTime || 0).toFixed(2),
            duration: Number.isFinite(target.duration) ? Number(target.duration).toFixed(2) : null,
            readyState: target.readyState,
            error: target.error ? { code: target.error.code, message: target.error.message } : null,
          });
        }, true);
      }
    }
    log('probe.installed', { url: location.href });
    return JSON.stringify({
      url: location.href,
      heading: document.querySelector('h1')?.textContent?.trim() ?? '',
      text: (document.body?.innerText ?? '').slice(0, 500),
      videos: document.querySelectorAll('video').length,
      audios: document.querySelectorAll('audio').length,
    });
  })()`);

  await delay(6500);

  const snapshot = await execJson(`(() => JSON.stringify({
    url: location.href,
    title: document.title,
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    text: (document.body?.innerText ?? '').slice(0, 2500),
    buttons: Array.from(document.querySelectorAll('button')).slice(0, 30).map((button) => ({
      text: (button.textContent || '').trim(),
      title: button.getAttribute('title') || '',
      aria: button.getAttribute('aria-label') || '',
      disabled: button.disabled,
    })),
    videos: Array.from(document.querySelectorAll('video')).map((media) => ({
      src: media.currentSrc || media.getAttribute('src'),
      muted: media.muted,
      paused: media.paused,
      ended: media.ended,
      currentTime: Number(media.currentTime || 0).toFixed(2),
      readyState: media.readyState,
    })),
    audios: Array.from(document.querySelectorAll('audio')).map((media) => ({
      src: media.currentSrc || media.getAttribute('src'),
      muted: media.muted,
      paused: media.paused,
      ended: media.ended,
      currentTime: Number(media.currentTime || 0).toFixed(2),
      readyState: media.readyState,
    })),
    events: window.__ctoDemoProbe ?? [],
  }))()`);

  const evidence = { installed, snapshot };
  writeFileSync('.hermes/tmp/demo-flow-live-verification.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({
    installed,
    final: {
      url: snapshot.url,
      heading: snapshot.heading,
      textStart: snapshot.text.slice(0, 500),
      videoCount: snapshot.videos.length,
      audioCount: snapshot.audios.length,
      eventCount: snapshot.events.length,
      playCalls: snapshot.events.filter((event) => event.type === 'media.play.call').length,
      playingEvents: snapshot.events.filter((event) => event.type === 'media.playing').length,
    },
  }, null, 2));
} finally {
  await resetClient();
  process.exit(0);
}
