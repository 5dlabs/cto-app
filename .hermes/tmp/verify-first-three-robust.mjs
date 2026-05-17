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
const click = (pattern) => exec(`(() => {
  const rx = new RegExp(${JSON.stringify(pattern)}, 'i');
  const button = Array.from(document.querySelectorAll('button')).find((b) => rx.test(b.getAttribute('title') || b.getAttribute('aria-label') || b.textContent || '') && !b.disabled);
  if (!button) return JSON.stringify({ clicked: false, pattern: ${JSON.stringify(pattern)}, buttons: Array.from(document.querySelectorAll('button')).map((b) => ({title:b.getAttribute('title'), aria:b.getAttribute('aria-label'), text:b.textContent?.trim(), disabled:b.disabled})) });
  button.click();
  return JSON.stringify({ clicked: true, title: button.getAttribute('title'), testid: button.getAttribute('data-testid') });
})()`);
const snap = () => exec(`(() => {
  const text = (el) => el?.textContent?.replace(/\\s+/g, ' ')?.trim() || '';
  const bodyText = document.body.innerText.replace(/\\s+/g, ' ').trim();
  const capability = Array.from(document.querySelectorAll('[data-testid^="saved-access-"]')).map((el) => ({testid: el.getAttribute('data-testid'), title: el.getAttribute('title'), aria: el.getAttribute('aria-label'), text: text(el)}));
  return JSON.stringify({
    panelTitle: text(document.querySelector('.local-bootstrap__panel-title')),
    testids: Array.from(document.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid')),
    capability,
    buttons: Array.from(document.querySelectorAll('button')).map((button) => ({ text: text(button), aria: button.getAttribute('aria-label'), title: button.getAttribute('title'), testid: button.getAttribute('data-testid'), disabled: button.disabled })),
    hasSkipRealtime: /skip real-time|skip realtime/i.test(bodyText),
    hasCloudflareSubtitle: /public endpoint/i.test(bodyText),
    visibleText: bodyText.slice(0, 600),
  });
})()`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let start = await snap();
let toSaved = null;
if (!start.testids.includes('saved-access-prep-options')) {
  toSaved = await click('Next setup screen|Continue to saved access');
  await sleep(400);
}
const saved = await snap();
const use = await click('Use 1Password');
const immediate = await snap();
await sleep(6500);
let afterUse;
try { afterUse = await snap(); } catch (error) { afterUse = { error: String(error?.message || error) }; }
let cont = null;
let cloudflare = null;
if (!afterUse.error) {
  cont = await click('Continue to Cloudflare');
  await sleep(400);
  cloudflare = await snap();
}
console.log(JSON.stringify({ start, toSaved, saved, use, immediate, afterUse, cont, cloudflare }, null, 2));
process.exit(0);
