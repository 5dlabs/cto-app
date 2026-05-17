import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code: `(() => JSON.stringify(Array.from(document.styleSheets[6].cssRules).map((r,j)=>({j,type:r.type,selector:r.selectorText||null,condition:r.conditionText||null,text:r.cssText.slice(0,180)})).filter(r=>r.text.includes('local-bootstrap__content--setup')||r.text.includes('@media (max-width: 1040px)'))))()` });
console.log(result.result ?? result.value ?? result);
process.exit(0);
