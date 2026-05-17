import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
async function executeJs(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  return result.result ?? result.content;
}
const inspect = String.raw`(() => {
  const video = document.querySelector('video');
  const buttons = Array.from(document.querySelectorAll('button')).filter((button) => button.getClientRects().length > 0).map((button) => ({
    text: (button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
    title: button.getAttribute('title') || '',
    aria: button.getAttribute('aria-label') || '',
    testId: button.getAttribute('data-testid') || '',
    disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true'),
  }));
  return JSON.stringify({
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    text: (document.body?.innerText ?? '').slice(0, 1200),
    buttons,
    video: video ? {src: video.currentSrc || video.getAttribute('src') || '', paused: video.paused, muted: video.muted, currentTime: video.currentTime, duration: video.duration, readyState: video.readyState, visible: video.getClientRects().length > 0} : null,
  });
})()`;
try { console.log(await executeJs(inspect)); } finally { socketClient.client?.end?.(); process.exit(0); }
