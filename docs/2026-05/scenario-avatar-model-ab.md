# Scenario avatar model check for Morgan setup videos

Date: 2026-05-12

## Question

Would the newer e-video/avatar-style model family be better for Morgan setup media than the current VEED Fabric Lipsync 1.0 path?

## Grounding

Queried Scenario through the local SDK and then wrapped the same checks in a local Scenario MCP server (`npm run mcp:scenario`). The MCP tool `scenario_recommend_morgan_avatar_models` compares:

- `model_veed-fabric-1-0` — Veed Fabric Lipsync 1.0
- `model_pruna-p-avatar` — P-Video Avatar / Pruna
- `model_creatify-aurora` — Creatify Aurora
- `model_kling-video-ai-avatar-v2-pro` — Kling AI Avatar 2 Pro
- `model_heygen-avatar4-i2v` — HeyGen Avatar 4
- `model_bytedance-omni-human-1-5` — Omni Human 1.5 (description says unavailable on Scenario)

Raw probe output is in `.local/scenario-mcp-recommendation.json`.

## Recommendation

Trial **P-Video Avatar** (`model_pruna-p-avatar`) first. It is the closest match to the requested “e-video avatar” direction and appears better than VEED for a cooler, less-stiff Morgan presenter if it preserves the portrait.

Why:

- It accepts the existing approved Morgan portrait as `image`.
- It accepts uploaded Morgan/voice-bridge audio as `audio`, so we can keep the required local ElevenLabs Morgan voice instead of using a built-in generic voice.
- Scenario describes it as supporting accurate lip sync plus natural micro-expressions.
- It has optional `videoPrompt` and `stylePrompt`, which can steer more movement without rewriting narration.
- It supports 720p and 1080p. Dry run estimated 44 CU at 720p and 78 CU at 1080p for the existing intro audio asset.
- Scenario marks it `sc:featured`.

Keep **VEED Fabric Lipsync 1.0** as the safe baseline. VEED is still described as high-fidelity lip sync for educational/talking-avatar content and is likely safer when mouth accuracy and identity stability matter more than extra movement.

Secondary trials:

1. **Creatify Aurora** (`model_creatify-aurora`) — best if we want upper-body/head/eye/gesture expressiveness, but needs an actual render check for identity drift.
2. **Kling AI Avatar 2 Pro** (`model_kling-video-ai-avatar-v2-pro`) — similar to VEED: strong lips/facial animation, less explicitly full-body expressive.

## Dry-run-compatible P-Avatar body

```json
{
  "image": "asset_qD8pdsjsSaZhoyUxWG523aiU",
  "audio": "asset_MW4ncj5gWkpdQg4aWqH58fvs",
  "resolution": "720p",
  "videoPrompt": "natural head motion, eye blinks, subtle friendly presenter gestures",
  "stylePrompt": "warm confident technical guide, preserve identity and outfit"
}
```

Note the key difference from VEED:

- VEED uses `audioUrl`.
- P-Avatar uses `audio`.

## Implemented source support

`npm run scenario:morgan-videos` now supports:

- `--model veed` (default)
- `--model p-avatar`
- `--model aurora`
- `--model kling`
- `--model <raw Scenario model id>`
- `--video-prompt <prompt>`
- `--style-prompt <prompt>`
- `--seed <n>`
- `--resolution 1080p` for P-Avatar trials

Example one-screen A/B trial:

```bash
npm run scenario:morgan-videos -- \
  --screens 01 \
  --model p-avatar \
  --resolution 720p \
  --video-prompt "natural head motion, eye blinks, subtle friendly presenter gestures" \
  --style-prompt "warm confident technical guide, preserve identity and outfit" \
  --seed 1234 \
  --force
```

Use the one-screen output to compare against the existing VEED `01_intro/morgan.mp4` before regenerating all setup screens.
