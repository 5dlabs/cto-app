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
  const click = (pattern) => {
    const rx = new RegExp(pattern, 'i');
    const button = Array.from(document.querySelectorAll('button')).find((b) => rx.test(b.getAttribute('title') || b.getAttribute('aria-label') || b.textContent || '') && !b.disabled);
    if (!button) return { clicked: false, pattern, buttons: Array.from(document.querySelectorAll('button')).map((b) => ({ title: b.getAttribute('title'), aria: b.getAttribute('aria-label'), text: b.textContent?.replace(/\\s+/g, ' ').trim(), disabled: b.disabled })) };
    button.click();
    return { clicked: true, title: button.getAttribute('title'), aria: button.getAttribute('aria-label'), testid: button.getAttribute('data-testid') };
  };
  const snapshot = () => ({
    panelTitle: document.querySelector('.local-bootstrap__panel-title')?.textContent?.trim() || null,
    testids: Array.from(document.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid')),
    bodyText: document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 500),
    buttons: Array.from(document.querySelectorAll('button')).map((b) => ({ title: b.getAttribute('title'), aria: b.getAttribute('aria-label'), text: b.textContent?.replace(/\\s+/g, ' ').trim(), testid: b.getAttribute('data-testid'), disabled: b.disabled })),
  });
  return JSON.stringify({ click: click('Next setup screen|Continue to saved access'), after: snapshot() });
})()`);
console.log(JSON.stringify(result, null, 2));
process.exit(0);
