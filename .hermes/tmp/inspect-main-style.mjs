import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code: `(() => JSON.stringify({className:document.querySelector('main')?.className, style:document.querySelector('main')?.getAttribute('style'), cssText:getComputedStyle(document.querySelector('main')).cssText, grid:getComputedStyle(document.querySelector('main')).gridTemplateColumns, rules:Array.from(document.styleSheets).flatMap((ss,i)=>Array.from(ss.cssRules||[]).map((r,j)=>({i,j,selector:r.selectorText,text:r.cssText}))).filter(r=>r.selector?.includes('local-bootstrap__content')).map(r=>r.text)}))()` });
console.log(result.result ?? result.value ?? result);
process.exit(0);
