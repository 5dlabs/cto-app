import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), '.local', 'e2e-screenshots', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(outDir, { recursive: true });

async function send(command, payload = {}) {
  return await socketClient.sendCommand(command, { window_label: 'main', ...payload });
}
async function js(code, timeout_ms = 10000) {
  const response = await send('execute_js', { code, timeout_ms });
  const raw = response?.result ?? response?.value ?? response;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}
async function screenshot(label) {
  const response = await send('take_screenshot', { window_label: 'main', save_to_disk: true, thumbnail: true, output_dir: outDir, quality: 85, max_width: 1440 });
  writeFileSync(join(outDir, `${label}.screenshot-response.json`), JSON.stringify(response, null, 2));
  const serialized = JSON.stringify(response);
  const match = serialized.match(/(?:Full screenshot saved to: |filepath|file_path|path)["':\s]+([^"\n]+\.(?:png|jpg|jpeg))/i);
  return match ? match[1] : `${outDir}/${label}.unknown-screenshot`;
}
async function snapshot(label) {
  const state = await js(`JSON.stringify({
    label: ${JSON.stringify(label)},
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    prompt: document.querySelector('.local-bootstrap__decision-card strong')?.textContent?.trim() ?? '',
    panelTitle: document.querySelector('.local-bootstrap__panel-title')?.textContent?.trim() ?? '',
    progressStage: document.querySelector('.local-bootstrap__progress-meta span:first-child')?.textContent?.trim() ?? '',
    progressPercent: document.querySelector('.local-bootstrap__progress-meta span:last-child')?.textContent?.trim() ?? '',
    progressMessages: Array.from(document.querySelectorAll('.local-bootstrap__progress--inline p, .local-bootstrap__copy > p, .local-bootstrap__step-body p')).map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 8),
    buttons: Array.from(document.querySelectorAll('button')).map((button) => ({ text: button.textContent?.trim() ?? '', title: button.getAttribute('title') ?? '', aria: button.getAttribute('aria-label') ?? '', testid: button.getAttribute('data-testid') ?? '', disabled: button.disabled, visible: Boolean(button.offsetParent || button.getClientRects().length) })).filter((button) => button.visible).slice(0, 24),
    video: (() => { const video = document.querySelector('video'); return video ? { src: video.currentSrc || video.getAttribute('src') || '', currentTime: Number(video.currentTime.toFixed(2)), duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : null, paused: video.paused, ended: video.ended } : null; })(),
    diagnostics: (window.__ctoE2eDiagnostics || []).slice(-10),
    text: document.body.innerText.slice(0, 2200),
  })`);
  writeFileSync(join(outDir, `${label}.state.json`), JSON.stringify(state, null, 2));
  const image = await screenshot(label);
  console.log(`${label}: ${image}`);
  console.log(JSON.stringify(state, null, 2));
  return state;
}
async function clickButton(matchSource) {
  return await js(`(() => {
    const regex = new RegExp(${JSON.stringify(matchSource)}, 'i');
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => {
      const haystack = [candidate.textContent, candidate.getAttribute('title'), candidate.getAttribute('aria-label'), candidate.getAttribute('data-testid')].filter(Boolean).join(' ');
      const visible = Boolean(candidate.offsetParent || candidate.getClientRects().length);
      return visible && !candidate.disabled && regex.test(haystack);
    });
    if (!button) return JSON.stringify({ clicked: false, reason: 'not-found' });
    button.click();
    return JSON.stringify({ clicked: true, text: button.textContent?.trim(), title: button.getAttribute('title'), testid: button.getAttribute('data-testid') });
  })()`);
}
async function waitFor(predicateSource, timeoutMs = 600000, intervalMs = 1500) {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    last = await js(`(() => { try { return Boolean(${predicateSource}); } catch (error) { return 'ERR:' + error.message; } })()`);
    if (last === true || last === 'true') return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${predicateSource}; last=${last}`);
}

try {
  await js(`(() => {
    window.__ctoE2eDiagnostics = [];
    const push = (kind, args) => window.__ctoE2eDiagnostics.push({ kind, at: Date.now(), args: Array.from(args).map(String).slice(0, 5) });
    const oldError = console.error; const oldWarn = console.warn;
    console.error = (...args) => { push('console.error', args); oldError.apply(console, args); };
    console.warn = (...args) => { push('console.warn', args); oldWarn.apply(console, args); };
    window.addEventListener('error', (event) => push('window.error', [event.message]));
    window.addEventListener('unhandledrejection', (event) => push('unhandledrejection', [event.reason?.message || event.reason]));
  })()`);

  await waitFor(`/Local cluster|Source|CTO/i.test(document.body.innerText)`, 120000, 1000);
  const initial = await snapshot('00-observed');
  if (/Source/i.test(initial.heading)) {
    console.log('Already reached Source; recording final state only.');
  } else if (/Preparing/i.test(initial.text) || /[1-9][0-9]?%|100%/.test(initial.text)) {
    console.log('Preparation is already in progress; observing without an extra click.');
    const checkpoints = [60, 68, 80, 100];
    for (const pct of checkpoints) {
      await waitFor(`(() => {
        const value = Number((document.querySelector('.local-bootstrap__progress-meta span:last-child')?.textContent ?? '0').replace(/[^0-9.]/g, ''));
        const text = document.body.innerText;
        return value >= ${pct} || /Continue to Source|Source|Setup needs attention|Cluster baseline is ready/i.test(text);
      })()`, pct === 100 ? 900000 : 360000, 1500);
      await snapshot(`01-progress-${pct}`);
      const now = await js('document.body.innerText');
      if (/Continue to Source|Source|Setup needs attention/i.test(String(now))) break;
    }
  } else {
    const clicked = await clickButton('Prepare local cluster dependencies|Prepare cluster|Prepare local|Prepare$');
    console.log('prepare-click:', JSON.stringify(clicked));
    if (!clicked.clicked) throw new Error('Prepare button was not found on first setup screen');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await snapshot('01-after-prepare-click');
  }

  await waitFor(`/Continue to Source|Source|Setup needs attention|Cluster baseline is ready/i.test(document.body.innerText)`, 900000, 1500);
  await snapshot('02-after-prep-complete-or-source');
  const afterPrep = await js('document.body.innerText');
  if (/Continue to Source/i.test(String(afterPrep))) {
    const cont = await clickButton('Continue to Source|Continue');
    console.log('continue-click:', JSON.stringify(cont));
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await waitFor(`/Source|Setup needs attention/i.test(document.body.innerText)`, 120000, 1000);
  await snapshot('03-final-source-or-error');
  const diagnostics = await js('JSON.stringify(window.__ctoE2eDiagnostics || [])');
  writeFileSync(join(outDir, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
  console.log(`DIAGNOSTICS=${JSON.stringify(diagnostics)}`);
  console.log(`ARTIFACT_DIR=${outDir}`);
  process.exit(0);
} catch (error) {
  try { await snapshot('99-error'); } catch {}
  console.error(error instanceof Error ? error.stack : error);
  console.log(`ARTIFACT_DIR=${outDir}`);
  process.exit(1);
}
