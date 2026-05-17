import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code: `(() => JSON.stringify(Array.from(document.querySelectorAll('style')).map((s,i)=>({i, len:s.textContent.length, index:s.textContent.indexOf('.local-bootstrap__content--setup'), snippet:s.textContent.slice(Math.max(0,s.textContent.indexOf('.local-bootstrap__content--setup')-60), s.textContent.indexOf('.local-bootstrap__content--setup')+250)}))))()` });
console.log(result.result ?? result.value ?? result);
process.exit(0);
