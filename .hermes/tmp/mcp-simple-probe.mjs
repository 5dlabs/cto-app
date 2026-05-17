import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";

async function exec(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  const value = result.result ?? result.content;
  return typeof value === "string" ? value : JSON.stringify(value);
}

try {
  const raw = await exec(`(() => JSON.stringify({
    url: location.href,
    title: document.title,
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    text: (document.body?.innerText ?? '').slice(0, 1000),
    buttons: Array.from(document.querySelectorAll('button')).slice(0, 20).map((button) => ({
      text: (button.textContent || '').trim(),
      title: button.getAttribute('title') || '',
      aria: button.getAttribute('aria-label') || '',
      disabled: button.disabled,
    })),
    videoCount: document.querySelectorAll('video').length,
    audioCount: document.querySelectorAll('audio').length,
  }))()`);
  console.log(raw);
} finally {
  socketClient.client?.end?.();
  setTimeout(() => process.exit(0), 50);
}
