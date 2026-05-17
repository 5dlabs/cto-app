#!/usr/bin/env node
import { socketClient } from "tauri-plugin-mcp-server/build/tools/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const out = resolve(".hermes/tmp/dogfood-first-screens-report.json");
mkdirSync(dirname(out), { recursive: true });

async function exec(code) {
  const result = await socketClient.sendCommand("execute_js", { window_label: "main", code });
  const value = result.result ?? result.content;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

async function wait(ms) { await new Promise((r) => setTimeout(r, ms)); }

async function installInstrumentation() {
  await exec(`(() => {
    window.__ctoDogfood = { events: [], startedAt: Date.now() };
    const log = (type, detail = {}) => {
      const heading = document.querySelector('h1')?.textContent?.trim() ?? '';
      const screen = document.querySelector('[data-setup-screen]')?.getAttribute('data-setup-screen') ?? heading;
      window.__ctoDogfood.events.push({
        t: Math.round(performance.now()),
        type,
        heading,
        screen,
        detail,
      });
    };
    window.__ctoDogfood.log = log;
    if (!window.__ctoDogfoodMediaPatched) {
      window.__ctoDogfoodMediaPatched = true;
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function(...args) {
        log('media.play.call', {
          tag: this.tagName,
          testId: this.getAttribute('data-testid'),
          src: this.currentSrc || this.getAttribute('src'),
          muted: this.muted,
          paused: this.paused,
          currentTime: Number(this.currentTime || 0).toFixed(2),
          readyState: this.readyState,
        });
        const promise = originalPlay.apply(this, args);
        if (promise?.catch) {
          promise.catch((error) => log('media.play.reject', { src: this.currentSrc || this.getAttribute('src'), message: String(error?.message ?? error) }));
        }
        return promise;
      };
      for (const eventName of ['loadstart','loadedmetadata','canplay','play','playing','pause','ended','error','volumechange']) {
        document.addEventListener(eventName, (event) => {
          const target = event.target;
          if (!(target instanceof HTMLMediaElement)) return;
          log('media.' + eventName, {
            tag: target.tagName,
            testId: target.getAttribute('data-testid'),
            src: target.currentSrc || target.getAttribute('src'),
            muted: target.muted,
            paused: target.paused,
            currentTime: Number(target.currentTime || 0).toFixed(2),
            duration: Number.isFinite(target.duration) ? Number(target.duration).toFixed(2) : null,
            readyState: target.readyState,
            error: target.error ? { code: target.error.code, message: target.error.message } : null,
          });
        }, true);
      }
      const originalOpen = window.open;
      window.open = function(url, target, features) {
        log('window.open', { url, target, features });
        return originalOpen.apply(this, arguments);
      };
    }
    log('instrumented');
    return true;
  })()`);
}

async function snapshot(label) {
  return await exec(`(() => {
    const visible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const buttons = Array.from(document.querySelectorAll('button')).filter(visible).map((button) => ({
      text: (button.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
      title: button.getAttribute('title'),
      aria: button.getAttribute('aria-label'),
      testId: button.getAttribute('data-testid'),
      disabled: button.disabled,
      rect: (() => { const r = button.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    }));
    const medias = Array.from(document.querySelectorAll('video,audio')).map((el) => ({
      tag: el.tagName,
      testId: el.getAttribute('data-testid'),
      src: el.currentSrc || el.getAttribute('src'),
      muted: el.muted,
      paused: el.paused,
      currentTime: Number(el.currentTime || 0).toFixed(2),
      duration: Number.isFinite(el.duration) ? Number(el.duration).toFixed(2) : null,
      readyState: el.readyState,
      visible: visible(el),
    }));
    const h1 = document.querySelector('h1');
    const modal = document.querySelector('[role="dialog"], [data-testid="saved-access-onepassword-modal"]');
    const active = document.activeElement;
    const bodyText = document.body?.innerText ?? '';
    return {
      label: ${JSON.stringify(label)},
      ts: Date.now(),
      heading: h1?.textContent?.trim() ?? '',
      bodyText: bodyText.replace(/\\s+/g, ' ').slice(0, 600),
      bannedCopyVisible: /two choices|two options|just two|skip real-time|Set up 1Password saved access|Skip saved access/i.test(bodyText),
      modalOpen: Boolean(modal && visible(modal)),
      readinessState: document.querySelector('[data-testid="saved-access-readiness"]')?.getAttribute('data-state') ?? null,
      readinessLabel: document.querySelector('[data-testid="saved-access-readiness-label"]')?.textContent?.trim() ?? null,
      activeElement: active ? { tag: active.tagName, text: (active.textContent || '').trim().slice(0,80), testId: active.getAttribute?.('data-testid'), aria: active.getAttribute?.('aria-label') } : null,
      buttons,
      medias,
      viewport: { w: innerWidth, h: innerHeight },
      scroll: { x: scrollX, y: scrollY },
    };
  })()`);
}

async function click(selector, label) {
  const ok = await exec(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, reason: 'not-found', selector: ${JSON.stringify(selector)} };
    el.click();
    window.__ctoDogfood?.log?.('click', { selector: ${JSON.stringify(selector)}, label: ${JSON.stringify(label)}, text: el.textContent?.trim(), title: el.getAttribute('title'), testId: el.getAttribute('data-testid') });
    return { ok: true };
  })()`);
  await wait(900);
  return ok;
}

async function clickByTitle(title) {
  const ok = await exec(`(() => {
    const title = ${JSON.stringify(title)};
    const el = Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('title') === title || button.getAttribute('aria-label') === title);
    if (!el) return { ok: false, reason: 'not-found', title };
    el.click();
    window.__ctoDogfood?.log?.('click', { title, text: el.textContent?.trim(), testId: el.getAttribute('data-testid') });
    return { ok: true };
  })()`);
  await wait(900);
  return ok;
}

async function pressEnter() {
  await exec(`(() => {
    const target = document.activeElement || document.body;
    for (const type of ['keydown','keypress','keyup']) {
      target.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    }
    window.__ctoDogfood?.log?.('keyboard.enter', { activeTag: target.tagName, activeTestId: target.getAttribute?.('data-testid'), activeText: target.textContent?.trim()?.slice(0,80) });
    return true;
  })()`);
  await wait(700);
}

async function focus(selector) {
  await exec(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.focus(); window.__ctoDogfood?.log?.('focus', { selector: ${JSON.stringify(selector)}, testId: el?.getAttribute('data-testid') }); return Boolean(el); })()`);
  await wait(250);
}

