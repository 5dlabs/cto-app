import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
async function executeJs(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  return result.result ?? result.content;
}
const code = String.raw`(() => {
  const heading = document.querySelector('h1')?.textContent?.trim() ?? '';
  const text = document.body?.innerText ?? '';
  const visibleButtons = Array.from(document.querySelectorAll('button')).filter((b) => b.getClientRects().length > 0).map((button) => ({
    text: (button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    title: button.getAttribute('title') || '',
    aria: button.getAttribute('aria-label') || '',
    testId: button.getAttribute('data-testid') || '',
    disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true'),
  }));
  const video = document.querySelector('video');
  return JSON.stringify({
    heading,
    text: text.slice(0, 1200),
    visibleButtons,
    video: video ? {src: video.currentSrc || video.getAttribute('src') || '', paused: video.paused, muted: video.muted, currentTime: video.currentTime, duration: video.duration, readyState: video.readyState} : null,
  });
})()`;
try { console.log(await executeJs(code)); } finally { socketClient.client?.end?.(); process.exit(0); }
