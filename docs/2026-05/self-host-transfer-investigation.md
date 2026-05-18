# Self-host transfer / 5D Origin investigation

## Live Client Cluster status

Verified against Kubernetes context `kind-cto-app` on 2026-05-03:

- Argo CD namespace exists: `argocd`.
- Ingress namespace exists: `ingress-nginx`.
- Argo CD is installed by Helm:
  - release: `argocd`
  - namespace: `argocd`
  - chart: `argo-cd-9.5.11`
  - app version: `v3.3.9`
  - status: `deployed`
  - revision: `3`
- Argo CD workloads are ready:
  - `argocd-application-controller-0` `1/1 Running`
  - `argocd-applicationset-controller-*` `1/1 Running`
  - `argocd-redis-*` `1/1 Running`
  - `argocd-repo-server-*` `1/1 Running`
  - `argocd-server-*` `1/1 Running`
- Argo CD ingress is present:
  - `argocd-server`
  - class: `nginx`
  - host: `argocd.cto.local`
  - address: `localhost`
- ingress-nginx is installed and rolled out:
  - namespace: `ingress-nginx`
  - deployment: `ingress-nginx-controller` `1/1 Available`
  - pod: `ingress-nginx-controller-*` `1/1 Running`
  - class: `nginx` / controller `k8s.io/ingress-nginx`
- Current Argo Applications:
  - `cto` — `Synced`, `Healthy`, revision `0.1.12`
  - `qdrant` — `Synced`, `Healthy`, revision `0.1.3`

## Current repo-owned state

### What already exists

- `src-tauri/src/bootstrap.rs` installs the Client Cluster baseline:
  - Kind runtime
  - ingress-nginx
  - metrics-server
  - Argo CD via Helm
  - base Argo Applications
- `.gitops/apps/*.yaml` contains the desktop-owned local Argo Applications.
- `.gitops/template/.gitops/apps/*.yaml` contains the client GitOps repository template copies.
- `.gitops/template/.github/workflows/cto-update.yml` is already the repo-owned GitHub Action model for updating managed GitOps template files in a client-owned repo.
- `src-tauri/src/scm_auth.rs` already models source-control provisioning for GitHub and GitLab connections.
- `ui/src/components/LocalStackBootstrap.tsx` already exposes a low-cognition Source entry point:
  - `GitHub`
  - `GitLab`
  - `5D Origin`
  - 5D Origin engines: `Gitea` and `GitLab`

### What does not exist yet

- No `RCTO` or `rcto` code path/string was found in the repo.
- No 5D Origin Argo app exists yet.
- No Gitea Argo app exists yet.
- No GitLab CE Argo app exists yet.
- No GitLab runner / source mirror app exists yet.
- `.gitops/apps/README.md` explicitly says GitLab / GitLab-runner are intentionally not shipped yet.
- Rust setup source enum currently supports only `github` and `gitlab`; the UI has a `gitea`/5D Origin concept, but backend setup payload support for Origin is not complete.
- The GitOps repository initializer is GitHub-only today (`ensure_bootstrap_gitops_repository`).

## Product conclusion

Yes: for the cluster side, the self-hosting lane should mostly be **adding the right Argo Application** after the Client Cluster baseline is ready.

But the user journey should not start with self-hosting. The practical flow should be:

1. **Connect** — user starts with existing GitHub or GitLab.
   - Morgan installs/authorizes against the provider where the repos already live.
   - Morgan discovers orgs/groups/repos/projects.
2. **Mirror** — Morgan offers 5D Origin only after successful source connection.
   - “Keep GitHub/GitLab as source of truth; mirror selected repos for private agent jobs / backup / local CI.”
3. **Origin** — user can later cut over.
   - Gitea for lightweight managed Git.
   - GitLab only when GitLab CI/workflows are required.

This means 5D Origin should behave like a **post-connect transfer/mirror action**, not a first-run default choice that asks users to choose infrastructure before trust is established.

## Recommended implementation shape

### 1. Add an Origin transfer utility in Rust/Tauri

Create a backend command with a stable contract, for example:

```ts
type OriginEngine = "standard" | "gitlab-compatible";
type OriginMode = "mirror" | "origin";

type PrepareOriginTransferRequest = {
  sourceConnectionId: string;
  sourceProvider: "github" | "gitlab";
  engine: OriginEngine;
  mode: OriginMode; // default: mirror
  repositories: Array<{
    owner: string;
    name: string;
    defaultBranch?: string;
  }>;
};

type PrepareOriginTransferResult = {
  argoApplicationName: string;
  engine: OriginEngine;
  mode: OriginMode;
  manifestPreview: string; // redacted
  steps: string[];
  warnings: string[];
};
```

The first version can be dry-run/manifest-only. It should not need to migrate repos yet.

### 2. Add two Argo app templates, but apply only one

Add repo-owned manifests/templates:

- `.gitops/apps/origin-standard.yaml` for Gitea
- `.gitops/apps/origin-gitlab-compatible.yaml` for GitLab

Only apply the selected one after the user chooses 5D Origin after hosted Source connection.

Keep these out of the first Client Cluster baseline. The baseline should stay `cto` + lightweight dependencies such as `qdrant`.

### 3. Add an apply/wait helper that takes selected apps

The recent baseline split already points in the right direction. Extend it so later setup can say:

- apply base apps: `cto`, `qdrant`
- apply layered apps: `morgan`, `voice-bridge`
- apply optional origin app: `origin-standard` or `origin-gitlab-compatible`

The utility should:

1. render/select the manifest,
2. apply it through kubectl/Argo,
3. wait for Argo Application `Synced`/`Healthy`,
4. report progress back to Morgan.

### 4. Separate transfer from deployment

Deploying 5D Origin and transferring repos are separate stages:

- **Deploy target:** Argo Application installs Gitea or GitLab source service.
- **Mirror/import:** a later job imports selected repos from GitHub/GitLab using approved credentials.
- **Cutover:** optional future step updates remotes and marks CTO-managed source as origin.

This keeps the UX honest: “mirror first, migrate later.”

### 5. Extend client GitOps template/update action

The existing `.gitops/template/.github/workflows/cto-update.yml` is a good pattern for client-owned updates.

Add Origin manifests to `.cto/template.json` only when they are stable and published. Before that, keep them desktop-local / preview-only so clean installs do not reconcile unpublished charts.

## Immediate next action

Implement the dry-run contract first:

1. Add `origin_transfer.rs` or a focused section in `bootstrap.rs`.
2. Add `prepare_origin_transfer` Tauri command returning a redacted manifest/action plan.
3. Add static tests that verify:
   - GitHub/GitLab source connection is required.
   - `mode` defaults to `mirror`.
   - Gitea selects the Gitea app.
   - GitLab selects the GitLab app.
   - no secret/token values can appear in the returned manifest preview.
4. Wire the 5D Origin UI button to this command after hosted Source connection.
5. Only then add real Argo app manifests/charts for Gitea/GitLab engines.

This preserves the intended user journey: everyone starts with GitHub/GitLab, then Morgan offers an optional 5D Origin mirror/transfer path after trust and repo access exist.