async function main() {
  const report = { snapshots: [], actions: [], issues: [] };
  await installInstrumentation();
  report.snapshots.push(await snapshot('initial'));

  // Normalize to the Saved access screen if possible, without resetting the cluster.
  if (report.snapshots.at(-1).heading !== 'Saved access') {
    await clickByTitle('Continue to saved access');
    await wait(1000);
  }
  report.snapshots.push(await snapshot('saved-access-visible'));

  // Keyboard affordance: pressing Enter on the 1Password tile should open the readiness modal.
  await focus('[data-testid="saved-access-onepassword"]');
  await pressEnter();
  report.snapshots.push(await snapshot('after-enter-on-1password'));

  // Let condition audio and detection settle.
  await wait(3000);
  report.snapshots.push(await snapshot('saved-access-after-detection-audio'));

  // Continue onward and verify Cloudflare state is stable/minimal.
  await click('[data-testid="saved-access-modal-continue"]', 'continue from modal');
  report.snapshots.push(await snapshot('cloudflare-after-modal-continue'));

  await click('[data-testid="cloudflare-endpoint-saved-access"]', 'choose 1Password Cloudflare access');
  report.snapshots.push(await snapshot('cloudflare-saved-access-selected'));

  // Press Enter on Continue to catch keyboard jumps.
  await focus('[data-testid="cloudflare-continue"]');
  await pressEnter();
  report.snapshots.push(await snapshot('after-enter-on-cloudflare-continue'));

  report.events = await exec(`(() => window.__ctoDogfood?.events ?? [])()`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, snapshots: report.snapshots.length, events: report.events.length }, null, 2));
}

try {
  await main();
} finally {
  socketClient.client?.destroy?.();
  socketClient.client?.end?.();
}
process.exit(0);
