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
- If a local single-user 1Password integration is detected, Morgan may show it as the first quick-connect affordance.
- Bitwarden is a secondary saved-access provider: show it only after **More options** or local `bw` CLI detection, not as another first-view choice.
- Additional provider choices should appear only after the user asks for more options or when the provider is detected.

## Bitwarden CLI research notes

- Official docs: <https://bitwarden.com/help/cli/>.
- Presence probe: `bw --version` can prove the CLI is installed.
- Readiness probe: `bw status` returns JSON with `status` values such as `unauthenticated`, `locked`, and `unlocked`; only `unlocked` should count as ready for metadata preview.
- Vault commands require an active session key through `BW_SESSION` or `--session`; Morgan must not ask for or collect the Bitwarden master password.
- Metadata preview should stay approval-gated and narrow, e.g. `bw list items --search <target>` only after the user chooses Bitwarden; approved field reads can use `bw get item <id>` with raw fields kept in memory only long enough to apply CTO-managed secrets.
- Current implementation is detection-only for Bitwarden: `bw --version` and `bw status` may populate a secondary provider card, but `bw list items` / `bw get item` are not wired to quick-connect or apply.
- Implementation should keep 1Password as `quickConnect.provider` until Bitwarden has equivalent detect/preview/apply tests and UI copy reviewed.

## Required actions

- Detect available providers without requiring setup.
- Prefer a one-click icon-first **Find my access** branch when a provider is already available.
- Ask the provider for approved access through official auth/CLI/API flows only.
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
- Raw secret values may exist only in memory long enough to apply CTO-managed OpenBao/Kubernetes Secret material.

## Visual expectations

- Icon-first provider chips.
- One primary action per state.
- No provider matrix on first view.
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
