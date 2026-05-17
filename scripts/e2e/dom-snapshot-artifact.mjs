import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SNAPSHOT_DIR = process.env.CTO_E2E_SNAPSHOT_DIR ?? ".local/e2e-snapshots";

export function writeDomSnapshotArtifact(label, snapshot) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = slugify(label);
  const base = join(SNAPSHOT_DIR, `${timestamp}-${slug}`);
  const sanitized = sanitizeSnapshot(snapshot);
  writeFileSync(`${base}.json`, `${JSON.stringify(sanitized, null, 2)}\n`);
  writeFileSync(`${base}.html`, renderSnapshotHtml(label, sanitized));
  writeFileSync(`${base}.svg`, renderSnapshotSvg(label, sanitized));
  return { label, base, json: `${base}.json`, html: `${base}.html`, svg: `${base}.svg` };
}

function sanitizeSnapshot(snapshot = {}) {
  return {
    ...snapshot,
    text: redact(String(snapshot.text ?? "")),
    heading: redact(String(snapshot.heading ?? "")),
    url: redact(String(snapshot.url ?? "")),
    buttons: sanitizeControls(snapshot.buttons ?? []),
    inputs: sanitizeControls(snapshot.inputs ?? []),
    selected: sanitizeControls(snapshot.selected ?? []),
    controls: sanitizeControls(snapshot.controls ?? []),
  };
}

function sanitizeControls(controls) {
  return controls.map((control) => {
    const secretLike = isSecretLikeControl(control);
    return {
      ...control,
      text: redact(String(control.text ?? "")),
      title: redact(String(control.title ?? "")),
      aria: redact(String(control.aria ?? "")),
      name: redact(String(control.name ?? "")),
      placeholder: redact(String(control.placeholder ?? "")),
      testId: redact(String(control.testId ?? "")),
      value: secretLike ? "[REDACTED]" : redact(String(control.value ?? "")),
    };
  });
}

function isSecretLikeControl(control) {
  return control.type === "password" || /token|pat|secret|key|password|credential/i.test(
    `${control.name ?? ""} ${control.placeholder ?? ""} ${control.aria ?? ""} ${control.title ?? ""} ${control.testId ?? ""}`,
  );
}

function renderSnapshotHtml(label, snapshot) {
  const buttons = (snapshot.buttons ?? [])
    .filter((button) => button.visible)
    .map((button) => `<li><strong>${escapeHtml(button.text || button.title || button.aria || "button")}</strong>${button.disabled ? " <em>(disabled)</em>" : ""}</li>`)
    .join("\n");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(label)}</title>
<style>
body { margin: 0; background: #0f172a; color: #e5e7eb; font: 16px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }
.frame { width: 1180px; min-height: 720px; margin: 0 auto; padding: 32px; box-sizing: border-box; }
.card { background: linear-gradient(145deg, #111827, #1e293b); border: 1px solid #334155; border-radius: 24px; padding: 32px; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
.kicker { color: #38bdf8; text-transform: uppercase; letter-spacing: .18em; font-size: 13px; font-weight: 800; }
h1 { font-size: 48px; margin: 10px 0 18px; }
pre { white-space: pre-wrap; line-height: 1.45; background: rgba(15,23,42,.8); border: 1px solid #334155; padding: 20px; border-radius: 16px; max-height: 420px; overflow: hidden; }
ul { columns: 2; gap: 32px; padding-left: 24px; }
li { break-inside: avoid; margin: 8px 0; color: #cbd5e1; }
em { color: #fca5a5; }
.meta { color: #94a3b8; font-size: 13px; margin-top: 18px; }
</style>
</head>
<body><main class="frame"><section class="card">
<div class="kicker">CTO Desktop E2E Snapshot · ${escapeHtml(label)}</div>
<h1>${escapeHtml(snapshot.heading || "No heading")}</h1>
<pre>${escapeHtml(snapshot.text || "")}</pre>
<h2>Visible controls</h2>
<ul>${buttons}</ul>
<div class="meta">${escapeHtml(snapshot.url || "")} · ${escapeHtml(snapshot.capturedAt || "")}</div>
</section></main></body></html>
`;
}

function renderSnapshotSvg(label, snapshot) {
  const width = 1280;
  const height = 900;
  const lines = wrap(`${snapshot.text ?? ""}`, 92).slice(0, 26);
  const controls = (snapshot.buttons ?? [])
    .filter((button) => button.visible)
    .map((button) => `${button.disabled ? "○" : "●"} ${button.text || button.title || button.aria || "button"}`)
    .slice(0, 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#1e293b"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#bg)"/>
<rect x="54" y="48" width="1172" height="804" rx="26" fill="#111827" stroke="#334155" stroke-width="2"/>
<text x="92" y="102" fill="#38bdf8" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18" font-weight="800" letter-spacing="3">CTO DESKTOP E2E SNAPSHOT · ${escapeXml(label.toUpperCase())}</text>
<text x="92" y="164" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="52" font-weight="800">${escapeXml(snapshot.heading || "No heading")}</text>
${lines.map((line, index) => `<text x="92" y="${222 + index * 24}" fill="#cbd5e1" font-family="Menlo, Consolas, monospace" font-size="18">${escapeXml(line)}</text>`).join("\n")}
<text x="760" y="222" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="26" font-weight="700">Visible controls</text>
${controls.map((line, index) => `<text x="760" y="${264 + index * 30}" fill="${line.startsWith("○") ? "#fca5a5" : "#86efac"}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="19">${escapeXml(line)}</text>`).join("\n")}
<text x="92" y="820" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="15">${escapeXml(snapshot.capturedAt || "")}</text>
</svg>\n`;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "snapshot";
}

function redact(value) {
  return value
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "gh_[REDACTED]")
    .replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, "[DEVICE-CODE-REDACTED]")
    .replace(/([?&](?:code|token|state)=)[^&\s]+/gi, "$1[REDACTED]");
}

function wrap(value, width) {
  const words = String(value).replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function escapeXml(value) {
  return escapeHtml(value).replace(/'/g, "&apos;");
}
