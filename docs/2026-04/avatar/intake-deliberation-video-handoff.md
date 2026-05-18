# Intake deliberation-scene MP4 handoff

## Decision

For intake deliberation scenes, use **async batch MP4 rendering** instead of
realtime WebRTC. Deliberation can wait for a rendered clip, then pass the MP4
and metadata forward as normal intake artifacts.

## First provider call to try

**Preferred quality benchmark / first direct provider lane:** **FlashHead Pro** on
Hugging Face Space `soul-ailab-soulx-flashhead.hf.space`, with provider model
mode `pro`.

Why: today's best local result is already in this repo:

| Artifact | Evidence |
| --- | --- |
| `output/flashhead-pro-space-smoke/flashhead-pro-morgan-12s-remote.mp4` | 12.38s MP4, H.264, 512x512, 25fps, AAC mono; `773505` bytes |
| `output/flashhead-pro-space-smoke/flashhead-pro-morgan-12s-metadata.json` | `first_output_seconds=17.036`, `total_seconds=36.079`, `model=pro`, source audio `morgan-sample-12s.mp3` |
| `output/flashhead-pro-space-smoke/flashhead-pro-morgan-12s-contact-sheet.jpg` | visual review sheet for identity/mouth-motion regression |

Use this as the initial quality target because it is the latest/highest-signal
Morgan batch result and it produced a usable MP4 without requiring realtime
streaming infrastructure.

**First Scenario-managed provider call if the implementation must stay inside
Scenario's asset/job ledger:** `model_kling-video-ai-avatar-v2-pro` — **Kling AI
Avatar 2 (Pro)**.

Scenario MCP schema consulted:

```json
{
  "model_id": "model_kling-video-ai-avatar-v2-pro",
  "name": "Kling AI Avatar 2 (Pro)",
  "capabilities": ["img2video"],
  "parameters": {
    "image": "required file; avatar/source portrait",
    "audio": "required audio file; narration/lip-sync track; cost-impacting",
    "text": "optional action/emotion, e.g. speaking thoughtfully"
  }
}
```

Recommended payload shape for the future implementation ticket:

```json
{
  "model_id": "model_kling-video-ai-avatar-v2-pro",
  "parameters": {
    "image": "asset_<approved_morgan_or_agent_portrait>",
    "audio": "asset_<deliberation_scene_narration_mp3>",
    "text": "speaking thoughtfully in an intake deliberation scene, calm CTO tone, subtle head motion, stable identity"
  }
}
```

## Input contract and prompt guidance

1. **Portrait/image**
   - Use the accepted Morgan/agent source portrait or a per-scene still from the
design brief.
   - Prefer square, front-facing busts for talking-head providers.
   - Preserve identity: no human lips/teeth/skin for Morgan; no full-frame style
swaps between scenes.
2. **Audio**
   - Generate or collect final narration first; render video from the exact audio
that will ship.
   - Keep clips short enough for provider limits; the proven FlashHead sample was
~12s.
   - Store waveform/contact-sheet evidence beside every MP4.
3. **Prompt/text**
   - Describe performance, not product requirements: tone, emotion, speaking
style, gaze, subtle head/shoulder motion.
   - Avoid asking the video model to invent UI or architecture content; the
script/audio should carry the deliberation content.

## Expected output handling

Write generated artifacts into a stable bundle, then copy them into `.tasks/` so
`sync-to-target-repo` can include them with the rest of the intake handoff:

```text
.intake/deliberation-video/
  scenes/<scene-id>.mp4
  scenes/<scene-id>.metadata.json
  scenes/<scene-id>.contact-sheet.jpg
  manifest.json
.tasks/design/deliberation-video/
  scenes/<scene-id>.mp4
  scenes/<scene-id>.metadata.json
  scenes/<scene-id>.contact-sheet.jpg
  manifest.json
```

Minimum `manifest.json` fields:

```json
{
  "provider": "flashhead-pro|scenario",
  "model_id": "pro|model_kling-video-ai-avatar-v2-pro",
  "source_image": "path-or-scenario-asset-id",
  "source_audio": "path-or-scenario-asset-id",
  "output_mp4": ".tasks/design/deliberation-video/scenes/scene-01.mp4",
  "duration_seconds": 12.38,
  "first_output_seconds": 17.036,
  "total_seconds": 36.079,
  "review_assets": ["contact-sheet", "waveform"],
  "prompt": "..."
}
```

## Integration shape in intake

