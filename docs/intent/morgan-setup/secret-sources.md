# Secret sources

## Purpose

Let Morgan reduce setup friction by using saved access when it is already available, without forcing the user to understand vaults, tokens, PATs, scopes, or provider-specific secret-manager jargon.

## Required visible language

- Review before connecting
- Access connected

Saved-access and manual-paste controls should be icon-first with accessible labels such as **Find my access** and **Paste token**, not visible button text on the Source screen.

## Inputs and defaults

- Secret source provider is optional.
- Manual paste remains available for every required credential.
- 1Password/OnePass and Bitwarden Secrets Manager are equal first-view Secrets peers.
- Bitwarden uses Secrets Manager SDK/REST auth, not Password Manager browser unlock.
- Additional non-v1 provider choices should appear only after the user asks for more options.

## SDK-first notes

- Default Secrets uses the Tauri/backend SDK bridge for metadata preview and approved reads.
- Provider app approval gates preview/apply; never ask for password-manager master passwords.
- Metadata preview stays approval-gated and narrow; approved field reads keep raw values in memory only long enough to apply CTO-managed Kubernetes Secret material.

## Required actions

- Detect available providers without requiring setup.
- Prefer a one-click icon-first **Find my access** branch when a provider is already available.
- Ask the provider for approved access through official SDK/REST flows by default.
- Show matched access before enabling it.
- Require explicit approval before writing or syncing secrets.
- Continue to support manual paste.

## Blocking behavior

- Setup must not block when no secret source is available.
- Secret-source auth failures must recover to **Paste token**.
- Missing optional keys must not block unrelated setup progress.

## Setup payload expectations

- Persist provider, purpose, target Secret name/key, and provider-native reference/provenance only.
- Never persist raw secret values in setup profile, `CTO-config.json`, docs, intent snapshots, reports, manifests, or logs.
- Raw secret values may exist only in memory long enough to apply CTO-managed Kubernetes Secret material.
- v1 runtime persistence is Kubernetes Secrets plus Argo `valuesObject`; OpenBao remains a future-compatible seam.

## Visual expectations

- Icon-first provider chips.
- One primary action per state.
- 1Password/OnePass and Bitwarden Secrets Manager have equal first-view visual weight.
- Reveal details only after **Review details**.
- Success state should be simple: **Access connected**.

## Compliance guardrails

- Do not scrape password-manager UI.
- Do not copy browser cookies or sessions.
- Do not bypass SSO, 2FA, SAML, provider approval, or vault approval.
- Do not ask for vault master passwords.
- Do not export entire vaults.
- Request least-privilege metadata/list and selected-item read where available.
- Support disconnect/revoke/re-sync flows.
