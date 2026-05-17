import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
async function executeJs(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  return result.result ?? result.content;
}
const goBeginning = String.raw`(() => {
  const clickVisible = (button) => {
    if (!button || button.disabled || button.getClientRects().length === 0) return false;
    button.click();
    return true;
  };
  const buttonText = (button) => (button.textContent || '') + ' ' + (button.getAttribute('title') || '') + ' ' + (button.getAttribute('aria-label') || '');
  const buttons = () => Array.from(document.querySelectorAll('button'));
  const heading = () => document.querySelector('h1')?.textContent?.trim() ?? '';
  let actions = [];
  for (let i = 0; i < 8 && !/^(CTO|Client Cluster)$/i.test(heading()); i += 1) {
    const back = buttons().find((button) => /Back to Client Cluster|Previous setup screen|Back/i.test(buttonText(button)) && button.getClientRects().length > 0 && !button.disabled);
    if (!clickVisible(back)) break;
    actions.push('back');
  }
  const video = document.querySelector('video');
  return JSON.stringify({
    heading: heading(),
    text: (document.body?.innerText ?? '').slice(0, 1200),
    actions,
    video: video ? {src: video.currentSrc || video.getAttribute('src') || '', paused: video.paused, muted: video.muted, currentTime: video.currentTime, duration: video.duration, readyState: video.readyState} : null,
    buttons: buttons().filter((button) => button.getClientRects().length > 0).map((button) => ({
      text: (button.textContent || '').trim().replace(/\s+/g, ' ').slice(0,80),
      title: button.getAttribute('title') || '',
      aria: button.getAttribute('aria-label') || '',
      testId: button.getAttribute('data-testid') || '',
      disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true'),
    })),
  });
})()`;
try { console.log(await executeJs(goBeginning)); } finally { socketClient.client?.end?.(); process.exit(0); }
