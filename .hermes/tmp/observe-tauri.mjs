import { socketClient } from 'tauri-plugin-mcp-server/build/tools/index.js';

const cmd = process.argv[2] || 'snapshot';
const js = cmd === 'reset'
  ? `(() => {
      window.confirm = () => true;
      const btn = document.querySelector('[aria-label="Start over and clear the local CTO stack"]');
      if (btn) { btn.click(); return JSON.stringify({ clickedReset: true }); }
      return JSON.stringify({ clickedReset: false, text: document.body.innerText.slice(0, 500) });
    })()`
  : `(() => {
      const text = document.body.innerText;
      const buttons = Array.from(document.querySelectorAll('button,[role="button"],a,input')).slice(0, 60).map((el) => ({
        tag: el.tagName,
        text: (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        aria: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
        testid: el.getAttribute('data-testid'),
      }));
      const video = document.querySelector('video');
      return JSON.stringify({
        url: location.href,
        title: document.title,
        heading: document.querySelector('h1,h2')?.textContent?.trim(),
        bodyPreview: text.replace(/\s+/g, ' ').slice(0, 1200),
        buttons,
        video: video ? { src: video.currentSrc || video.src, currentTime: video.currentTime, duration: video.duration, paused: video.paused, ended: video.ended } : null,
      });
    })()`;

const result = await socketClient.sendCommand('execute_js', { window_label: 'main', code: js });
const raw = result?.result ?? result?.value ?? result;
console.log(typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
process.exit(0);
