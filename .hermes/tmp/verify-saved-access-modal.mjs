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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function snap() {
  return exec(`(() => JSON.stringify({
    title: document.querySelector('.local-bootstrap__panel-title')?.textContent?.trim() || null,
    testids: Array.from(document.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid')),
    text: document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 800),
    buttons: Array.from(document.querySelectorAll('button')).map((b) => ({ testid: b.getAttribute('data-testid'), title: b.getAttribute('title'), aria: b.getAttribute('aria-label'), text: b.textContent?.replace(/\\s+/g, ' ').trim(), disabled: b.disabled })),
    hasTwoOptionsCopy: /two options|two choices|just two/i.test(document.body.innerText),
    hasModal: !!document.querySelector('[data-testid="saved-access-onepassword-modal"]'),
    hasInlineFlowOutsideModal: !!document.querySelector('section > [data-testid="saved-access-onepassword-flow"]')
  }))()`);
}
async function click(target) {
  return exec(`(() => {
    const target = ${JSON.stringify(target)};
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('data-testid') === target || new RegExp(target, 'i').test(b.getAttribute('title') || b.getAttribute('aria-label') || b.textContent || ''));
    if (!button || button.disabled) return JSON.stringify({ clicked: false, target, found: !!button, disabled: button?.disabled ?? null });
    button.click();
    return JSON.stringify({ clicked: true, target, title: button.getAttribute('title'), testid: button.getAttribute('data-testid') });
  })()`);
}
let current = await snap();
let attempts = 0;
while (!current.testids.includes('saved-access-onepassword') && attempts < 8) {
  const result = await click('Next setup screen');
  await wait(350);
  current = await snap();
  attempts += 1;
  if (!result.clicked) break;
}
const onepass = await click('saved-access-onepassword');
await wait(300);
const modal = await snap();
console.log(JSON.stringify({ attempts, saved: current, onepass, modal }, null, 2));
process.exit(modal.hasModal && !modal.hasTwoOptionsCopy && !modal.hasInlineFlowOutsideModal ? 0 : 1);
