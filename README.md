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
Argo CD controller into the `argocd` namespace, and registers the 5D Labs
`mcp-tools` Argo CD Application into the local cluster.

## Build

```bash
npm run tauri:build
```

Artifacts land in `src-tauri/target/release/bundle/`.

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
