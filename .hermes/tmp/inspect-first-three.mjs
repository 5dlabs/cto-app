import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

function normalize(result) {
  return result?.result ?? result?.value ?? result;
}

async function exec(code) {
  const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const normalized = normalize(result);
  if (typeof normalized === 'string') {
    try { return JSON.parse(normalized); } catch { return normalized; }
  }
  return normalized;
}

const snapshotCode = `(() => {
  const txt = (el) => el?.textContent?.replace(/\s+/g, ' ')?.trim() || '';
  const buttons = Array.from(document.querySelectorAll('button')).map((button) => ({
    text: txt(button),
    title: button.getAttribute('title'),
    aria: button.getAttribute('aria-label'),
    testid: button.getAttribute('data-testid'),
    disabled: button.disabled,
  }));
  const testids = Array.from(document.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid'));
  const bodyText = document.body.innerText.replace(/\s+/g, ' ').trim();
  const media = Array.from(document.querySelectorAll('video,audio')).map((el) => ({ tag: el.tagName.toLowerCase(), src: el.currentSrc || el.getAttribute('src'), paused: el.paused, muted: el.muted }));
  return JSON.stringify({
    panelTitle: txt(document.querySelector('.local-bootstrap__panel-title')),
    buttons,
    testids,
    hasSkipRealtime: /skip real-time|skip realtime/i.test(bodyText),
    hasCloudflareSubtitle: /public endpoint/i.test(bodyText),
    visibleText: bodyText.slice(0, 700),
    media,
  });
})()`;

async function click(pattern) {
  return exec(`(() => {
    const rx = new RegExp(${JSON.stringify(pattern)}, 'i');
    const button = Array.from(document.querySelectorAll('button')).find((b) => rx.test(b.getAttribute('title') || b.getAttribute('aria-label') || b.textContent || '') && !b.disabled);
    if (!button) return JSON.stringify({ clicked: false, pattern: ${JSON.stringify(pattern)}, buttons: Array.from(document.querySelectorAll('button')).map((b) => ({title:b.getAttribute('title'), aria:b.getAttribute('aria-label'), text:b.textContent?.replace(/\s+/g,' ').trim(), disabled:b.disabled})) });
    button.click();
    return JSON.stringify({ clicked: true, title: button.getAttribute('title'), aria: button.getAttribute('aria-label') });
  })()`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const initial = await exec(snapshotCode);
if (!initial.testids?.includes('saved-access-prep-options') && !initial.testids?.includes('cloudflare-endpoint-options')) {
  await click('Continue to saved access');
  await sleep(250);
}
const saved = await exec(snapshotCode);
await click('Use 1Password');
await sleep(900);
const savedAfterUse = await exec(snapshotCode);
await click('Continue to Cloudflare');
await sleep(250);
const cloudflare = await exec(snapshotCode);
console.log(JSON.stringify({ initial, saved, savedAfterUse, cloudflare }, null, 2));
process.exit(0);
