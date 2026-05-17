import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";

async function executeJs(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  return result.result ?? result.content;
}

const code = String.raw`(() => {
  const text = document.body?.innerText ?? '';
  const heading = document.querySelector('h1')?.textContent?.trim() ?? '';
  const buttons = Array.from(document.querySelectorAll('button')).map((button) => ({
    text: (button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    title: button.getAttribute('title') || '',
    aria: button.getAttribute('aria-label') || '',
    testId: button.getAttribute('data-testid') || '',
    disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true'),
    visible: button.getClientRects().length > 0,
  }));
  const videos = Array.from(document.querySelectorAll('video')).map((video) => ({
    src: video.currentSrc || video.getAttribute('src') || '',
    paused: video.paused,
    muted: video.muted,
    currentTime: video.currentTime,
    duration: video.duration,
    readyState: video.readyState,
    visible: video.getClientRects().length > 0,
  }));
  return JSON.stringify({ title: document.title, url: location.href, heading, text: text.slice(0, 2000), buttons, videos });
})()`;

try {
  const raw = await executeJs(code);
  console.log(typeof raw === 'string' ? raw : JSON.stringify(raw));
} finally {
  socketClient.client?.end?.();
}
