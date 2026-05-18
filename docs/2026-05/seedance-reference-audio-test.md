# Seedance reference-audio Morgan test

Date: 2026-05-12

## Outcome

Seedance can use uploaded ElevenLabs Morgan MP3 assets through `referenceAudios`, but exact script/voice fidelity must be validated by listening. Actual generated reference-audio clips were produced and posted to Discord.

The first reference-audio tests accidentally allowed humanization risk. The corrected verbatim test explicitly says Morgan is a non-human anthropomorphic golden retriever dog and uses a fresh 15-second chunk of the existing ElevenLabs Morgan MP3.

## Seedance constraints

- Seedance 2.0 duration is 4 to 15 seconds.
- `ui/public/uploads/morgan/01_intro/morgan.mp3` is ~20.5 seconds.
- Full setup narration must therefore be either:
  - shortened to <=15s per screen, or
  - chunked into multiple <=15s clips and stitched/played sequentially.

## Recommended Seedance setup body

For single-Morgan setup clips, use the Morgan image as the first frame plus `referenceAudios` with an ElevenLabs Morgan MP3 asset. Do not use a last frame unless we need to force the final pose/composition; a last frame can overconstrain a simple talking-head clip.

Use `audio1` explicitly in the prompt because Scenario's Seedance docs say reference audio slots map to `audio1`, `audio2`, and `audio3`.

```json
{
  "image": "asset_qD8pdsjsSaZhoyUxWG523aiU",
  "referenceAudios": ["<uploaded-elevenlabs-morgan-mp3-asset>"],
  "prompt": "Create a talking-head setup guide clip from the opening frame. The opening frame / image1 is Morgan, a non-human anthropomorphic golden retriever dog character, not a human, not a woman, not a man. Preserve Morgan's dog muzzle, canine nose, fur, glasses, leather gloves, clipboard, outfit, and friendly CTO guide identity. Do not humanize Morgan. Reference audio audio1 is the exact ElevenLabs Morgan narration. Sync the dialogue to audio1 verbatim; do not paraphrase, replace words, improvise, or use a different voice. The spoken words must be exactly from audio1. Subtle natural presenter motion only: small head turns, eye blinks, mouth movement on the canine muzzle, slight hand/clipboard motion. Keep the same single-character composition.",
  "resolution": "720p",
  "duration": 15,
  "aspectRatio": "1:1",
  "seed": 5101,
  "generateAudio": true
}
```

## Corrected verbatim test

- Source audio: first 15 seconds of `ui/public/uploads/morgan/01_intro/morgan.mp3`
- Uploaded Scenario audio asset: `asset_hUjUFJZ8XUvPp6wrrWVutWUM`
- Job: `job_bt48KZzWNpfANaANce6PQCyG`
- Asset: `asset_DqJEP5NQAfSmMyNYkbfAZLdP`
- Local: `ui/public/uploads/morgan/ab/01_intro/seedance-verbatim/seedance-verbatim-first15s.mp4`
- Discord: `ui/public/uploads/morgan/ab/01_intro/seedance-verbatim/discord/seedance-verbatim-first15s-discord.mp4`
- ffprobe: H.264 video + AAC audio, 960x960, 15s

A frame review at ~2s confirms the corrected clip preserves Morgan as an anthropomorphic golden retriever dog, not a human. Remaining likely risks: humanlike gloved hands, generated/illegible UI/background text, and possible voice/script drift pending listening.

## Earlier side-by-side outputs

### A — first frame image + referenceAudios

- Job: `job_bi8PcpsaKhwbjznHo6BWbBAT`
- Asset: `asset_LzKqRyipscSmqD7Skz1Ycakx`
- Local: `ui/public/uploads/morgan/ab/01_intro/seedance-reference-audio/firstFrame_referenceAudio.mp4`
- Discord: `ui/public/uploads/morgan/ab/01_intro/seedance-reference-audio/discord/firstFrame_referenceAudio-discord.mp4`
- ffprobe: H.264 video + AAC audio, 960x960, ~4.09s

### B — named multimodal refs

- Job: `job_2c8n5zWq2nrKhu2aaAtwkEMC`
- Asset: `asset_KhrezBpk5WSC6cFW5YcPZ41P`
- Local: `ui/public/uploads/morgan/ab/01_intro/seedance-reference-audio/namedRefs_image_audio.mp4`
- Discord: `ui/public/uploads/morgan/ab/01_intro/seedance-reference-audio/discord/namedRefs_image_audio-discord.mp4`
- ffprobe: H.264 video + AAC audio, 960x960, ~4.09s

## Retry/resume mechanism

`node scripts/wait-seedance-verbatim.mjs --daemon` persists job state to `ui/public/uploads/morgan/ab/01_intro/seedance-verbatim/ledger.json`, tolerates transient Scenario/network errors, and can be rerun anytime. It resumes from the saved job id and downloads the asset once the job succeeds.

For longer media jobs, prefer a resumable waiter over a one-shot `job.wait()` call because Scenario/network connectivity can drop while the job itself continues server-side.

## Guidance

- For Morgan setup narration: use the corrected `image` + `referenceAudios` + explicit non-human/verbatim prompt shape.
- For future deliberation scenes: use named refs (`inputReferences`) so the prompt can call out each character image and each voice explicitly.
- Keep P-Video as the fallback if listening reveals Seedance reference audio is not exact enough for verbatim setup scripts.
