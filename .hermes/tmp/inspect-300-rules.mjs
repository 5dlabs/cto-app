import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code: `(() => JSON.stringify(Array.from(document.styleSheets[6].cssRules).filter(r=>r.cssText.includes('300px')).map(r=>({type:r.type, selector:r.selectorText||null, condition:r.conditionText||null, text:r.cssText.slice(0,500)}))))()` });
console.log(result.result ?? result.value ?? result);
process.exit(0);
