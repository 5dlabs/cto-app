# Argo Applications

Argo CD Applications applied *after* the base bootstrap (kind + ingress-nginx
+ Argo CD). These are NOT part of the `cto` Helm chart itself — they layer
on top of it.

For the initial pre-release the desktop bootstrap registers four apps:

- `cto.yaml` — the CTO platform chart (controller + tools), pulled from
  `ghcr.io/5DLabsInc/helm-charts/cto` (public OCI). Values are patched by the
  desktop bootstrap at install time.
- `qdrant.yaml` — a lightweight local Qdrant vector store, pulled from
  `ghcr.io/5DLabsInc/helm-charts/qdrant` and exposed for Morgan mem0 at
  `qdrant.cto.svc.cluster.local:6333`. Its dashboard is available only
  through the local kind NGINX ingress at
  `http://localhost:8080/qdrant/dashboard`.
  The ingress rewrites `/qdrant/*` to Qdrant's root because Qdrant serves the UI
  at `/dashboard`; if a future Qdrant UI build stops working behind that path
  proxy, use `kubectl -n cto port-forward svc/qdrant 6333:6333` and open
  `http://localhost:6333/dashboard`.
- `morgan.yaml` — the always-up local Morgan OpenClaw gateway/agent, pulled
  from `ghcr.io/5DLabsInc/helm-charts/agent` and deployed into `cto` so it
  can use `http://cto-tools.cto.svc.cluster.local:3000/mcp`.
- `voice-bridge.yaml` — the local Morgan voice WebSocket bridge, pulled from
  `ghcr.io/5DLabsInc/helm-charts/voice-bridge` and exposed only at the exact local
  NGINX route `ws://localhost:8080/morgan/voice/ws`.
- `observability.yaml` — optional local-only Loki, Prometheus, Grafana, and
  Promtail for desktop diagnostics. The bootstrap does not apply it by default;
  apply it manually when local logs/metrics are needed. Grafana is exposed only
  on `http://localhost:8080/grafana`, while Loki and Prometheus stay
  ClusterIP-only.
- `origin-standard.yaml` — optional 5D Origin Standard app `[powered by
  Gitea/Forgejo]`. Morgan creates this only after a hosted GitHub/GitLab Source
  connection exists and the user approves a mirror-first Origin plan.
- `origin-gitlab-compatible.yaml` — optional 5D Origin GitLab-compatible app
  `[GitLab CE]`. This is a heavier GitLab CE lane for compatibility and is also
  created only after hosted Source approval plus explicit Origin app review.

5D Origin apps are intentionally not part of the Client Cluster baseline. They
are source-owned optional Argo Applications so Morgan can create them after
trust is established; hosted Source remains the fastest first path and Origin is
mirror-first, migrate-later.

During local desktop validation, set
`CTO_BOOTSTRAP_TEST_MODE=controller-only` before launching Tauri to register only
`cto.yaml` and skip the later `qdrant.yaml`, `morgan.yaml`, and
`voice-bridge.yaml` Application
syncs. Leaving the variable unset, or setting it to `full`, preserves the normal
full application order: `cto`, then `qdrant`, then `morgan`, then
`voice-bridge`.

Application `targetRevision` values are pinned to chart versions that are
already published and anonymously pullable from GHCR. Local chart source may be
ahead of those pins while the next `chart-v*` release is being prepared; do not
point desktop bootstrap Applications at unpublished chart versions, because a
fresh Kind cluster can only reconcile against the OCI registry.
