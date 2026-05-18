# Seedance exact-audio workaround

Date: 2026-05-12

## Finding

Seedance 2.0 `referenceAudios` are **not** a reliable way to force exact source audio or verbatim script output. Scenario's Seedance guide describes reference audio as influencing rhythm, dialogue, and mood, with prompt examples such as "Use audio1 as the performance" and "Lip sync must follow the line verbatim." In practice, the generated clips still made up words and did not preserve the ElevenLabs Morgan voice.

Therefore, for Morgan setup narration, do **not** treat Seedance reference audio as exact narration input.

## Guaranteed exact voice/script workaround

Use Seedance for visuals only, then mux the original ElevenLabs Morgan MP3 into the generated video with ffmpeg. This guarantees exact words and exact voice. The tradeoff is that lip sync may be approximate rather than model-perfect.

Current test:

- Seedance source visual: `ui/public/uploads/morgan/ab/01_intro/seedance-verbatim/seedance-verbatim-first15s.mp4`
- Original ElevenLabs source chunk: `ui/public/uploads/morgan/ab/01_intro/seedance-verbatim/source/morgan-first-15s.mp3`
- Muxed output: `ui/public/uploads/morgan/ab/01_intro/seedance-verbatim-mux/seedance-video-original-elevenlabs-audio-first15s.mp4`
- Discord output: `ui/public/uploads/morgan/ab/01_intro/seedance-verbatim-mux/discord/seedance-video-original-elevenlabs-audio-first15s-discord.mp4`
- ffprobe: H.264 video + AAC audio, 960x960, exactly 15s.

Command pattern:

```bash
ffmpeg -y \
  -i seedance-visual.mp4 \
  -i elevenlabs-morgan.mp3 \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k \
  -shortest -movflags +faststart \
  seedance-video-original-elevenlabs-audio.mp4
```

## Recommendation

- If exact script/voice is mandatory and lip sync can be simple: use Seedance visual + muxed ElevenLabs audio only if review accepts the mouth alignment.
- If exact script/voice and reliable lip sync are both mandatory: use P-Video / Pruna or VEED, because they directly consume the uploaded Morgan MP3 as actual audio rather than generative conditioning.
- For deliberation/cinematic scenes where exact line fidelity is less strict: Seedance remains strong, especially with character/voice references and named `audio1`/`image1` prompts.
