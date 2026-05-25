import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";

async function sendCommand(method, params) {
  if (!socketClient.isConnected) await socketClient.connect();
  return socketClient.sendCommand(method, params);
}

async function executeJs(code) {
  const result = await sendCommand("execute_js", { window_label: "main", code });
  return result.result ?? result.content;
}

async function main() {
  socketClient.config = { type: "ipc", path: "/tmp/tauri-mcp.sock" };

  const text = String(await executeJs("document.body?.innerText ?? ''"));
  const heading = String(await executeJs("document.querySelector('h1')?.textContent ?? ''"));
  const videoState = await executeJs(`
    const v = document.querySelector('video[data-morgan-media-key]');
    v ? { paused: v.paused, ended: v.ended, currentTime: v.currentTime, duration: v.duration, src: v.currentSrc?.split('/').pop() } : null
  `);

  console.log("[check] Heading:", heading);
  console.log("[check] Video state:", JSON.stringify(videoState));
  console.log("[check] Text includes 'Saved access':", /Saved access/i.test(text));
  console.log("[check] Text includes 'Cloudflare':", /Cloudflare/i.test(text));
  console.log("[check] Text includes 'Source':", /Source/i.test(text));

  socketClient.client?.end?.();
}

main().catch(err => { console.error(err); process.exit(1); });
