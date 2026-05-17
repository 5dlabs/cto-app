# Source auth intent matrix

Morgan setup must validate source-control authorization paths independently from the full bootstrap. Auth intent tests verify that each provider and contextual auth branch exposes the right inputs, writes the right non-secret data into the setup profile/provisioning plan, and keeps secrets out of DOM/snapshot artifacts.

## Matrix

| Scenario | Provider | Host | Auth path | Expected result |
| --- | --- | --- | --- | --- |
| GitHub.com OAuth | GitHub | `https://github.com` | isolated GitHub CLI/device-code OAuth | User/org owner is captured, Continue remains blocked until OAuth token is captured, token is redacted in snapshots. |
| GitHub.com PAT fallback | GitHub | `https://github.com` | manual PAT | Exposed only through “Use a personal access token instead”; owner + PAT enable Continue, setup payload has `source.provider=github`, `source.baseUrl=https://github.com`; PAT never appears in artifacts. |
| GitHub Enterprise Server | GitHub | custom HTTPS host | GitHub App manifest / enterprise API | Exposed only through “Using GitHub Enterprise?”; base URL is captured, setup URLs use the enterprise host, manifest exchange uses `/api/v3/app-manifests/{code}/conversions`. |
| GitLab.com token | GitLab | `https://gitlab.com` | manual project/group access token | Plan uses `manual-token`, status `manual-token-required`, secret key `token`, no instance OAuth endpoint. |
| Self-managed GitLab | GitLab | custom HTTPS host | instance OAuth app or admin-created app | Exposed only through “Using self-managed GitLab?”; plan uses `gitlab-instance-oauth-app`, exposes `/api/v4/applications`, derives callback/webhook URLs from callback base, webhooks disabled by default. |

## Required UI behavior

- Source screen must first ask **Where is your code?** with only two top-level provider buttons: **GitHub** and **GitLab**.
- Hosted service defaults are implicit after provider selection: GitHub means `github.com`; GitLab means `gitlab.com`.
- Enterprise/self-managed branches are contextual secondary actions, not peer top-level choices.
- GitHub Enterprise and self-managed GitLab reveal a base URL input only after that branch is selected.
- The owner/group/namespace input must be visible and captured.
- GitHub OAuth must surface the device-code boundary without exposing the code in snapshots.
- Manual token inputs must be password fields and snapshots must redact values.
- Continue is disabled until the selected auth path has enough data.
- Non-secret profile data must be inspectable in `manifest.json`/snapshot metadata.

## Validation strategy

- Unit-test provisioning plans for provider/host variants.
- Fixture-test the source screen and DOM snapshot/evaluator behavior.
- Run `npm run e2e:local-stack-intent -- --dev-nav` for UI flow evidence when a fresh Tauri/Vite webview is available.
- Reserve real external auth validation for interactive approval runs; never bypass password, SSO, SAML, 2FA, device-code, or admin approval boundaries.
