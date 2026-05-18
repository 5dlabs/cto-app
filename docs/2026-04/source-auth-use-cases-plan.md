# Source Auth Use Cases Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Complete Morgan setup coverage for source-control authentication while keeping secrets standardized, provider-neutral, and out of git/artifacts.

**Architecture:** Keep the visible setup flow provider-first and low-cognition: GitHub or GitLab first, hosted defaults implicit, enterprise/self-managed/manual paths revealed only when needed. Add a secret lookup abstraction that can read from curated secret-manager providers when available, but never makes a proprietary manager mandatory for CTO setup.

**Tech Stack:** Tauri 2, Rust bootstrap/provisioning commands, React 18/Vite setup UI, Node intent tests, Kubernetes Secret `cto/cto-agent-keys`, optional local secret-manager adapters for 1Password CLI (`op`), Doppler, Infisical, Bitwarden, HashiCorp Vault, and cloud secret managers.

---

## Current repository facts

- Source auth UI now starts with **Where is your code?** and only top-level **GitHub** / **GitLab** choices.
- Hosted defaults are implicit: GitHub means `https://github.com`; GitLab means `https://gitlab.com`.
- Contextual branches already modeled in the UI/intent matrix:
  - GitHub.com browser/device/app flow.
  - GitHub.com manual PAT fallback.
  - GitHub Enterprise Server app/manifest path.
  - GitLab.com manual project/group/service token.
  - Self-managed GitLab instance OAuth app path.
  - Self-managed GitLab manual token fallback.
- Bootstrap already normalizes secret-bearing inputs and writes runtime credentials to Kubernetes Secret `cto/cto-agent-keys` or provider-specific SCM Secrets.
- `CTO-config.json` must contain references/metadata only. It must never contain raw token values.
- Local discovery found `op` installed in this development environment, but CTO must not require or redistribute 1Password as the only supported setup path.

## Product decision

Do **not** make 1Password mandatory.

Use a provider-neutral **Secret Source** setup layer:

1. **Auto-detect** common local managers and CLIs.
2. **Prefer secure lookup/import** over manual paste when a manager is available.
3. **Keep manual paste as fallback** for every required secret.
4. **Normalize all imported values** into the same bootstrap payload and Kubernetes Secret outputs.
5. **Persist references and provenance only**, never the imported secret value.

Recommended curated v1 providers:

| Priority | Provider | Why include | Setup posture |
| --- | --- | --- | --- |
| 1 | **CTO Vault / OpenBao** | CTO platform already advertises OpenBao plus External Secrets Operator as its secure control layer. This should be the runtime source of truth after bootstrap. | First-class destination and managed-runtime integration; not a first-screen burden. |
| 2 | 1Password CLI (`op`) | Common with developers and agent/MCP workflows; local machine integration is strong. | Detect/use if installed; do not bundle as required runtime. |
| 3 | Bitwarden Secrets Manager | Open-source-friendly and broad consumer/team footprint; good Secrets Manager/workload-secret story. | Optional import adapter. |
| 4 | LastPass Business/Enterprise | Recognizable top password-manager brand for business users; API/enterprise integration exists but developer CLI ergonomics are weaker than 1Password/Bitwarden. | Paid-tier connector candidate; prefer OAuth/admin API over local scraping. |
| 5 | Keeper Secrets Manager | Enterprise password-manager footprint with secrets-manager/developer integration posture. | Paid-tier connector candidate. |
| Developer | Doppler | Popular developer/team env-secret workflow; strong CLI/env injection model. | Optional import adapter. |
| Developer | Infisical | Open-source and self-hostable; common in agent/MCP security content. | Optional import adapter, good for privacy/self-hosted users. |
| Advanced | HashiCorp Vault / external Vault-compatible endpoints | Enterprise standard, self-hosted, policy/audit-heavy; OpenBao is Vault-compatible but CTO-owned OpenBao should be the simple path. | Advanced import/migration adapter. |

Cloud-native adapters should be follow-up/enterprise lane rather than first-screen choices:

- AWS Secrets Manager / SSM Parameter Store.
- Google Secret Manager.
- Azure Key Vault.

There is no clear single consensus secret manager in agent land. The consensus pattern is stronger than the product consensus: **do not hardcode secrets into MCP/agent configs; inject short-lived or referenced secrets at runtime from a managed vault/secret store; redact artifacts; keep env vars as process-local transport, not durable storage.**

## Desktop UI stance

For CTO Desktop, OpenBao should be treated as the **behind-the-scenes destination**, not another confusing provider choice on the first screen.

Recommended UI model:

