import { writeFile } from 'node:fs/promises';
import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

async function cmd(command, args) {
  const result = await socketClient.sendCommand(command, args);
  return result?.result ?? result;
}

function unwrapText(result) {
  if (typeof result === 'string') return result;
  if (result?.content?.[0]?.text) return result.content[0].text;
  if (result?.text) return result.text;
  return JSON.stringify(result);
}

const js = `(() => {
  const logs = [];
  const methods = ['log','info','warn','error','debug'];
  if (!window.__ctoConsoleCaptureInstalled) {
    window.__ctoConsoleCaptureInstalled = true;
    window.__ctoConsoleEvents = [];
    for (const method of methods) {
      const original = console[method].bind(console);
      console[method] = (...args) => {
        window.__ctoConsoleEvents.push({
          ts: new Date().toISOString(),
          level: method,
          message: args.map((arg) => {
            try { return typeof arg === 'string' ? arg : JSON.stringify(arg); }
            catch { return String(arg); }
          }).join(' '),
        });
        return original(...args);
      };
    }
    window.addEventListener('error', (event) => {
      window.__ctoConsoleEvents.push({ ts: new Date().toISOString(), level: 'uncaught-error', message: event.message });
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__ctoConsoleEvents.push({ ts: new Date().toISOString(), level: 'unhandledrejection', message: String(event.reason?.message ?? event.reason) });
    });
  }
  const video = document.querySelector('.local-bootstrap__avatar video');
  const audio = document.querySelector('.local-bootstrap__avatar audio');
  return JSON.stringify({
    href: location.href,
    title: document.title,
    heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    panelTitle: document.querySelector('.local-bootstrap__panel-title')?.textContent?.trim() ?? null,
    hasFallbackImage: Boolean(document.querySelector('.local-bootstrap__avatar img')),
    avatarText: document.querySelector('.local-bootstrap__avatar')?.textContent?.trim() ?? '',
    video: video ? {
      outerHTML: video.outerHTML.slice(0, 600),
      src: video.currentSrc || video.src,
      key: video.dataset.morganMediaKey,
      readyState: video.readyState,
      networkState: video.networkState,
      muted: video.muted,
      defaultMuted: video.defaultMuted,
      attrMuted: video.hasAttribute('muted'),
      volume: video.volume,
      paused: video.paused,
      ended: video.ended,
      currentTime: video.currentTime,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      error: video.error ? { code: video.error.code, message: video.error.message } : null,
    } : null,
    audio: audio ? { src: audio.currentSrc || audio.src, paused: audio.paused, error: audio.error?.message ?? null } : null,
    consoleEvents: (window.__ctoConsoleEvents || []).slice(-50),
  });
})()`;

const stateRaw = await cmd('execute_js', { window_label: 'main', code: js, timeout_ms: 5000 });
const stateText = unwrapText(stateRaw);
console.log('STATE_JSON=' + stateText);

try {
  const shot = await cmd('take_screenshot', { window_label: 'main', quality: 92, max_width: 1600, max_size_mb: 10 });
  const text = unwrapText(shot);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const data = jsonMatch ? JSON.parse(jsonMatch[0]) : shot;
  let b64 = data?.data || data?.image || data?.base64 || data?.content?.[0]?.data || data?.content?.[0]?.image;
  if (!b64 && typeof text === 'string') {
    const maybe = text.match(/[A-Za-z0-9+/=]{1000,}/);
    b64 = maybe?.[0];
  }
  if (b64) {
    const path = '/tmp/cto-tauri-morgan-snapshot.jpg';
    await writeFile(path, Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    console.log('SCREENSHOT=' + path);
  } else {
    console.log('SCREENSHOT_RAW=' + JSON.stringify(shot).slice(0, 1000));
  }
} catch (error) {
  console.log('SCREENSHOT_ERROR=' + (error?.stack ?? error?.message ?? String(error)));
}
