import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";

const SOCKET_PATH = process.env.TAURI_MCP_IPC_PATH ?? "/tmp/tauri-mcp.sock";

async function sendCommand(method, params) {
  if (!socketClient.isConnected) {
    await socketClient.connect();
  }
  return socketClient.sendCommand(method, params);
}

async function executeJs(code) {
  const result = await sendCommand("execute_js", { window_label: "main", code });
  return result.result ?? result.content;
}

async function main() {
  console.log("[clean] Connecting to Tauri MCP socket at", SOCKET_PATH);
  socketClient.config = { type: "ipc", path: SOCKET_PATH };

  // Install console.log interceptor
  await executeJs(`
    if (!window.__ctoDiagLogs) {
      window.__ctoDiagLogs = [];
      const orig = console.log;
      console.log = (...args) => {
        const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        if (line.includes('[CTO]')) window.__ctoDiagLogs.push(line);
        return orig.apply(console, args);
      };
    }
    true
  `);

  // Check current page state
  const heading = String(await executeJs("document.querySelector('h1')?.textContent ?? ''"));
  const text = String(await executeJs("document.body?.innerText ?? ''"));
  console.log("[clean] Page heading:", heading.slice(0, 100));

  // If we're already past intro, bail
  if (/Saved access|Cloudflare|Source/i.test(heading)) {
    console.log("[clean] Already past intro. Heading:", heading);
    return;
  }

  // Wait for setup gate to be fully visible
  await new Promise(r => setTimeout(r, 2000));

  // Click Start button
  const startBtn = await executeJs(`
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      /^(Start|Retry)$/i.test(b.textContent?.trim() ?? '') && !b.disabled
    );
    if (btn) { btn.click(); true; } else { false; }
  `);
  console.log("[clean] Start button clicked:", startBtn);

  if (!startBtn) {
    console.log("[clean] No Start button found. Current text:", text.slice(0, 200));
    return;
  }

  // Poll for up to 3 minutes (clean bootstrap takes time)
  let transitioned = false;
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const logs = await executeJs(`window.__ctoDiagLogs.splice(0, window.__ctoDiagLogs.length)`);
    for (const line of logs || []) {
      console.log("[CTO-LOG]", line);
    }

    const currentHeading = String(await executeJs("document.querySelector('h1')?.textContent ?? ''"));
    if (/Saved access|Cloudflare|Source/i.test(currentHeading)) {
      console.log("[clean] ✓ Transitioned to:", currentHeading);
      transitioned = true;
      break;
    }

    const currentText = String(await executeJs("document.body?.innerText ?? ''"));
    if (/Setup needs attention/i.test(currentText)) {
      console.log("[clean] ✗ Setup failed!");
      break;
    }
  }

  // Drain remaining logs
  const remaining = await executeJs(`window.__ctoDiagLogs.splice(0, window.__ctoDiagLogs.length)`);
  for (const line of remaining || []) {
    console.log("[CTO-LOG]", line);
  }

  socketClient.client?.end?.();
  if (!transitioned) {
    console.log("[clean] ✗ Did not transition within 3 minutes.");
    process.exit(1);
  }
  console.log("[clean] Done.");
}

main().catch(err => {
  console.error("[clean] Error:", err);
  process.exit(1);
});
