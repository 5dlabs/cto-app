# Copilot Instructions

## Required rules

1. **Morgan voice and avatar generation:** Always use the local `voice-bridge` Morgan voice for Morgan setup narration. Generate narration through `voice-bridge`/ElevenLabs with voice ID `iP95p4xoKVk53GoZ742B` before creating lip-synced Morgan videos. For setup videos, use Scenario **Veed Fabric Lipsync 1.0** with the Morgan portrait and the generated Morgan MP3. Do not use macOS `say`, generic TTS, or placeholder voices for Morgan.

## Notes

- Morgan setup media lives under `ui/public/uploads/morgan/<number>_<screen>/` in setup flow order.
- Each setup screen folder should use `script.md` as the editable narration source, with generated assets named `morgan.mp3` and `morgan.mp4`.
- Existing screen folders are `01_intro`, `02_source`, `03_harness`, `04_clis`, `05_providers`, `06_provider-models`, `07_provider-auth`, `08_tools`, and `09_agent-tokens`.
