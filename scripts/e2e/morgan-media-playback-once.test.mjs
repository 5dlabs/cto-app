import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../../ui/src/runtime.ts", import.meta.url), "utf8");
const viteEnvSource = readFileSync(new URL("../../ui/src/vite-env.d.ts", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../../ui/package.json", import.meta.url), "utf8");

function functionRegion(name, nextName) {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `${name} should exist`);
  const explicitEnd = nextName ? source.indexOf(`const ${nextName} =`, start) : -1;
  const fallbackEnd = source.indexOf("  const speakMorganCue", start);
  const end = explicitEnd !== -1 ? explicitEnd : fallbackEnd;
  assert.notEqual(end, -1, `${name} region should have a delimiter`);
  return source.slice(start, end);
}

describe("Morgan first-screen media playback", () => {
  it("keeps every referenced setup media screen backed by a video file", () => {
    const slugs = Array.from(source.matchAll(/:\s*"([0-9]{2}_[^"]+)"/g), (match) => match[1]);
    assert.ok(slugs.includes("02_saved-access"), "Saved access media slug should be covered");
    assert.ok(slugs.includes("03_endpoint"), "Cloudflare endpoint media slug should be covered");
    for (const slug of slugs) {
      const mediaPath = new URL(`../../ui/public/uploads/morgan/${slug}/morgan.mp4`, import.meta.url);
      assert.ok(readFileSync(mediaPath).byteLength > 0, `${slug} should have a playable morgan.mp4`);
    }
  });

  it("loads main Morgan video/caption files and conditionals from keyed files", () => {
    assert.match(source, /const morganMediaBasename = morganConditionalMediaKey \?\? "morgan";/);
    assert.match(source, /const morganCaptionBasename = morganConditionalMediaKey \?\? "captions";/);
    assert.match(source, /`\/uploads\/morgan\/\$\{morganMediaSlug\}\/\$\{morganMediaBasename\}\.mp4`/);
    assert.match(source, /`\/uploads\/morgan\/\$\{morganMediaSlug\}\/\$\{morganCaptionBasename\}\.vtt`/);
    assert.doesNotMatch(source, /`\/uploads\/morgan\/\$\{morganMediaSlug\}\/\$\{morganMediaBasename\}\.mp3`/);
    assert.doesNotMatch(source, /`\/uploads\/morgan\/\$\{activeMorganMediaSlug\}\.mp4`/);
    assert.doesNotMatch(source, /`\/uploads\/morgan\/\$\{activeMorganMediaSlug\}\.mp3`/);
    assert.doesNotMatch(source, /`\/uploads\/morgan\/\$\{activeMorganMediaSlug\}\.vtt`/);
  });

  it("shows Morgan video on every setup screen with generated main media", () => {
    assert.match(source, /const MORGAN_PORTRAIT_ONLY_SCREENS: ReadonlySet<SetupScreen> = new Set\(\);/);
    assert.match(source, /const shouldShowMorganVideo = Boolean\(morganConditionalMediaKey\) \|\| state === "checking" \|\| !MORGAN_PORTRAIT_ONLY_SCREENS\.has\(setupScreen\);/);
  });

  it("does not keep live-demo no-op bootstrap switches in the real setup flow", () => {
    for (const checkedSource of [source, runtimeSource, viteEnvSource, packageSource]) {
      assert.doesNotMatch(checkedSource, /SETUP_DEMO_ADVANCE_MS/);
      assert.doesNotMatch(checkedSource, /VITE_CTO_SETUP_DEMO/);
      assert.doesNotMatch(checkedSource, /isSetupDemoMode/);
      assert.doesNotMatch(checkedSource, /isSetupDemoAutoAdvanceMode/);
      assert.doesNotMatch(checkedSource, /runDemoBootstrap/);
      assert.doesNotMatch(checkedSource, /demoAdvanceToNextScreen/);
      assert.doesNotMatch(checkedSource, /setupDemo/);
      assert.doesNotMatch(checkedSource, /Demo baseline prepared/);
      assert.doesNotMatch(checkedSource, /Demo install complete/);
    }
  });

  it("routes setup prep and Start through the real Tauri bootstrap commands", () => {
    assert.match(source, /await invokeTauri\("prepare_local_stack_dependencies"\)/);
    assert.match(source, /await persistSourceConnection\(\);/);
    assert.match(source, /await invokeTauri\("bootstrap_local_stack", \{/);
    assert.match(source, /disabled=\{!canContinue\}/);
    const runBootstrapRegion = source.slice(
      source.indexOf("const runBootstrap ="),
      source.indexOf("  useEffect(() => {", source.indexOf("const runBootstrap =")),
    );
    assert.match(runBootstrapRegion, /invokeTauri\("bootstrap_local_stack"/);
    assert.doesNotMatch(runBootstrapRegion, /setState\("ready"\)[\s\S]{0,400}return;/);
  });

  it("does not restart ended intro video after it already played once", () => {
    assert.match(source, /playedMorganVideoKeys\s*=\s*useRef<Set<string>>/);
    assert.match(source, /const shouldRestartEndedMedia\s*=\s*Boolean\(options\.restartEnded\)\s*&&\s*!playedMorganVideoKeys\.current\.has\(mediaKey\)/);
    assert.match(source, /playedMorganVideoKeys\.current\.add\(morganVariantKey\)/);

    const videoRegion = functionRegion("playMorganVideo", "speakMorganCue");

    assert.doesNotMatch(videoRegion, /if \(video\.ended\) \{\s*video\.currentTime = 0;\s*\}/);
    assert.match(videoRegion, /if \(video\.ended && !shouldRestartEndedMedia\) return;/);
  });

  it("does not invoke play on every can-play event after playback has already started", () => {
    assert.match(source, /data-morgan-media-key=\{morganVariantKey\}/);
    assert.match(source, /onCanPlay=\{handleMorganVideoCanPlay\}/);
    assert.match(source, /const handleMorganVideoCanPlay = \(\) => \{\s*if \(playedMorganVideoKeys\.current\.has\(morganVariantKey\)\) return;\s*const video = morganVideoRef\.current;\s*if \(video\) \{\s*video\.muted = !morganAudioUnlocked;\s*video\.defaultMuted = !morganAudioUnlocked;\s*\}\s*void playMorganVideo\(\{ restartEnded: true, force: true, audible: morganAudioUnlocked \}\);\s*\};/);
    assert.match(source, /const setMorganVideoRef = useCallback/);
    assert.match(source, /ref=\{setMorganVideoRef\}/);
    assert.doesNotMatch(source, /onCanPlay=\{\(\) => void playMorganVideo\(\)\}/);
    assert.doesNotMatch(source, /onCanPlay=\{\(\) => void playMorganAudio\(\)\}/);
  });

  it("advances intro setup from MP4 completion", () => {
    const videoEndedRegion = source.slice(
      source.indexOf("const handleMorganVideoEnded ="),
      source.indexOf("  const handleMorganVideoCanPlay =", source.indexOf("const handleMorganVideoEnded =")),
    );
    assert.match(videoEndedRegion, /if \(isIntro && dependencyPrepState === "idle"\)/);
    assert.doesNotMatch(source, /const handleMorganAudioEnded =/);
  });

  it("keeps Morgan media chrome-free and uses only the MP4 video element", () => {
    assert.match(source, /<video[\s\S]*autoPlay=\{false\}[\s\S]*muted=\{!morganAudioUnlocked\}[\s\S]*playsInline[\s\S]*preload="auto"/);
    assert.match(source, /const playMorganVideo = useCallback/);
    assert.match(source, /video\.muted = !options\.audible;/);
    assert.match(source, /video\.defaultMuted = !options\.audible;/);
    assert.match(source, /const startMorganSetup = useCallback/);
    assert.doesNotMatch(source, /className="local-bootstrap__morgan-start"/);
    assert.match(source, /data-testid="prepare-cluster-dependencies"[\s\S]*onClick=\{startMorganSetup\}/);
    assert.doesNotMatch(source, /video\.muted = false;/);
    assert.doesNotMatch(source, /<audio/);
    assert.doesNotMatch(source, /morganAudioRef/);
    assert.doesNotMatch(source, /playMorganAudio/);
    assert.doesNotMatch(source, /IconVolume/);
    assert.doesNotMatch(source, /morganAudioMuted/);
    assert.doesNotMatch(source, /audioWarning/);
    assert.doesNotMatch(source, /controls(?:=|\s|>)/);
    assert.doesNotMatch(source, /Enable audio playback so you can hear Morgan during setup/);
  });
});
