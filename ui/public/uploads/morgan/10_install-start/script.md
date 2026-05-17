# Morgan setup narration: Install start

Status: generated. Edit this Markdown before regenerating `morgan.mp3` and `morgan.mp4`.

## Script

All right, I have what I need. I am installing the local CTO stack now: first the container runtime checks, then kind, kubectl, Helm, and Argo CD if anything is missing. After that I bring up the Kind Kubernetes cluster, add ingress, metrics-server for Lens, and the Argo CD CRDs and controllers. Then I write the local secrets, register the CTO controller plus the Morgan bot and supporting platform apps, and let the CRDs take inventory so the install can reconcile the rest from GitOps.

## Generation notes

- Voice: Morgan via local `voice-bridge` / ElevenLabs voice ID `iP95p4xoKVk53GoZ742B`.
- Audio output: `morgan.mp3`.
- Video output: `morgan.mp4`.
- Video renderer: Scenario **P-Video Avatar / Pruna** (`model_pruna-p-avatar`) with the approved Morgan portrait and current `morgan.mp3` as uploaded source audio.
