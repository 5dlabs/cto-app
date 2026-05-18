#!/usr/bin/env node
/**
 * One-shot: writes stylable transparent SVGs to ui/public/icons/*.svg
 *
 * - simpleIcon: copy from node_modules/simple-icons/icons/{slug}.svg (monochrome glyphs)
 * - svgUrl: fetch public SVG (Wikimedia, vendor static, etc.)
 *
 * Post-process: unify fills to currentColor (skips <defs> blobs) so consumers can
 * set color via CSS (e.g. color + currentColor, or mask-image).
 *
 * Run: npm run icons:openclaw-svgs
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const SI_DIR = join(REPO, "node_modules", "simple-icons", "icons");
const OUT = join(REPO, "ui", "public", "icons");

/** @type {Record<string, { simpleIcon?: string; svgUrl?: string }>} */
const SOURCES = {
  alibaba: { simpleIcon: "alibabadotcom" },
  anthropic: { simpleIcon: "anthropic" },
  arcee: { simpleIcon: "keras" },
  "azure-speech": {
    svgUrl:
      "https://upload.wikimedia.org/wikipedia/commons/f/fa/Microsoft_Azure.svg",
  },
  bedrock: {
    svgUrl:
      "https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg",
  },
  "bedrock-mantle": {
    svgUrl:
      "https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg",
  },
  byteplus: { simpleIcon: "bytedance" },
  cerebras: { simpleIcon: "riscv" },
  chutes: { simpleIcon: "railway" },
  "cloudflare-ai-gateway": { simpleIcon: "cloudflare" },
  comfy: { simpleIcon: "commonworkflowlanguage" },
  "claude-max-api-proxy": { simpleIcon: "claude" },
  deepgram: { simpleIcon: "deepgram" },
  deepinfra: {
    svgUrl:
      "https://deepinfra.com/_next/static/media/footer_logo.b3e9d8d3.svg",
  },
  deepseek: { simpleIcon: "deepseek" },
  elevenlabs: { simpleIcon: "elevenlabs" },
  fal: { simpleIcon: "socketdotio" },
  fireworks: { simpleIcon: "apachespark" },
  "github-copilot": { simpleIcon: "githubcopilot" },
  glm: { simpleIcon: "googlegemini" },
  google: { simpleIcon: "googlegemini" },
  gradium: { simpleIcon: "notion" },
  groq: { simpleIcon: "lightning" },
  huggingface: { simpleIcon: "huggingface" },
  /** Hermes harness (Simple Icons’ Hermès mark; stylable mono glyph). */
  hermes: { simpleIcon: "hermes" },
  inferrs: { simpleIcon: "kubernetes" },
  inworld: { simpleIcon: "steam" },
  kilocode: { simpleIcon: "gitlab" },
  litellm: { simpleIcon: "openapiinitiative" },
  lmstudio: { simpleIcon: "electron" },
  minimax: { simpleIcon: "stripe" },
  mistral: { simpleIcon: "mistralai" },
  moonshot: { simpleIcon: "moonshotai" },
  nvidia: { simpleIcon: "nvidia" },
  ollama: { simpleIcon: "ollama" },
  openai: {
    svgUrl:
      "https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg",
  },
  /** Official OpenClaw mark (docs favicon). */
  openclaw: {
    svgUrl: "https://docs.openclaw.ai/favicon.svg",
  },
  opencode: { simpleIcon: "replit" },
  "opencode-go": { simpleIcon: "go" },
  openrouter: { simpleIcon: "openapiinitiative" },
  "perplexity-provider": { simpleIcon: "perplexity" },
  qianfan: { simpleIcon: "baidu" },
  qwen: { simpleIcon: "alibabadotcom" },
  runway: { simpleIcon: "davinciresolve" },
  senseaudio: { simpleIcon: "spotify" },
  sglang: { simpleIcon: "jupyter" },
  stepfun: { simpleIcon: "pytorch" },
  synthetic: { simpleIcon: "matrix" },
  tencent: { simpleIcon: "qq" },
  together: { simpleIcon: "cloudflareworkers" },
  venice: { simpleIcon: "duckduckgo" },
  "vercel-ai-gateway": { simpleIcon: "vercel" },
  vllm: { simpleIcon: "apacheparquet" },
  volcengine: { simpleIcon: "bytedance" },
  vydra: { simpleIcon: "anaconda" },
  xai: { simpleIcon: "x" },
  xiaomi: { simpleIcon: "xiaomi" },
  zai: { simpleIcon: "baidu" },
};

