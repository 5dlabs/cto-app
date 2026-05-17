import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
async function executeJs(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  return result.result ?? result.content;
}
const resetIntro = String.raw`(() => {
  const buttonText = (button) => (button.textContent || '') + ' ' + (button.getAttribute('title') || '') + ' ' + (button.getAttribute('aria-label') || '');
  const buttons = () => Array.from(document.querySelectorAll('button'));
  const previous = buttons().find((button) => /Previous setup screen/i.test(buttonText(button)) && button.getClientRects().length > 0 && !button.disabled);
  if (previous) previous.click();
  window.setTimeout(() => {
    const video = document.querySelector('video');
    if (video) {
      video.muted = true;
      video.currentTime = 0;
      video.play().catch(() => undefined);
    }
  }, 100);
  return JSON.stringify({ clickedPrevious: Boolean(previous), heading: document.querySelector('h1')?.textContent?.trim() ?? '', text: (document.body?.innerText ?? '').slice(0, 1000) });
})()`;
try { console.log(await executeJs(resetIntro)); } finally { socketClient.client?.end?.(); process.exit(0); }
