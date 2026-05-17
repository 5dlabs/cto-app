import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const code = process.argv.slice(2).join(' ') || 'location.reload()';
try {
  await socketClient.connect();
  const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  console.log(typeof result === 'string' ? result : JSON.stringify(result));
} finally {
  try { await socketClient.disconnect?.(); } catch {}
  process.exit(0);
}
