import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

async function cmd(command, args) {
  const result = await socketClient.sendCommand(command, args);
  return result?.result ?? result?.value ?? result;
}

const js = `(() => {
  const video = document.querySelector('.local-bootstrap__avatar video');
  const audio = document.querySelector('.local-bootstrap__avatar audio');
  return JSON.stringify({
    url: location.href,
    heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    panelTitle: document.querySelector('.local-bootstrap__panel-title')?.textContent?.trim() ?? null,
    avatarHtml: document.querySelector('.local-bootstrap__avatar')?.innerHTML?.slice(0, 500) ?? null,
    hasFallbackImage: Boolean(document.querySelector('.local-bootstrap__avatar img')),
    video: video ? {
      src: video.currentSrc || video.src,
      key: video.dataset.morganMediaKey,
      readyState: video.readyState,
      networkState: video.networkState,
      muted: video.muted,
      volume: video.volume,
      paused: video.paused,
      ended: video.ended,
      currentTime: video.currentTime,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      error: video.error?.message || video.error?.code || null,
    } : null,
    audio: audio ? {
      src: audio.currentSrc || audio.src,
      key: audio.dataset.morganMediaKey,
      readyState: audio.readyState,
      networkState: audio.networkState,
      paused: audio.paused,
      ended: audio.ended,
      currentTime: audio.currentTime,
      duration: audio.duration,
      error: audio.error?.message || audio.error?.code || null,
    } : null,
  });
})()`;

try {
  await socketClient.connect();
  const raw = await cmd('execute_js', { window_label: 'main', code: js });
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  console.log(text);
} finally {
  try { await socketClient.disconnect?.(); } catch {}
  process.exit(0);
}
