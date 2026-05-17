import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code: `(() => JSON.stringify(Array.from(document.styleSheets).map((ss,i)=>({i,href:ss.href,rules:ss.cssRules?.length, text:Array.from(ss.cssRules||[]).map(r=>r.cssText).find(t=>t.includes('.local-bootstrap__content--setup'))||null}))))()` });
console.log(result.result ?? result.value ?? result);
process.exit(0);
