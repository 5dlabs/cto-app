import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
import { writeDomSnapshotArtifact } from '../../scripts/e2e/dom-snapshot-artifact.mjs';

const out = '/Users/edge_kase/5dlabs/cto-app/.hermes/artifacts/morgan-source-install-actions-live.svg';
mkdirSync(dirname(out), { recursive: true });

async function execute(code) {
  const raw = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
  const value = raw.result ?? raw.value ?? raw;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

const snapshot = await execute(`(() => JSON.stringify({
  label: 'morgan-source-install-actions-live',
  capturedAt: new Date().toISOString(),
  url: location.href,
  title: document.title,
  heading: document.querySelector('h1')?.textContent ?? '',
  text: document.body?.innerText ?? '',
  buttons: Array.from(document.querySelectorAll('button')).map((button) => ({
    text: (button.textContent || '').trim(),
    title: button.getAttribute('title') || '',
    aria: button.getAttribute('aria-label') || '',
    testId: button.getAttribute('data-testid') || '',
    disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
    visible: button.getClientRects().length > 0,
  })),
  inputs: Array.from(document.querySelectorAll('input, textarea, select')).map((input) => ({
    tag: input.tagName.toLowerCase(),
    type: input.getAttribute('type') || '',
    name: input.getAttribute('name') || '',
    placeholder: input.getAttribute('placeholder') || '',
    testId: input.getAttribute('data-testid') || '',
    value: input.value || '',
    visible: input.getClientRects().length > 0,
  })),
  selected: [],
  controls: [],
}))()`);

const artifact = writeDomSnapshotArtifact('morgan-source-install-actions-live', snapshot);
const svg = await import('node:fs').then(({ readFileSync }) => readFileSync(artifact.svg, 'utf8'));
writeFileSync(out, svg);
console.log(JSON.stringify({ artifact, out, heading: snapshot.heading, buttons: snapshot.buttons.filter((b) => b.visible).map((b) => b.text || b.aria || b.title) }, null, 2));
socketClient.close?.();
process.exit(0);
