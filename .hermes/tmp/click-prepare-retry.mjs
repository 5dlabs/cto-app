import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const code = `(() => {
  const button = [...document.querySelectorAll('button')].find((el) => el.getAttribute('title') === 'Prepare Client Cluster baseline' || el.getAttribute('data-testid') === 'prepare-cluster-dependencies');
  if (!button) return JSON.stringify({ clicked: false, reason: 'button-not-found' });
  if (button.disabled) return JSON.stringify({ clicked: false, reason: 'button-disabled', text: button.textContent.trim() });
  button.click();
  return JSON.stringify({ clicked: true, text: button.textContent.trim() });
})()`;
const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
const raw = result?.result ?? result?.value ?? result;
console.log(typeof raw === 'string' ? raw : JSON.stringify(raw));
process.exit(0);
