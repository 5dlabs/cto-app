import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

const code = `(() => {
  const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const attrs = (el) => el ? {
    tag: el.tagName,
    text: text(el),
    aria: el.getAttribute('aria-label'),
    title: el.getAttribute('title'),
    testid: el.getAttribute('data-testid'),
    disabled: el.disabled ?? false,
    className: String(el.className || ''),
  } : null;
  const progressEls = [...document.querySelectorAll('[role="progressbar"], progress, .local-bootstrap__progress, [class*="progress"], [aria-valuenow]')];
  const buttons = [...document.querySelectorAll('button')].map(attrs).slice(0, 40);
  const visibleText = document.body.innerText.replace(/\s+/g, ' ').trim();
  return JSON.stringify({
    location: location.href,
    title: document.title,
    heading: text(document.querySelector('h1')),
    h2: [...document.querySelectorAll('h2')].map(text),
    decisionPrompt: text(document.querySelector('.local-bootstrap__decision-card strong')),
    panelTitle: text(document.querySelector('.local-bootstrap__panel-title, .local-bootstrap__panel h2, .local-bootstrap__setup-title')),
    progress: progressEls.map(el => ({
      ...attrs(el),
      value: el.getAttribute('aria-valuenow') ?? el.getAttribute('value'),
      max: el.getAttribute('aria-valuemax') ?? el.getAttribute('max'),
      style: el.getAttribute('style'),
    })),
    video: (() => {
      const v = document.querySelector('video');
      return v ? {src: v.currentSrc || v.src, currentTime: v.currentTime, duration: v.duration, paused: v.paused, ended: v.ended, readyState: v.readyState} : null;
    })(),
    buttons,
    bodySnippet: visibleText.slice(0, 3000),
  });
})()`;

const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code });
const raw = result?.result ?? result?.value ?? result;
console.log(typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
process.exit(0);
