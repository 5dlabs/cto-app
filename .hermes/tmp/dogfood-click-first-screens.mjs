#!/usr/bin/env node
import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const out = resolve(".hermes/tmp/dogfood-click-report.json");
mkdirSync(dirname(out), { recursive: true });

async function exec(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  const value = result.result ?? result.content;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}
async function wait(ms) { await new Promise((r) => setTimeout(r, ms)); }
async function snapshot(label) {
  return await exec(`(() => {
    const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const modal = document.querySelector('[data-testid="saved-access-onepassword-modal"], [role="dialog"]');
    return {
      label: ${JSON.stringify(label)},
      heading: document.querySelector('h1')?.textContent?.trim() ?? '',
      text: (document.body?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 800),
      modalOpen: Boolean(modal && visible(modal)),
      readinessState: document.querySelector('[data-testid="saved-access-readiness"]')?.getAttribute('data-state') ?? null,
      readinessLabel: document.querySelector('[data-testid="saved-access-readiness-label"]')?.textContent?.trim() ?? null,
      media: Array.from(document.querySelectorAll('video,audio')).map((el) => ({ tag: el.tagName, src: el.currentSrc || el.getAttribute('src'), paused: el.paused, muted: el.muted, currentTime: Number(el.currentTime || 0).toFixed(2), duration: Number.isFinite(el.duration) ? Number(el.duration).toFixed(2) : null, readyState: el.readyState, error: el.error ? { code: el.error.code, message: el.error.message } : null })),
      buttons: Array.from(document.querySelectorAll('button')).filter(visible).map((b) => ({ testId: b.getAttribute('data-testid'), text: (b.textContent || '').trim().replace(/\\s+/g,' '), title: b.getAttribute('title'), disabled: b.disabled }))
    };
  })()`);
}
async function click(selector) {
  const ok = await exec(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  await wait(1300);
  return ok;
}
async function instrument() {
  await exec(`(() => {
    window.__ctoDogfood2 = [];
    const log = (type, detail={}) => window.__ctoDogfood2.push({ t: Math.round(performance.now()), type, heading: document.querySelector('h1')?.textContent?.trim() ?? '', detail });
    window.__ctoDogfood2Log = log;
    const originalPlay = HTMLMediaElement.prototype.__ctoOrigPlay || HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.__ctoOrigPlay = originalPlay;
    HTMLMediaElement.prototype.play = function(...args) {
      log('play.call', { tag: this.tagName, src: this.currentSrc || this.getAttribute('src'), muted: this.muted, paused: this.paused, currentTime: Number(this.currentTime||0).toFixed(2), readyState: this.readyState });
      const p = originalPlay.apply(this, args);
      p?.catch?.((err) => log('play.reject', { src: this.currentSrc || this.getAttribute('src'), name: err?.name, message: String(err?.message ?? err) }));
      return p;
    };
    for (const name of ['loadedmetadata','canplay','play','playing','pause','ended','error']) document.addEventListener(name, (e) => { const el=e.target; if (el instanceof HTMLMediaElement) log(name, { tag: el.tagName, src: el.currentSrc || el.getAttribute('src'), muted: el.muted, paused: el.paused, currentTime: Number(el.currentTime||0).toFixed(2), duration: Number.isFinite(el.duration)?Number(el.duration).toFixed(2):null, readyState: el.readyState, error: el.error ? { code: el.error.code, message: el.error.message } : null }); }, true);
    return true;
  })()`);
}
async function main() {
  const report = { snapshots: [] };
  await instrument();
  report.snapshots.push(await snapshot('start'));
  if ((report.snapshots.at(-1).heading || '') !== 'Saved access') await click('[title="Previous setup screen"]');
  report.snapshots.push(await snapshot('saved-access-normalized'));
  await click('[data-testid="saved-access-onepassword"]');
  report.snapshots.push(await snapshot('after-click-onepassword'));
  await wait(3000);
  report.snapshots.push(await snapshot('after-detect'));
  await click('[data-testid="saved-access-modal-continue"]');
  report.snapshots.push(await snapshot('after-modal-continue'));
  await click('[data-testid="saved-access-continue"]');
  report.snapshots.push(await snapshot('after-footer-continue'));
  await click('[data-testid="cloudflare-endpoint-saved-access"]');
  report.snapshots.push(await snapshot('after-cloudflare-saved-access'));
  await click('[data-testid="cloudflare-continue"]');
  report.snapshots.push(await snapshot('after-cloudflare-continue'));
  report.events = await exec(`(() => window.__ctoDogfood2 ?? [])()`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, snapshots: report.snapshots.length, events: report.events.length }, null, 2));
}
try { await main(); } finally { socketClient.client?.destroy?.(); socketClient.client?.end?.(); }
process.exit(0);