1. User chooses an intent: **GitHub** / **GitLab**, provider keys, tool keys, or agent tokens.
2. CTO checks whether the local CTO Vault/OpenBao runtime is ready.
3. If ready, imported/pasted credentials are written into CTO-managed OpenBao/Kubernetes sync paths.
4. If a local external vault CLI is detected, show one compact affordance: **Use saved key**.
5. Always show **Paste instead**.
6. After success, show a simple state like **Access connected** — not raw vault paths, leases, or secret-manager jargon.

That gives the “connect your vault and boom, you have access” experience without making vault choice the core mental model. Advanced users can expand details to see/import from 1Password, Bitwarden, LastPass, Keeper, Doppler, Infisical, or external Vault-compatible systems.

## Paid tier stance

Vault connection/import is a strong paid-tier feature, but it should still feel like an accelerator rather than a prerequisite.

Recommended packaging:

| Tier | Secret UX |
| --- | --- |
| Free/local | Manual paste, environment detection, CTO-managed local OpenBao/Kubernetes Secret destination, and a **single-user 1Password quick connect** when `op`/desktop integration is already present. Use this as friction reduction, not as a required prerequisite. |
| Pro/Team | **Connect your vault** import flow for 1Password Teams/Business, Bitwarden, LastPass Business/Enterprise, Keeper, Doppler, and Infisical. Add team/admin mapping, shared vault selection, reusable mappings, and multi-user approval posture. Auto-map known keys such as GitHub, GitLab, OpenAI, OpenRouter, Exa, Firecrawl, Tavily, and Discord tokens. |
| Enterprise | External Vault-compatible endpoints, HashiCorp Vault, cloud secret stores, policy/audit controls, rotation, lease status, SSO/admin-managed mappings, and centrally enforced secret policy. |

The paid tier should not say “you must have 1Password.” It should say: **connect the vault you already use, CTO maps what it recognizes, and you approve what gets imported.** The free tier can still include the magical single-user quick-connect path for 1Password when it is already installed, because reducing setup friction increases activation and stickiness. The upsell boundary should be team/admin scale, reusable mappings, shared vaults, extra providers, audit, policy, and rotation — not the basic idea of "CTO found my GitHub key and connected me." The simple success state remains “Access connected”; raw vault paths and provider-specific details stay behind an advanced disclosure.

## Activation objective

The primary product objective is activation friction reduction: most users should not have to understand tokens, account scope, provider scope, or vault mechanics before CTO is useful. A common first-run path is expected to be: the user already has GitHub access, may have both personal and corporate accounts, may also have self-hosted GitLab access, and CTO should help identify the usable credentials/accounts with minimal prompting.

The setup flow should therefore separate three concepts that users often conflate:

1. **Who are you?** Personal account, corporate SSO account, or both.
2. **Where is the source today?** GitHub.com, GitHub Enterprise, GitLab.com, or self-hosted GitLab.
3. **Where should CTO operate?** Existing source, mirrored/migrated GitLab target, or a new CTO-managed GitOps repo.

If CTO's strategic goal is to move GitHub-first users toward GitLab/self-hosted GitLab, the UI should frame that as an assisted path after access is found: **“GitHub connected — want CTO to prepare a GitLab target?”** Do not force GitLab decisions before the user has experienced successful connection.

## Secret federation product concept

The paid-tier idea is best described as **customer-owned secret federation**:

- The customer keeps credentials in their existing vault/password manager.
- CTO Desktop connects through that provider's approved API/CLI/OAuth path.
- CTO discovers candidate secrets by metadata/name patterns, not by exposing values.
- CTO shows a review screen: **GitHub found**, **OpenAI found**, **Exa found**, etc.
- The customer approves the mapping.
- CTO writes references and/or synced copies into the customer's CTO implementation: repo-owned non-secret config plus CTO-managed OpenBao/Kubernetes Secret material inside their infrastructure.
- CTO can later report freshness/health: connected, missing, expired, permission denied, rotation recommended.

This is not true cross-tenant federation. It is more like an import/sync bridge from the customer's vault into the customer's CTO runtime, with explicit consent and auditability.

UX draft:

```text
Connect your vault

[ 1Password ] [ Bitwarden ] [ LastPass ] [ Keeper ]
[ More: Doppler, Infisical, Vault, AWS, GCP, Azure ]

Morgan found:
✓ GitHub access
✓ OpenAI API key
✓ Exa key
! Discord token missing

[Approve & connect]   [Review details]
```

Guardrails:

- Never auto-enable a provider without a review/approval step.
- Ask for least-privilege read access where provider APIs allow it.
- Store mapping references/provenance in git/config, never raw secret values.
- Store or sync raw values only into CTO-managed OpenBao/Kubernetes Secrets.
- Make “Paste instead” always available.
- Avoid provider-specific jargon on the main path; show it only under details.

## Compliance/security posture

This concept is viable only if CTO integrates through each provider's approved user/admin authorization path. CTO must not scrape desktop password-manager UIs, bypass SSO/2FA, copy browser session cookies, or ask users for vault master passwords.

