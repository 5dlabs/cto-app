# CTO Desktop

Cross-platform desktop application for the CTO platform, built with [Tauri 2](https://tauri.app/) and React.

## Stack

- **Shell:** Tauri 2 (Rust)
- **UI:** React 18 + Vite 6 + TypeScript + Tailwind CSS
- **Targets:** macOS (universal), Windows (x64), Linux (x64, deb/appimage/rpm)

## Layout

```
.
├── src-tauri/          # Rust / Tauri shell
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── icons/
│   └── src/
├── ui/                 # React front-end
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
├── .task/.docs/design/ # Design source-of-truth (dropped in by design)
└── .github/workflows/  # CI: release + GitLab mirror
```

## Develop

```bash
# one-time
npm install --workspaces --include-workspace-root
(cd src-tauri && cargo fetch)

# run the desktop app in dev (Vite + Tauri)
npm run tauri:dev
```

## Local Stack Bootstrap

On first desktop boot the app runs a local stack bootstrap behind an
`Installing dependencies` screen. The bootstrap detects the host OS and a
Docker-compatible runtime, starts Docker/OrbStack/Colima when available, and on
macOS installs Colima through Homebrew when no runtime is present.

The bootstrap then installs or resolves `kind`, `kubectl`, `helm`, and the Argo
CD CLI, creates a `cto-app` Kind cluster, configures ingress-nginx, installs the
Argo CD controller into the `argocd` namespace, and registers the 5D Labs CTO
platform, local Qdrant memory, and the always-up Morgan OpenClaw gateway into the
cluster.

For local controller/chart validation while downstream GHCR artifacts are still
private or unpublished, run the desktop app with
`CTO_BOOTSTRAP_TEST_MODE=controller-only npm run tauri:dev`. This explicit test
mode is off by default; it registers only the `cto` Argo Application and skips
the later `qdrant` and `morgan` Application syncs. Unset the variable, or set it
to `full`, to restore normal full-stack bootstrap behavior.

Morgan desktop endpoints are private localhost paths on the local ingress:
`http://localhost:8080/morgan` for the gateway/control UI,
`http://localhost:8080/morgan/code` for code-server, and
`http://localhost:8080/morgan/project-api` for the project sidecar.
Voice/WebSocket clients use the same private ingress under
`ws://localhost:8080/morgan/voice/ws`.

### Optional local observability

Public/free desktop installs do not require Datadog. For local diagnostics, the
optional `observability` chart ships Loki, Prometheus, Grafana, and Promtail with
no secrets and no public exposure. Install it after bootstrap with:

```bash
helm upgrade --install observability .gitops/charts/observability \
  --namespace cto-system --create-namespace
```

Grafana is then available only at `http://localhost:8080/grafana`. Loki and
Prometheus remain ClusterIP-only, and Morgan keeps its Promtail sidecar disabled
unless you explicitly opt in to the local Loki endpoint.

## Private source-control provisioning

Settings → Source control now generates local provisioning plans for
tenant-owned SCM credentials without creating real provider apps or storing
secrets. GitHub plans produce a private GitHub App manifest and tenant secret
name (`cto-scm-github-<connection-id>`). GitLab plans distinguish
self-managed/admin OAuth app creation (`/api/v4/applications`) from the
GitLab.com/manual project or group token path (`cto-scm-gitlab-<connection-id>`).

Local desktop callbacks use localhost path routing under
`http://localhost:8080/morgan/source-control/<provider>/callback`. Provider
webhooks remain disabled by default unless the user supplies a tunnel or hosted
callback base URL and explicitly enables webhook delivery later. Existing
PAT-backed project-api flows continue to work while a private connection is
still a draft.

## Build

```bash
npm run tauri:build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Local GitOps CI

Chart CI is designed to run in GitHub or locally with `act` before pushing.
After bootstrapping the local `cto-app` kind cluster, run:

```bash
mkdir -p .act
kind export kubeconfig --name cto-app --kubeconfig .act/kubeconfig
act push -W .github/workflows/chart-ci.yml -j helm-lint \
  --container-architecture linux/amd64 \
  --container-options "-v ${PWD}/.act/kubeconfig:/root/.kube/config:ro"
```

The Morgan render assertions use the Rust `crates/ci-tools` binary (with unit
tests and Clippy in CI), not Python/Node parsing utilities.

To smoke-test the Morgan mem0/Qdrant wiring against the local kind cluster with
Rust-backed render, diagnostics, and HTTP health assertions, run:

```bash
mkdir -p .act
kind get kubeconfig --name cto-app --internal > .act/kubeconfig
act workflow_dispatch -W .github/workflows/morgan-qdrant-smoke.yml \
  -j morgan-qdrant-smoke \
  --input live_kind=auto \
  --input require_public_artifacts=false \
  --container-architecture linux/amd64 \
  --container-options "--network kind -v ${PWD}/.act/kubeconfig:/root/.kube/config:ro"
```

`require_public_artifacts=false` is an explicit local-development skip for the
current GHCR blocker: the workflow still renders Morgan, runs Rust assertions,
and smoke-tests Qdrant, then skips live Morgan pod checks if the agent chart or
`ghcr.io/5dlabs/agents:latest` / `ghcr.io/5dlabs/project-api:latest` are not
publicly pullable. Omit that input once the chart and images are public to make
the preflight fail clearly on regressions.

## Release

Push a `v*` tag (e.g. `v0.1.0`) on `main`. The `release.yml` workflow builds
macOS (universal), Windows, and Linux bundles, then publishes a GitHub Release.

## Mirror

This repo mirrors to `gitlab.5dlabs.ai/5dlabs/cto-app` on every push to `main`
via `.github/workflows/mirror-to-gitlab.yml`.

## Design

Canonical design lives in `.task/.docs/design/`. See
[`.task/.docs/design/DESIGN-NOTES.md`](.task/.docs/design/DESIGN-NOTES.md)
for the fetch status of the reference design and where the design files are
expected to be committed.

## License

MIT — see [`LICENSE`](LICENSE).
