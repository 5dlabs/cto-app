# Argo Applications

Argo CD Applications applied *after* the base bootstrap (kind + ingress-nginx
+ Argo CD). These are NOT part of the `cto` Helm chart itself — they layer
on top of it.

For the initial pre-release the desktop bootstrap registers four apps:

- `cto.yaml` — the CTO platform chart (controller + tools), pulled from
  `ghcr.io/5dlabs/helm-charts/cto` (public OCI). Values are patched by the
  desktop bootstrap at install time.
- `qdrant.yaml` — a lightweight local Qdrant vector store, pulled from
  `ghcr.io/5dlabs/helm-charts/qdrant` and exposed for Morgan mem0 at
  `qdrant.cto-system.svc.cluster.local:6333`. Its dashboard is available only
  through the local kind NGINX ingress at
  `http://localhost:8080/qdrant/dashboard`.
  The ingress rewrites `/qdrant/*` to Qdrant's root because Qdrant serves the UI
  at `/dashboard`; if a future Qdrant UI build stops working behind that path
  proxy, use `kubectl -n cto-system port-forward svc/qdrant 6333:6333` and open
  `http://localhost:6333/dashboard`.
- `morgan.yaml` — the always-up local Morgan OpenClaw gateway/agent, pulled
  from `ghcr.io/5dlabs/helm-charts/agent` and deployed into `cto-system` so it
  can use `http://cto-tools.cto-system.svc.cluster.local:3000/mcp`.
- `voice-bridge.yaml` — the local Morgan voice WebSocket bridge, pulled from
  `ghcr.io/5dlabs/helm-charts/voice-bridge` and exposed only at the exact local
  NGINX route `ws://localhost:8080/morgan/voice/ws`.
- `observability.yaml` — optional local-only Loki, Prometheus, Grafana, and
  Promtail for desktop diagnostics. The bootstrap does not apply it by default;
  apply it manually when local logs/metrics are needed. Grafana is exposed only
  on `http://localhost:8080/grafana`, while Loki and Prometheus stay
  ClusterIP-only.

GitLab / GitLab-runner etc. are intentionally NOT shipped yet. Morgan keeps its
Promtail sidecar telemetry gated off unless you explicitly install the optional
observability app or provide another local Loki endpoint.

During local desktop validation, set
`CTO_BOOTSTRAP_TEST_MODE=controller-only` before launching Tauri to register only
`cto.yaml` and skip the later `qdrant.yaml`, `morgan.yaml`, and
`voice-bridge.yaml` Application
syncs. Leaving the variable unset, or setting it to `full`, preserves the normal
full application order: `cto`, then `qdrant`, then `morgan`, then
`voice-bridge`.
