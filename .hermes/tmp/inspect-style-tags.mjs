import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code: `(() => JSON.stringify(Array.from(document.querySelectorAll('style')).map((s,i)=>({i, hasGrid:s.textContent.includes('minmax(300px, 360px)'), hasSetup:s.textContent.includes('.local-bootstrap__content--setup'), snippet:s.textContent.includes('.local-bootstrap__content--setup') ? s.textContent.slice(s.textContent.indexOf('.local-bootstrap__content--setup'), s.textContent.indexOf('.local-bootstrap__content--setup')+300) : null}))))()` });
console.log(result.result ?? result.value ?? result);
process.exit(0);
