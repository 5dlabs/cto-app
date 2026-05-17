# P-Video Avatar vs Kling — current Morgan audio

Side-by-side comparison for `01_intro` Morgan setup narration.

- Left: P-Video Avatar / Pruna (`model_pruna-p-avatar`)
- Right: Kling AI Avatar 2 Pro (`model_kling-video-ai-avatar-v2-pro`)
- Audio track in comparison file: P-Video/current Morgan MP3 audio, so the two sides can be judged visually against the same exact narration.
- Source audio: `ui/public/uploads/morgan/01_intro/morgan.mp3`
- Approved Morgan portrait asset: `asset_qD8pdsjsSaZhoyUxWG523aiU`

Files:

- P-Video original: `../p-avatar-current-audio/p-avatar-current-audio.mp4`
- P-Video Discord-compressed: `../p-avatar-current-audio/p-avatar-current-audio-discord.mp4`
- Kling original: `../kling-current-audio/kling-current-audio.mp4`
- Kling Discord-compressed: `../kling-current-audio/discord/kling-current-audio-discord.mp4`
- Side-by-side: `pvideo-left-kling-right-current-audio.mp4`

Audio verification vs source MP3:

- P-Video: correlation ≈ `0.99996`
- Kling: correlation ≈ `0.99879`
- Side-by-side comparison: correlation ≈ `0.99974`

Models tried so far:

- VEED Fabric Lipsync 1.0 — production baseline.
- P-Video Avatar / Pruna — uploaded audio, micro-expressions, current comparison candidate.
- Kling AI Avatar 2 Pro — uploaded audio, high-fidelity lip sync, current comparison candidate.
- Creatify Aurora — existing A/B output at `../aurora.mp4`, generated with earlier uploaded intro audio asset.
- Seedance 2.0 — visually interesting, but not deterministic for exact setup narration; muxing fixes audio but not mouth sync.