Current intake docs/workflows show:

- `intake/workflows/pipeline.lobster.yaml` owns the top-level graph and already
threads `deliberate`, `design_context`, and `.tasks/design/` artifacts.
- `intake/docs/intake-process.md` documents `.intake/design/*` and `.tasks/design/*`
as the design/artifact handoff bundle.
- `save-design-bundle` currently writes `.tasks/design/manifest.json`; later
`sync-to-target-repo` copies `.tasks/` into the target repo and generates
Storybook/design docs.

Future ticket should add a **post-deliberation async render step** that runs only
when `deliberate=true` and `deliberation_video=true` (new arg/flag). It should
not modify task parsing; it should append media artifacts and manifest pointers
that downstream agents can ignore if they do not need the scene MP4s.

## Batch option inventory

| Option | Use first when | Inputs | Caveats |
| --- | --- | --- | --- |
| FlashHead Pro Space, `model=pro` | Quality target / direct provider lane | source portrait + narration audio | HF Space/Gradio API stability and auth/rate limits need a wrapper; output may arrive as HLS/stream metadata and must be saved/remuxed to MP4. |
| Scenario `model_kling-video-ai-avatar-v2-pro` | Need managed Scenario assets/jobs | `image`, `audio`, optional `text` | Exact talking-avatar schema; cost tied to audio; validate output quality against FlashHead contact sheet. |
| Scenario `model_kling-v3-i2v-pro` | Need cinematic non-lip-sync scene motion | `startImage`, prompt or `multiPrompt`, optional `endImage`, `duration` string `"3"`-`"15"`, `generateAudio` | Scenario recommend marked it as quality default but it is not the exact image+audio lip-sync contract. Cost ~79 CU for recommended settings. |
| Scenario `model_ltx-2-19b-keyframes-to-video` | Need a short scene from several curated stills | `prompt`, `keyframes[]`, duration 3-20, optional `generateAudio`, seed | Better for storyboard/keyframe interpolation than avatar lip sync. |
| Scenario `model_scenario-image-seq-to-video` | Need deterministic assembly of already-generated expression frames | `images[]`, optional `audio`, `outputFormat=mp4`, `fps`, compression | Utility fallback; no generative lip-sync, but cheap/controlled if expression frames already exist. |
| VEED Fabric / OmniHuman 1.5 | External research fallback | likely image/video + audio | Not confirmed in Scenario MCP search in this pass; leave as provider-research follow-up. |

## Cost and latency caveats

- Do not run paid generation during planning. This handoff only records schemas
and existing artifacts.
- FlashHead Pro local evidence: first output ~17s and complete ~36s for a ~12s
clip, but hosted queue time may vary.
- Scenario recommendation for Kling V3 I2V Pro reported slow latency (~150s) and
~79 CU; Kling Avatar 2 Pro schema flags audio as cost-impacting but did not
return a CU estimate in the schema response.
- Persist provider/job IDs, elapsed timings, and content hashes for every run so
future tickets can compare quality/cost.

## Implementation checklist for the future ticket

- [ ] Add an opt-in pipeline arg such as `deliberation_video` plus a provider
selector defaulting to FlashHead Pro direct lane or Scenario Kling Avatar 2 Pro
when Scenario-only mode is required.
- [ ] Produce final narration audio before calling the video provider.
- [ ] Upload/register source image and audio when using Scenario; for FlashHead,
wrap the Gradio/HF call and download/remux the returned stream into MP4.
- [ ] Save MP4, metadata JSON, waveform, and contact sheet under
`.intake/deliberation-video/` and copy to `.tasks/design/deliberation-video/`.
- [ ] Add manifest pointers to `.tasks/design/manifest.json` without disturbing
existing component-library/Storybook handoff fields.
- [ ] Gate on provider success only when video is explicitly required; otherwise
record a warning and continue intake.
- [ ] Add a docs/test fixture that validates manifest paths exist and MP4 metadata
can be read.

## Open questions

1. Should FlashHead Pro be called directly from the intake runner, or proxied
through a Scenario/custom provider adapter for centralized assets and cost logs?
2. What is the canonical Morgan/agent portrait asset ID/path for non-avatar
intake projects?
3. Should deliberation video be one combined scene or per-agent/per-decision-point
clips?
4. What cost ceiling should pause generation and fall back to static contact
sheets or `Sequence-to-Video`?
5. Should generated MP4s be committed to target repos, uploaded to object storage,
or both?
