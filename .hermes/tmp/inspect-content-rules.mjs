import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code: `(() => JSON.stringify(Array.from(document.styleSheets[6].cssRules).filter(r=>r.selectorText?.includes('local-bootstrap__content--setup')).map(r=>r.cssText)))()` });
console.log(result.result ?? result.value ?? result);
process.exit(0);
