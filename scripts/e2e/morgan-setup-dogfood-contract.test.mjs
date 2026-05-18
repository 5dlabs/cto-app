import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "../../ui/src/components/LocalStackBootstrap.tsx"), "utf8");

describe("Morgan setup dogfood contracts", () => {
  it("keeps the MP3 audio element mounted while attempting video so unsupported MP4 falls back to audio", () => {
    assert.match(source, /const hasMorganAudio = Boolean\(morganMediaSlug\)/);
    assert.match(source, /\{hasMorganAudio \? \(\s*<audio/s);
    assert.match(source, /if \(hasMorganVideo\) return;\s*if \(playedMorganMediaKeys\.current\.has\(morganVariantKey\)\) return;\s*void playMorganAudio/s);
    assert.match(source, /setMorganVideoUnavailable\(true\);[\s\S]*void playMorganAudio\(\{ restartEnded: !playedMorganMediaKeys\.current\.has\(mediaKey\) \}\)/);
  });

  it("adds an explicit keyboard handler for the 1Password icon tile", () => {
    assert.match(source, /data-testid="saved-access-onepassword"[\s\S]*onKeyDown=\{\(event\) => \{[\s\S]*event\.currentTarget\.click\(\)/);
  });
});
