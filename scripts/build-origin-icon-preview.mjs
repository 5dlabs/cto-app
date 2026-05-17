import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const candidates = [
  "asset_M1y12MCihAGAB5EySrYPqBSS.png",
  "asset_MDEsFLvYrYCAgyj98kjb9fNT.png",
  "asset_iNKTnx4LdbXuTBtGJFJgYEGy.png",
  "asset_PoxHdCR69XgQng7dpCn9vvPa.png",
];
const dir = ".local/origin-icon-scenario/job_yCGFBeBYeuinHAE5gxxeZyDK";
const github = fs.readFileSync(path.join(repo, "ui/public/icons/github-copilot.svg"), "utf8");
const gitlab = `<svg viewBox="0 0 24 24" fill="none" stroke="#f7f7ff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 21 3.5 14.7 6 3l4.3 8h3.4L18 3l2.5 11.7L12 21Z"/><path d="M10.3 11 12 21l1.7-10"/><path d="M3.5 14.7 10.3 11M20.5 14.7 13.7 11"/></svg>`;
const originCards = candidates.map((file, i) => {
  const id = file.replace('.png','');
  return `<div class="card"><div class="brand"><img src="${dir}/${file}"/></div><div class="name">Origin ${i+1}</div><div class="id">${id}</div></div>`;
}).join("\n");
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#090910;color:#f5f3ff;font-family:Inter,system-ui,sans-serif;padding:36px}.row{display:flex;gap:18px;align-items:flex-start}.card{width:132px;height:126px;border:1px solid rgba(170,160,255,.24);border-radius:18px;background:rgba(255,255,255,.055);display:grid;grid-template-rows:1fr auto auto;place-items:center;padding:12px;box-sizing:border-box}.brand{width:42px;height:42px;border-radius:12px;border:1px solid rgba(226,224,255,.18);background:linear-gradient(135deg,rgba(110,255,220,.92),rgba(130,150,255,.95) 58%,rgba(210,130,255,.95)),#cfcbff;display:grid;place-items:center;overflow:hidden}.brand svg{width:28px;height:28px}.brand img{width:28px;height:28px;object-fit:contain}.origin .brand{background:rgba(4,9,18,.96)}.name{font-size:12px;font-weight:800;margin-top:10px}.id{font-size:7px;color:rgba(226,224,255,.42);max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sizes{display:grid;grid-template-columns:repeat(4,auto);gap:18px;margin-top:34px}.sizes img{object-fit:contain;background:#040912;border-radius:8px;border:1px solid rgba(255,255,255,.08)}h1{font-size:18px}p{color:rgba(226,224,255,.64)}
</style><h1>5D Origin icon-only Scenario candidates in Source button context</h1><p>GitHub/GitLab controls are icon-only; Origin should also be icon-only.</p><div class="row"><div class="card"><div class="brand">${github}</div><div class="name">GitHub</div><div class="id">existing</div></div><div class="card"><div class="brand">${gitlab}</div><div class="name">GitLab</div><div class="id">existing</div></div>${originCards}</div><h1>Bottom-right candidate size check</h1><div class="sizes"><img src="${dir}/asset_PoxHdCR69XgQng7dpCn9vvPa.png" width="24" height="24"><img src="${dir}/asset_PoxHdCR69XgQng7dpCn9vvPa.png" width="28" height="28"><img src="${dir}/asset_PoxHdCR69XgQng7dpCn9vvPa.png" width="40" height="40"><img src="${dir}/asset_PoxHdCR69XgQng7dpCn9vvPa.png" width="64" height="64"></div>`;
const out = path.join(repo, ".local/origin-icon-scenario/source-button-preview.html");
fs.writeFileSync(out, html);
console.log(out);
