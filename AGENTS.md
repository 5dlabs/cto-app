# Agent Instructions

## Required rules

1. **Morgan voice and avatar generation:** Always use the local `voice-bridge` Morgan voice for Morgan setup narration. Generate narration through `voice-bridge`/ElevenLabs with voice ID `iP95p4xoKVk53GoZ742B` before creating lip-synced Morgan videos. For current setup videos, use Scenario **P-Video Avatar / Pruna** (`model_pruna-p-avatar`) with the Morgan portrait and the generated Morgan MP3. Do not use macOS `say`, generic TTS, or placeholder voices for Morgan.
2. **Icon-first UI affordances:** When an action or field already has a recognizable icon available, prefer the icon over redundant visible label text. Setup choice screens should be icon-heavy with minimal visible copy because Morgan narration explains context. Put explanatory text in Morgan scripts, modals, `aria-label`, `title`, or screen-reader-only text where needed.

## Notes

- Morgan setup media lives under `ui/public/uploads/morgan/<number>_<screen>/` in setup flow order.
- Each setup screen folder should use `script.md` as the editable narration source, with generated assets named `morgan.mp3` and `morgan.mp4`.
- Active screen folders are `01_intro`, `02_saved-access`, `03_endpoint`, `04_source`, `05_harness`, `06_clis`, `07_providers`, `08_provider-models`, `09_harness-routing`, `10_provider-auth`, `11_tools`, `12_agent-tokens`, and `13_install-start`.
- Conditional Morgan branch media lives beside the relevant screen media using the branch key as the basename, e.g. `02_saved-access/onepassword-ready.{md,vtt,mp3,mp4}` or `03_endpoint/cloudflare-login.{md,vtt,mp3,mp4}`.
- The public agent Helm chart supports a single `harness` value with `openclaw` and `hermes` modes. Use Hermes docs at `https://hermes-agent.nousresearch.com/docs/` and the v2026.4.23 release notes at `https://github.com/NousResearch/hermes-agent/releases/tag/v2026.4.23` as reference material, but validate chart behavior locally before treating those references as implementation truth.
