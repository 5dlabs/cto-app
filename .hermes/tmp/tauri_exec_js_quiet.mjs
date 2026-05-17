import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const code = process.argv.slice(2).join(' ');
const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
function normalize(value) {
  if (typeof value === 'string') return value;
  if (value?.result !== undefined) return normalize(value.result);
  if (value?.content?.[0]?.text) return value.content[0].text;
  return JSON.stringify(value, null, 2);
}
console.log(normalize(result));