Required posture:

- Use official OAuth, device-code, CLI, extension, admin API, SCIM, or service-account flows supported by the provider.
- Present provider-specific consent screens when required; do not hide the fact that CTO is requesting vault access.
- Request the narrowest scope possible: ideally metadata/list + selected item read, not whole-vault export.
- Let the admin/user choose vaults, folders, items, and fields before importing or syncing.
- Keep an approval screen before enabling GitHub/GitLab/provider/tool access.
- Keep audit logs of mappings and access status, but never log secret values.
- Store raw values only in CTO-managed OpenBao/Kubernetes Secret material inside the customer's infrastructure.
- Store repo/config state as references/provenance, not secret values.
- Support disconnect/revoke/re-sync flows.
- Treat LastPass/Keeper/1Password/Bitwarden business connectors as paid/admin integrations where terms may require review; keep free-tier quick connect limited to local, user-authorized single-user paths.

Compliance-safe UX example:

```text
Connect saved access

[ 1Password ] [ Bitwarden ] [ LastPass ] [ Keeper ]

Morgan will ask your vault for approved access only.
You choose what CTO can use before anything is connected.

Found after login:
✓ GitHub org access
✓ GitLab self-hosted token
✓ OpenAI key

[Approve & connect] [Review details] [Paste instead]
```

## Canonical CTO secret schema

Use one internal schema regardless of provider:

```ts
type CtoSecretPurpose =
  | "source.github.token"
  | "source.github.enterprise.token"
  | "source.gitlab.token"
  | "source.gitlab.selfManaged.adminToken"
  | "provider.openai.apiKey"
  | "provider.openrouter.apiKey"
  | "provider.anthropic.apiKey"
  | "tool.exa.apiKey"
  | "tool.firecrawl.apiKey"
  | "tool.tavily.apiKey"
  | "tool.brave.apiKey"
  | "tool.perplexity.apiKey"
  | "tool.context7.apiKey"
  | "agent.discord.botToken"
  | "agent.discord.appToken";

type CtoSecretRef = {
  provider: "cto-openbao" | "manual" | "env" | "1password" | "bitwarden" | "lastpass" | "keeper" | "doppler" | "infisical" | "vault" | "aws" | "gcp" | "azure";
  purpose: CtoSecretPurpose;
  label: string;
  ref?: string;       // provider-native pointer, never the secret value
  env?: string;       // canonical env key, when applicable
  targetSecretName: string;
  targetSecretKey: string;
};
```

Default naming convention:

| Purpose | Kubernetes Secret | Key |
| --- | --- | --- |
| Tool/provider/agent keys | `cto/cto-agent-keys` | Existing env key, e.g. `OPENAI_API_KEY`, `EXA_API_KEY` |
| GitHub App SCM credentials | provider-specific Secret | `app-id`, `client-id`, `client-secret`, `private-key` |
| GitLab/manual SCM token | provider-specific Secret | `token` |

## Task 1: Document secret-source UX contract

**Objective:** Add an intent doc explaining that secret managers are optional accelerators, not prerequisites.

**Files:**
- Create: `docs/intent/morgan-setup/secret-sources.md`
- Modify: `scripts/e2e/intent/morgan-setup.intent.json`

**Steps:**
1. Create the intent doc with visible language:
   - "Connect your secret manager".
   - "Skip — paste keys when needed".
   - "Detected on this Mac" when a CLI is present.
2. Add blocking behavior:
   - Setup must not block when no secret manager is configured.
   - Manual fallback must remain available.
   - Secret values must be redacted from snapshots/manifests.
3. Add setup payload expectations:
   - Persist `CtoSecretRef` references/provenance only.
   - Imported raw values may exist only in memory long enough to apply Kubernetes Secrets.
4. Run: `node --test scripts/e2e/intent/morgan-setup-intent.test.mjs`.

## Task 2: Add secret manager detection command

**Objective:** Detect supported secret-manager CLIs without requiring them.

**Files:**
- Modify: `src-tauri/src/bootstrap.rs` or create a focused `src-tauri/src/secret_sources.rs`
- Add tests in the same Rust module.

**Steps:**
1. Define a `SecretSourceProvider` enum for `OnePassword`, `Doppler`, `Infisical`, `Bitwarden`, `Vault`, `Aws`, `Gcp`, `Azure`.
2. Add a detection function that checks CLI presence/version without logging credentials:
   - `op --version`
   - `doppler --version`
   - `infisical --version`
   - `bws --version` or `bw --version`
   - `vault version`
   - `aws --version`
   - `gcloud --version`
   - `az version`
3. Return `{ id, label, installed, version?, setupHint }`.
4. Unit-test parsing and missing-command behavior.
5. Expose through a Tauri command such as `detect_secret_sources`.

