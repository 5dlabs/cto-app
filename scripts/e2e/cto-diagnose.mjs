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

async function clickByText(pattern) {
  const result = await sendCommand("click", { window_label: "main", text: pattern.source ?? pattern });
  return result;
}

async function main() {
  console.log("[diag] Connecting to Tauri MCP socket at", SOCKET_PATH);
  socketClient.config = { type: "ipc", path: SOCKET_PATH };

  // Install console.log interceptor to capture [CTO] logs
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
  const text = String(await executeJs("document.body?.innerText ?? ''"));
  const heading = String(await executeJs("document.querySelector('h1')?.textContent ?? ''"));
  console.log("[diag] Page heading:", heading.slice(0, 100));
  console.log("[diag] Page text snippet:", text.slice(0, 200));

  // Check if setup gate is visible
  const isSetupGate = /CTO|local stack|Client Cluster|Setup needs attention/i.test(text);
  const isMainApp = /Message Morgan|Send|Morgan mode|LemonSlice/i.test(text);

  if (isMainApp) {
    console.log("[diag] Main app is showing, not setup gate.");
    // Try to find and click the dev reset button if available
    const hasReset = await executeJs(`
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        /Start over and clear the local CTO stack/i.test(b.getAttribute('aria-label') ?? '')
      );
      if (btn) { btn.click(); true; } else { false; }
    `);
    if (hasReset) {
      console.log("[diag] Clicked dev reset button. Waiting for setup gate...");
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.log("[diag] No dev reset button found.");
    }
  }

  if (isSetupGate || hasReset) {
    // Wait for setup gate to be fully visible
    await new Promise(r => setTimeout(r, 2000));

    // Check for Start button and click it
    const startBtn = await executeJs(`
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        /^(Start|Retry)$/i.test(b.textContent?.trim() ?? '') && !b.disabled
      );
      if (btn) { btn.click(); true; } else { false; }
    `);
    console.log("[diag] Start button clicked:", startBtn);

    // Poll for 30 seconds, capturing logs and checking state
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const logs = await executeJs(`window.__ctoDiagLogs.splice(0, window.__ctoDiagLogs.length)`);
      for (const line of logs || []) {
        console.log("[CTO-LOG]", line);
      }

      const currentText = String(await executeJs("document.body?.innerText ?? ''"));
      const currentHeading = String(await executeJs("document.querySelector('h1')?.textContent ?? ''"));

      if (/Saved access|Cloudflare|Source/i.test(currentHeading)) {
        console.log("[diag] Transitioned to:", currentHeading);
        break;
      }
      if (/Setup needs attention/i.test(currentText)) {
        console.log("[diag] Setup failed!");
        break;
      }
    }
  }

  // Drain remaining logs
  const remaining = await executeJs(`window.__ctoDiagLogs.splice(0, window.__ctoDiagLogs.length)`);
  for (const line of remaining || []) {
    console.log("[CTO-LOG]", line);
  }

  socketClient.client?.end?.();
  console.log("[diag] Done.");
}

main().catch(err => {
  console.error("[diag] Error:", err);
  process.exit(1);
});
