import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
function normalize(result) { return result?.result ?? result?.value ?? result; }
async function exec(code) {
  const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const normalized = normalize(result);
  if (typeof normalized === 'string') {
    try { return JSON.parse(normalized); } catch { return normalized; }
  }
  return normalized;
}
const result = await exec(`(() => {
  window.confirm = () => true;
  const reset = Array.from(document.querySelectorAll('button')).find((button) => /Start over/i.test(button.getAttribute('aria-label') || button.getAttribute('title') || ''));
  if (reset) {
    reset.click();
    return JSON.stringify({ resetClicked: true, title: reset.getAttribute('title'), aria: reset.getAttribute('aria-label') });
  }
  localStorage.clear();
  sessionStorage.clear();
  location.reload();
  return JSON.stringify({ resetClicked: false, fallbackReload: true });
})()`);
console.log(JSON.stringify(result, null, 2));
process.exit(0);
