# Morgan Avatar A/B Settings — 01_intro

## Decision from Scenario MCP

Seedance 2.0 is **not appropriate** for production Morgan setup narration when we need exact script + exact ElevenLabs/Morgan voice + mouth sync.

Why:
- MCP description for Seedance: general reference-aware video model; supports optional audio refs and generated audio, 4–15s clips.
- It does **not** expose a required source-audio input like avatar/lipsync models do.
- Our generated Seedance audio does not match the source audio: correlation vs source 15s is ~0.0.
- The mux workaround guarantees exact audio, but the video was animated against Seedance's generated/paraphrased audio, so mouth sync can be wrong.

Use Seedance only for visuals/cinematic experiments, or if exact narration is not required.

## Better models for this use case

### P-Video Avatar / Pruna
- modelId: `model_pruna-p-avatar`
- Inputs used: `image`, `audio`, `resolution`, `videoPrompt`, `stylePrompt`, `seed`
- MCP says it accepts uploaded audio and supports accurate lip sync + natural micro-expressions.
- Existing output: `../p-avatar.mp4`

### Kling AI Avatar 2 Pro
- modelId: `model_kling-video-ai-avatar-v2-pro`
- Inputs used: `image`, `audio`, `text`
- MCP says static character image + audio file; maps phonemes to facial movements; prioritizes high-fidelity lip sync.
- Latest output using current local `01_intro/morgan.mp3`: `kling-current-audio.mp4`
- Discord-compressed: `discord/kling-current-audio-discord.mp4`

## Files / naming

Root A/B folder:
`ui/public/uploads/morgan/ab/01_intro/`

Named by model/experiment:
- `p-avatar.mp4` — P-Video Avatar / Pruna
- `kling.mp4` — Kling AI Avatar 2 Pro using earlier uploaded intro audio asset
- `aurora.mp4` — Creatify Aurora
- `seedance.mp4` — Seedance text/prompt generation
- `seedance-verbatim/seedance-verbatim-first15s.mp4` — Seedance with reference audio, generated/paraphrased audio
- `seedance-verbatim-mux/seedance-video-original-elevenlabs-audio-first15s.mp4` — Seedance video with original ElevenLabs first-15s audio muxed in; exact audio, weaker mouth sync
- `kling-current-audio/kling-current-audio.mp4` — Kling using current local `01_intro/morgan.mp3`

## Latest Kling-current settings

```json
{
  "modelId": "model_kling-video-ai-avatar-v2-pro",
  "image": "asset_qD8pdsjsSaZhoyUxWG523aiU",
  "audio": "asset_vQHkR56iEkgwEGzgrHufD6Hi",
  "sourceAudioPath": "ui/public/uploads/morgan/01_intro/morgan.mp3",
  "text": "Morgan speaks as a friendly CTO setup guide. Preserve Morgan as a non-human golden retriever character with glasses, leather gloves, clipboard, and calm confident presenter motion. No background music. Use the uploaded audio exactly as the speech track."
}
```

## Audio verification

- `seedance-verbatim-first15s-discord.mp4` vs source first-15s MP3: correlation ≈ -0.005 — not the source audio.
- `seedance-video-original-elevenlabs-audio-first15s.mp4` vs source first-15s MP3: correlation ≈ 0.99998 — exact audio muxed in, but mouth sync can be off.
- `kling-current-audio.mp4` vs current local `01_intro/morgan.mp3`: correlation ≈ 0.99879 — it is using the current Morgan MP3 as the audio track.

## Recommendation

Move on from Seedance for setup narration. Trial Kling-current and/or P-Video Avatar for production replacement. Keep VEED as baseline if those fail visually.
