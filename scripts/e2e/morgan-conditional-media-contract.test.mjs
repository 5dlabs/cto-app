import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const contract = JSON.parse(
  readFileSync(new URL("./intent/morgan-setup.intent.json", import.meta.url), "utf8"),
);
const source = readFileSync(
  new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url),
  "utf8",
);

const screenFolders = new Map(contract.screens.map((screen) => [screen.id, screen.mediaFolder]));
const conditionals = [
  ...contract.screens.flatMap((screen) =>
    (screen.conditionalMedia ?? []).map((key) => ({ screenId: screen.id, folder: screen.mediaFolder, key })),
  ),
];

function fileUrl(folder, key, ext) {
  return new URL(`../../ui/public/uploads/morgan/${folder}/${key}.${ext}`, import.meta.url);
}

function fileText(folder, key, ext) {
  return readFileSync(fileUrl(folder, key, ext), "utf8").trim();
}

function ffprobe(file) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height",
      "-of",
      "json",
      file.pathname,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

describe("Morgan conditional media contract", () => {
  it("declares the Saved access and endpoint media folders used by the UI", () => {
    assert.equal(screenFolders.get("saved-access"), "02_saved-access");
    assert.equal(screenFolders.get("endpoint"), "03_endpoint");
    assert.match(source, /const morganMediaBasename = morganConditionalMediaKey \?\? "morgan";/);
    assert.match(source, /const morganCaptionBasename = morganConditionalMediaKey \?\? "captions";/);
    assert.match(source, /const morganVideoSrc = morganMediaSlug \? `\/uploads\/morgan\/\$\{morganMediaSlug\}\/\$\{morganMediaBasename\}\.mp4` : "";/);
    assert.doesNotMatch(source, /const morganAudioSrc =/);
    assert.match(source, /const morganCaptionsSrc = morganMediaSlug \? `\/uploads\/morgan\/\$\{morganMediaSlug\}\/\$\{morganCaptionBasename\}\.vtt` : "";/);
  });

  it("keeps every conditional media key backed by MP3, MP4, VTT, and markdown transcript files", () => {
    assert.ok(conditionals.length >= 13, "conditional media contract should include saved-access and endpoint branches");
    for (const { folder, key } of conditionals) {
      for (const ext of ["mp3", "mp4", "vtt", "md"]) {
        const media = fileUrl(folder, key, ext);
        assert.ok(existsSync(media), `${folder}/${key}.${ext} should exist`);
        assert.ok(statSync(media).size > 0, `${folder}/${key}.${ext} should not be empty`);
      }
      const transcript = fileText(folder, key, "md");
      const captions = fileText(folder, key, "vtt");
      assert.match(captions, /^WEBVTT/);
      assert.ok(captions.includes(transcript), `${folder}/${key}.vtt should contain transcript text`);
    }
  });

  it("uses playable P-Video/Pruna MP4s for every conditional branch", () => {
    for (const { folder, key } of conditionals) {
      const probe = ffprobe(fileUrl(folder, key, "mp4"));
      const [stream] = probe.streams ?? [];
      assert.equal(stream?.codec_name, "h264", `${folder}/${key}.mp4 should be H.264`);
      assert.equal(stream?.width, 960, `${folder}/${key}.mp4 should be 960px wide`);
      assert.equal(stream?.height, 960, `${folder}/${key}.mp4 should be 960px tall`);
    }
  });

  it("does not leave the old saved-access audio-only cue player wired in the conditional path", () => {
    assert.doesNotMatch(source, /savedAccessCueAudioRef/);
    assert.doesNotMatch(source, /savedAccessCueAudioSrc/);
    assert.doesNotMatch(source, /data-testid="saved-access-condition-audio"/);
    assert.doesNotMatch(source, /lastSavedAccessCue/);
  });
});
