# Setup config integration handoff

This handoff is for agents working on Morgan setup videos, setup flow polish, or downstream runtime wiring. It summarizes the integration points added for accumulating first-run setup choices into Kubernetes secrets and generated CTO config.

## What is now wired

- The setup wizard accumulates source, harness, CLI, provider, model, routing, provider credential, tool key, and Discord agent token choices.
- `ui/src/components/LocalStackBootstrap.tsx` sends the accumulated payload to `bootstrap_local_stack`.
- Rust bootstrap normalizes secret values and writes them only to Kubernetes Secret material.
- Rust bootstrap generates a non-secret nested `CTO-config.json` object and patches it into the `cto` Argo Application at `spec.source.helm.valuesObject.ctoConfig`.
- The `cto` Helm chart renders that value into `task-controller-config` as `/config/CTO-config.json`.

## Files to know

| File | Purpose |
| --- | --- |
| `ui/src/components/LocalStackBootstrap.tsx` | Wizard state, setup payload construction, provider credential payload wiring. |
| `src-tauri/src/bootstrap.rs` | Payload validation, secret normalization, `CTO-config.json` generation, Argo Application patching. |
| `.gitops/charts/cto/values.yaml` | Adds the system-managed `ctoConfig` value root. |
| `.gitops/charts/cto/templates/controller/task-controller-config.yaml` | Renders `CTO-config.json` into the controller config map. |
| `docs/handoff-local-stack-setup.md` | Broader setup handoff plus OAuth/token constraints. |

## Generated config contract

`CTO-config.json` is intentionally system-managed and verbose. Runtime code should read by selected CLI:

```json
{
  "version": 1,
  "source": {
    "provider": "github",
    "baseUrl": "https://github.com",
    "owner": "5dlabs",
    "connectionId": "5dlabs"
  },
  "harness": {
    "default": "openclaw",
    "routing": {
      "primary": { "providerId": "openai", "model": "gpt-5.5" },
      "fallbacks": [{ "providerId": "openai", "model": "gpt-5.4" }]
    }
  },
  "clis": {
    "codex": {
      "id": "codex",
      "defaultHarness": "openclaw",
      "providers": {
        "openai": {
          "id": "openai",
          "auth": "api-key",
          "defaultModel": "gpt-5.5",
          "models": ["gpt-5.5", "gpt-5.4"],
          "credential": {
            "secretRef": {
              "name": "cto-agent-keys",
              "key": "OPENAI_API_KEY",
              "env": "OPENAI_API_KEY"
            }
          }
        }
      }
    }
  }
}
```

Provider data is repeated under each compatible selected CLI on purpose. Avoid adding join logic unless the config contract changes.

## Secret handling

- Secret values must not be persisted to `setup.json`.
- Secret values must not be written into `CTO-config.json`.
- Provider API keys and shared tool keys are stored through `cto/cto-agent-keys`.
- Discord bot tokens are stored through `cto/openclaw-discord-tokens`.
- Blank secret fields are omitted.

## Source-control auth constraints

- GitHub unattended automation should use tenant-owned GitHub Apps. App credentials can mint one-hour installation tokens on demand.
- GitHub OAuth/device tokens are useful for user auth/setup, but they are not a PAT-generation mechanism.
- GitLab.com should use manual project, group, or service-account tokens for unattended agents.
- GitLab OAuth access tokens are short-lived and refresh-token based.
- GitLab Self-Managed/Dedicated can use admin APIs for applications and tokens only when instance admin credentials are explicitly available.

## Validation already run

```bash
npm run build
PATH="$(/opt/homebrew/bin/rustup which cargo | xargs dirname):$PATH" cargo test --manifest-path src-tauri/Cargo.toml bootstrap::tests -- --nocapture
helm template cto .gitops/charts/cto
```

## Notes for Morgan/setup-flow agents

- Morgan setup media can continue independently under `ui/public/uploads/morgan/<number>_<screen>/`.
- Do not replace this setup config flow with local/browser storage for secrets.
- If screens are reordered or renamed, keep the payload construction in `LocalStackBootstrap.tsx` aligned with the final wizard state.
- Harness choice is the default for Morgan/runtime deployment and can still be overridden later during intake.
