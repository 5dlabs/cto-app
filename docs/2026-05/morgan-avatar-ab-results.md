# Morgan 01 Intro Avatar A/B Results

Date: 2026-05-12

## Reference and prompt

- Approved Morgan reference image: `asset_qD8pdsjsSaZhoyUxWG523aiU`
- Scenario team: `team_XfrxmeZdwYVdv8QuYZGoCLRD`
- Scenario project: `proj_vep6btTPJRGyLAypys4kvxkL`
- Baseline production video: `ui/public/uploads/morgan/01_intro/morgan.mp4`
- Baseline model: `model_veed-fabric-1-0` / VEED Fabric Lipsync 1.0
- Source audio asset: `asset_MW4ncj5gWkpdQg4aWqH58fvs`
- Script: `ui/public/uploads/morgan/01_intro/script.md`

Prompt/script used:

> Welcome to CTO. I’m Morgan. First I’m going to prepare the Client Cluster on this workstation: the local runtime, Kind, ingress, Argo CD, and the baseline CTO services. You can watch the status here while I do the heavy lifting. When the cluster is ready, we’ll check Secrets before touching Cloudflare or Source.

## Generated outputs

All files are review-only A/B outputs and do not overwrite production `morgan.mp4`.

| Alias | Model | Job | Asset | Est. CU | Output |
| --- | --- | --- | --- | ---: | --- |
| p-avatar | P-Video Avatar / Pruna (`model_pruna-p-avatar`) | `job_WQuNENDHs5pJUPAH76Vzpkf9` | `asset_98FoMugNkMEF6MHKGtiUuT3v` | 44 | `ui/public/uploads/morgan/ab/01_intro/p-avatar.mp4` |
| aurora | Creatify Aurora (`model_creatify-aurora`) | `job_tgsvJDatpGYzcafxYpN9uU17` | `asset_FxR7Pq5T8Y6C5t6amSHVcP4x` | 364 | `ui/public/uploads/morgan/ab/01_intro/aurora.mp4` |
| kling | Kling AI Avatar 2 Pro (`model_kling-video-ai-avatar-v2-pro`) | `job_tfMjaCJw8hFvUnjTz4cMz8uY` | `asset_CJw8dmtWF8bLZ1PicYSmD8RW` | 315 | `ui/public/uploads/morgan/ab/01_intro/kling.mp4` |
| seedance | Seedance 2.0 (`model_bytedance-seedance-2-0`) | `job_KFhDj5p3Fouf4easXEDTqBQ8` | `asset_NiBQAp1duoHww9bkdzZTzhwv` | 546 | `ui/public/uploads/morgan/ab/01_intro/seedance.mp4` |

Review helpers:

- Still contact sheet: `ui/public/uploads/morgan/ab/01_intro/contact-sheet.jpg`
- Video contact sheet: `ui/public/uploads/morgan/ab/01_intro/contact-sheet.mp4`
- Full ledger: `ui/public/uploads/morgan/ab/01_intro/ledger.json`

## Technical verification

`ffprobe` confirmed all four outputs have video and AAC audio streams.

- P-Avatar: 960x960, 17.32s
- Aurora: 960x960, 17.40s
- Kling: 1440x1440, 17.33s
- Seedance: 960x960, 15.09s

## Visual frame review

Frame-level review of the 2x2 contact sheet:

1. **Kling AI Avatar 2 Pro** looks most promising for Morgan setup presenter. It best preserves the Morgan identity cues from the approved reference — golden retriever face, glasses, gloves, dark techwear, centered setup-presenter pose — and even adds a stylus-like explainer gesture. Minor artifacts remain around glasses/hands/stylus.
2. **Aurora** is the most polished/clean technically, with a strong dog-presenter composition and clean tablet grip. It may drift from Morgan identity if glasses are required, because the glasses are minimized or lost.
3. **P-Avatar** is cost-efficient and preserves the broad Morgan idea, but the test frame looked a little sleepy and had mild hand/glove artifacts.
4. **Seedance 2.0** is interesting for future multi-character/cinematic deliberation scenes, but this single-Morgan test is less reliable than Kling/Aurora: more stylized, more hand/tablet distortion, and more identity drift risk. It is still useful for larger “characters in one scene” deliberation/video experiments because the model guide emphasizes multimodal references, native synchronized audio, and multi-shot generation.

## Current recommendation

For Morgan setup media, review the moving videos first, but the first-pass visual pick is:

1. **Kling** if identity + presenter clarity matter most.
2. **Aurora** if polish matters most and glasses are optional.
3. Keep **VEED** as the production-safe baseline until the moving A/B confirms lip-sync and no identity drift.
4. Keep **Seedance 2.0** for a separate deliberation-scene experiment rather than immediate Morgan setup replacement.
