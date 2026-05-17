import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code: `(() => JSON.stringify(Array.from(document.styleSheets[6].cssRules).map((r,j)=>({j,selector:r.selectorText||null,text:r.cssText})).filter(r=>r.selector==='.local-bootstrap__content--setup' || r.text.includes('minmax(300px, 360px)'))))()` });
console.log(result.result ?? result.value ?? result);
process.exit(0);