## Task 3: Add provider-neutral Source UI screen

**Objective:** Add a low-text, icon-first optional screen before token entry.

**Files:**
- Modify: `ui/src/components/LocalStackBootstrap.tsx`
- Modify: `ui/src/styles/bootstrap.css`
- Modify tests under `scripts/e2e/`

**Steps:**
1. Add a new progressive-disclosure section: "Secret source".
2. Show detected provider chips only, plus a persistent manual fallback.
3. Do not show a matrix of all providers on first view.
4. Copy should be short:
   - "Use saved keys".
   - "Paste instead".
   - "Detected".
5. Store selected secret-source metadata in setup state; do not store raw values.
6. Add deterministic fixture coverage.
7. Run:
   - `npm --workspace ui run typecheck`
   - `node --test scripts/e2e/real-source-ui-auth.test.mjs scripts/e2e/source-auth-intent.test.mjs`

## Task 4: Implement 1Password adapter as first optional adapter

**Objective:** Support 1Password lookup when `op` is installed and authenticated, without making it mandatory.

**Files:**
- Create/modify: `src-tauri/src/secret_sources.rs`
- Add Rust tests.

**Steps:**
1. Support only explicit item/field refs at first; do not search all vault contents by default.
2. Accept refs like `op://<vault>/<item>/<field>`.
3. Resolve via `op read <ref>`.
4. Treat locked/not-signed-in status as recoverable UI state, not setup failure.
5. Redact command output in logs and errors.
6. Never persist resolved values to disk.

## Task 5: Add Doppler and Infisical adapters

**Objective:** Cover the most common developer/team CLI workflows after 1Password.

**Files:**
- Modify: `src-tauri/src/secret_sources.rs`
- Add tests.

**Steps:**
1. Doppler: support project/config/key refs and resolve through `doppler secrets get --plain` or equivalent CLI call.
2. Infisical: support project/environment/path/key refs and resolve through the current CLI command.
3. Keep CLI command construction argument-array based; never shell-interpolate refs.
4. Redact stdout/stderr in persisted logs.
5. Add tests for missing CLI, unauthenticated CLI, and successful redacted resolution.

## Task 6: Add Bitwarden and Vault adapters

**Objective:** Cover open-source/team and enterprise secret management paths.

**Files:**
- Modify: `src-tauri/src/secret_sources.rs`
- Add tests.

**Steps:**
1. Bitwarden: prefer Secrets Manager CLI (`bws`) over consumer vault CLI (`bw`) for team/workload secrets.
2. Vault: support `path#field` style refs and require Vault auth/env to already be configured.
3. Do not ask users for Vault root tokens in the CTO setup UI.
4. Add clear UI hints for missing auth/session state.

## Task 7: Add cloud-secret follow-up lane

**Objective:** Keep AWS/GCP/Azure support out of the first-screen UX while documenting enterprise hooks.

**Files:**
- Modify: `docs/2026-04/source-auth-use-cases-plan.md`
- Create follow-up issues or tasks when GitHub issue workflow is active.

**Steps:**
1. Document that cloud secret stores are enterprise/provider integrations.
2. Require explicit profile/project/vault selection before lookup.
3. Do not infer cloud account context silently.
4. Keep manual fallback available.

## Task 8: Validate full setup flow and redaction

**Objective:** Prove secret-source support does not leak values and does not regress source auth.

**Files:**
- Modify/add tests under `scripts/e2e/`

**Steps:**
1. Add fake secret-source fixture values containing obvious canaries.
2. Run intent tests and assert canaries do not appear in snapshots, reports, manifests, console diagnostics, or DOM artifacts.
3. Run:
   - `npm --workspace ui run typecheck`
   - `npm --workspace ui run build`
   - `node --test scripts/e2e/real-source-ui-auth.test.mjs scripts/e2e/source-auth-intent.test.mjs scripts/e2e/intent/morgan-setup-intent.test.mjs`
   - `npm run e2e:local-stack-intent -- --dev-nav` when a Tauri/Vite listener is available.
4. Verify Kubernetes target Secret keys exist without printing values:
   - `kubectl --context kind-cto-app -n cto get secret cto-agent-keys -o jsonpath='{.metadata.name}'`

## Acceptance criteria

- Setup remains usable with no secret manager installed.
- 1Password is supported when present, but never required or redistributed as CTO's only secret path.
- The top-level user decision remains provider/source oriented, not implementation-jargon oriented.
- Imported secret values are applied to Kubernetes Secrets or provider-specific SCM Secrets, never to `CTO-config.json`, setup profiles, docs, snapshots, manifests, or logs.
- Tests cover GitHub/GitLab auth branches and secret-source redaction.
- Provider support is curated and progressive: 1Password, Doppler, Infisical, Bitwarden, Vault first; cloud stores later as enterprise integrations.