/**
 * Keep <defs> blocks intact (clip paths), replace hard-coded fills elsewhere with currentColor.
 */
function stylizeForTheme(svgRaw) {
  const parts = svgRaw.split(/(<defs[\s\S]*?<\/defs>)/i);
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i];
    if (/^<defs[\s\S]*<\/defs>$/i.test(chunk)) {
      out += chunk;
      continue;
    }
    out += chunk
      .replace(/\bfill="url\([^)]+\)"/gi, 'fill="currentColor"')
      .replace(/\bfill='url\([^)]+\)'/gi, "fill='currentColor'")
      .replace(/\bfill="#[0-9a-fA-F]{3,8}"/g, 'fill="currentColor"')
      .replace(/\bfill='#[0-9a-fA-F]{3,8}'/g, "fill='currentColor'")
      .replace(/\bfill:#[0-9a-fA-F]{3,8}\b/g, "fill:currentColor")
      .replace(/\bstroke="#[0-9a-fA-F]{3,8}"/g, 'stroke="currentColor"')
      .replace(/\bstroke='#[0-9a-fA-F]{3,8}'/g, "stroke='currentColor'")
      .replace(/\bstroke:#[0-9a-fA-F]{3,8}\b/g, "stroke:currentColor");
  }
  let svg = out.trim();
  if (!/\bfill\s*=\s*"currentColor"/.test(svg.split(">")[0] + ">") && /^<svg\b/i.test(svg)) {
    svg = svg.replace(/^<svg\b/, '<svg fill="currentColor"');
  }
  // Drop orphan <defs> (e.g. gradients) when nothing references ids via url(#…).
  if (!/url\s*\(\s*#/.test(svg)) {
    svg = svg.replace(/<defs>[\s\S]*?<\/defs>\s*/gi, "");
  }
  // Avoid invalid duplicate fill on <svg …> (e.g. favicons with fill="none" + injected currentColor).
  svg = svg.replace(/^<svg\b[^>]+\>/i, (open) =>
    /\bfill\s*=\s*["']currentColor["']/i.test(open) && /\bfill\s*=\s*["']none["']/i.test(open)
      ? open.replace(/\bfill\s*=\s*["']none["']\s*/gi, "")
      : open,
  );
  return `${svg}\n`;
}

function readSimpleIcon(slug) {
  const p = join(SI_DIR, `${slug}.svg`);
  if (!existsSync(p)) throw new Error(`Simple Icon not found: ${slug} (${p})`);
  return readFileSync(p, "utf8");
}

async function fetchSvg(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "cto-app-icon-sync/1.0 (+https://github.com/5dlabs/cto-app)",
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const t = await r.text();
  if (!t.includes("<svg")) throw new Error(`Not SVG from ${url}`);
  return t;
}

async function resolveSource(entry) {
  if (entry.simpleIcon) return readSimpleIcon(entry.simpleIcon);
  if (entry.svgUrl) return fetchSvg(entry.svgUrl);
  throw new Error("Entry needs simpleIcon or svgUrl");
}

async function main() {
  if (!existsSync(SI_DIR)) {
    console.error(
      "Missing simple-icons package. From repo root: npm install --workspace cto-app-ui simple-icons",
    );
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const entries = Object.entries(SOURCES);
  /** @type string[] */
  const errors = [];

  for (const [filename, entry] of entries) {
    const slug = filename;
    const safeName = `${slug.replace(/[^a-z0-9_-]/gi, "_")}.svg`;
    try {
      const raw = await resolveSource(entry);
      writeFileSync(join(OUT, safeName), stylizeForTheme(raw), "utf8");
      console.log(`wrote ${safeName}`);
    } catch (e) {
      const msg = `${slug}: ${/** @type Error */ (e).message}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  if (errors.length) {
    console.error(`\n${errors.length} error(s).`);
    process.exit(1);
  }
  console.log(`Done. ${entries.length} SVG -> ${OUT}`);
}

main();
