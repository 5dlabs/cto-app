import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const outDir = path.join(repo, ".local/origin-icon-handmade");
fs.mkdirSync(outDir, { recursive: true });

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="5D Origin">
  <defs>
    <linearGradient id="originCyan" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#8ffcff"/>
      <stop offset="0.45" stop-color="#31e4ff"/>
      <stop offset="1" stop-color="#8f7cff"/>
    </linearGradient>
  </defs>
  <path d="M4.3 4.5h7.35l-.58 2.95H7.25l-.34 2.12h2.74c2.45 0 4.05 1.5 4.05 3.76 0 2.56-2.03 4.37-4.9 4.37-1.72 0-3.18-.48-4.28-1.36l1.05-2.42c.88.67 1.9 1.02 3.02 1.02 1.17 0 1.93-.55 1.93-1.45 0-.84-.63-1.33-1.73-1.33H3.8L4.3 4.5Z" fill="url(#originCyan)"/>
  <path d="M15.1 4.5h2.9c3.25 0 5.45 2.67 5.45 6.75S21.25 18 18 18h-2.9V4.5Zm2.95 10.54c1.42 0 2.32-1.45 2.32-3.79s-.9-3.79-2.32-3.79h-.05v7.58h.05Z" fill="url(#originCyan)"/>
  <path d="M14.1 5.35c1.4 1.05 2.22 3.1 2.22 5.9s-.82 4.85-2.22 5.9c-1.4-1.05-2.22-3.1-2.22-5.9s.82-4.85 2.22-5.9Z" fill="#050711"/>
  <path d="M14.1 6.7c.78.86 1.2 2.42 1.2 4.55s-.42 3.69-1.2 4.55c-.78-.86-1.2-2.42-1.2-4.55s.42-3.69 1.2-4.55Z" fill="none" stroke="#7cf7ff" stroke-width="1.15"/>
  <path d="M13.15 11.25h1.9" stroke="#f2ffff" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

const github = `<svg viewBox="0 0 24 24" fill="#f7f7ff" xmlns="http://www.w3.org/2000/svg"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.08c-3.13.68-3.79-1.34-3.79-1.34-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 .1.05 2.63 3.2 1.88.1-.73.39-1.23.71-1.51-2.5-.28-5.12-1.25-5.12-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.7 10.7 0 0 1 5.64 0c2.15-1.45 3.1-1.15 3.1-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.63 5.27-5.13 5.55.4.35.76 1.03.76 2.08v3.15c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z"/></svg>`;
const gitlab = `<svg viewBox="0 0 24 24" fill="none" stroke="#f7f7ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 21 3.5 14.7 6 3l4.3 8h3.4L18 3l2.5 11.7L12 21Z"/><path d="M10.3 11 12 21l1.7-10"/><path d="M3.5 14.7 10.3 11M20.5 14.7 13.7 11"/></svg>`;

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#090910;color:#f5f3ff;font-family:Inter,system-ui,sans-serif;padding:34px}.row{display:flex;gap:16px;align-items:flex-start}.card{width:122px;height:96px;border:1px solid rgba(170,160,255,.24);border-radius:18px;background:rgba(255,255,255,.055);display:grid;grid-template-rows:1fr auto;place-items:center;padding:12px;box-sizing:border-box}.brand{width:42px;height:42px;border-radius:12px;border:1px solid rgba(226,224,255,.18);background:linear-gradient(135deg,rgba(110,255,220,.92),rgba(130,150,255,.95) 58%,rgba(210,130,255,.95)),#cfcbff;display:grid;place-items:center;overflow:hidden}.brand svg{width:28px;height:28px}.origin .brand{background:#050711}.name{font-size:12px;font-weight:800;margin-top:8px}.sizes{display:flex;gap:20px;align-items:end;margin-top:34px}.sizebox{display:grid;gap:8px;justify-items:center}.sizebox .dark{display:grid;place-items:center;background:#050711;border:1px solid rgba(255,255,255,.1);border-radius:8px}.sizebox svg{display:block}.label{font-size:11px;color:rgba(226,224,255,.58)}h1{font-size:18px;margin:0 0 14px}p{color:rgba(226,224,255,.64);margin-bottom:22px}.large{margin-top:34px;width:220px;height:220px;display:grid;place-items:center;background:#050711;border:1px solid rgba(255,255,255,.1);border-radius:24px}.large svg{width:160px;height:160px}
</style><h1>Hand-authored 5D Origin provider glyph</h1><p>Flat SVG-style mark: no text, no app tile, no Scenario render texture. Previewed at the same 28px visual weight as GitHub/GitLab.</p><div class="row"><div class="card"><div class="brand">${github}</div><div class="name">GitHub</div></div><div class="card"><div class="brand">${gitlab}</div><div class="name">GitLab</div></div><div class="card origin"><div class="brand">${markSvg}</div><div class="name">5D Origin</div></div></div><div class="sizes"><div class="sizebox"><div class="dark" style="width:24px;height:24px">${markSvg}</div><div class="label">24px</div></div><div class="sizebox"><div class="dark" style="width:28px;height:28px">${markSvg}</div><div class="label">28px</div></div><div class="sizebox"><div class="dark" style="width:40px;height:40px">${markSvg}</div><div class="label">40px</div></div><div class="sizebox"><div class="dark" style="width:64px;height:64px">${markSvg}</div><div class="label">64px</div></div></div><div class="large">${markSvg}</div>`;
fs.writeFileSync(path.join(outDir, "5d-origin-provider-glyph.svg"), markSvg);
fs.writeFileSync(path.join(outDir, "preview.html"), html);
console.log(path.join(outDir, "preview.html"));
console.log(path.join(outDir, "5d-origin-provider-glyph.svg"));
