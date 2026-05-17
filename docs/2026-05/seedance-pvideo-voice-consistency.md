# Seedance vs P-Video voice consistency note

Date: 2026-05-12

## Decision context

User prefers Seedance and P-Video visually. The deciding factor is which can preserve a consistent Morgan voice across setup and other applications.

## What is verified

### P-Video Avatar / Pruna

- Model: `model_pruna-p-avatar`
- Input body uses uploaded Morgan MP3 asset as `audio`.
- Previous A/B output includes an AAC audio stream.
- This is the safer verbatim narration path because the model is explicitly audio-driven for talking-avatar/lip-sync use.

### Seedance 2.0

- Model: `model_bytedance-seedance-2-0`
- Scenario docs/model description say Seedance supports multimodal refs, including up to three optional audio tracks with refs, and synced optional audio via Generate Audio.
- Dry-runs accepted many audio/reference shapes, including `audio`, `referenceAudios`, `audioTracks`, and `generateAudio`.
- Probe 1: `{ image, audio, ..., generateAudio: false }` generated video-only output with no audio stream. That suggests `generateAudio:false` suppresses audio even when an audio asset is present.
- Probe 2: `{ image, audio, ..., generateAudio: true }` generated a video with an AAC audio stream:
  - Job: `job_nJ7P7R7weYg7iFZWPMmtH2tR`
  - Asset: `asset_5av5JzKLuANhYrN9GtM8wg7H`
  - Local: `ui/public/uploads/morgan/ab/01_intro/seedance-voice-lock-generate-audio/seedance-audio-input-generate-audio.mp4`
  - Discord-compressed: `ui/public/uploads/morgan/ab/01_intro/seedance-voice-lock-generate-audio/discord/seedance-audio-input-generate-audio-discord.mp4`
  - Duration: ~4.09s

## Current recommendation

- Use **P-Video** when verbatim narration is mandatory and we need deterministic use of the Morgan MP3.
- Use **Seedance** if the short `audio + generateAudio:true` probe sounds close enough to Morgan and follows timing/words acceptably; visually it is better and likely better for future deliberation/multi-character scenes.
- Do not switch all Morgan setup videos to Seedance until we validate a full-length screen using the `audio + generateAudio:true` body and confirm it does not paraphrase, invent words, or drift voice.

## Seedance candidate body

```json
{
  "image": "asset_qD8pdsjsSaZhoyUxWG523aiU",
  "audio": "asset_MW4ncj5gWkpdQg4aWqH58fvs",
  "prompt": "Morgan speaks using the provided audio track, matching the voice and timing exactly. Preserve Morgan identity, leather gloves, clipboard, outfit, and calm technical-guide presence. Simple talking head.",
  "resolution": "720p",
  "duration": 4,
  "aspectRatio": "1:1",
  "seed": 9877,
  "generateAudio": true
}
```

## Open risk

Scenario dry-run does not reveal whether Seedance treats audio as exact source audio, style/reference audio, or conditioning for generated audio. The actual probe must be listened to. If it changes words or voice, P-Video remains the voice-safe path.
