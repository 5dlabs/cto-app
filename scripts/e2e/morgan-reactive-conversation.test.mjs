import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");
const voiceClient = readFileSync(new URL("../../ui/src/components/VoiceClient.ts", import.meta.url), "utf8");
const uxDoc = readFileSync(new URL("../../docs/2026-04/morgan-setup-ux-principles.md", import.meta.url), "utf8");

describe("Morgan reactive setup conversation", () => {
  it("uses one Morgan conversation shell instead of a static video-per-decision wizard", () => {
    assert.match(source, /local-bootstrap__conversation-shell/);
    assert.match(source, /local-bootstrap__decision-card/);
    assert.match(source, /morganConversationTurn/);
    assert.match(source, /activeMorganPrompt/);
    assert.match(source, /handleMorganSelection/);
    assert.match(source, /data-testid="morgan-conversation-shell"/);
  });

  it("keeps the Source decision card balanced while self-hosted paths are feature-flagged", () => {
    assert.match(source, /data-testid="source-install-github"/);
    assert.match(source, /data-testid="source-install-gitlab"/);
    assert.match(source, /data-testid="source-install-5d-origin"/);
    assert.match(source, /enableSelfHostedSource \? \(/);
    assert.doesNotMatch(source, /data-testid="source-install-gitea"/);
    assert.doesNotMatch(source, /data-testid="source-install-gitlab-cto"/);
    assert.match(source, /Icon5DOrigin/);
    assert.doesNotMatch(source, /IconUpload/);
  });

  it("acknowledges UI selections through voice-bridge speakCue before revealing the next decision", () => {
    assert.match(voiceClient, /type: "speak"/);
    assert.match(source, /speakMorganCue/);
    assert.match(source, /\.speakCue\(/);
    assert.match(source, /reason: "setup-selection"|"setup-selection"/);
    assert.match(source, /setMorganConversationTurn\(\(turn\) => turn \+ 1\)/);
  });

  it("documents economical ElevenLabs audio as the default for reactive turns", () => {
    assert.match(uxDoc, /single Morgan conversation/i);
    assert.match(uxDoc, /ElevenLabs audio/i);
    assert.match(uxDoc, /reactive acknowledgement/i);
    assert.match(uxDoc, /video.*anchor/i);
  });
});
