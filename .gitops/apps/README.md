# Argo Applications

Argo CD Applications applied *after* the base bootstrap (kind + ingress-nginx
+ Argo CD). These are NOT part of the `cto` Helm chart itself — they layer
on top of it.

For the initial pre-release only one app ships:

- `cto.yaml` — the CTO platform chart (controller + tools), pulled from
  `ghcr.io/5dlabs/helm-charts/cto` (public OCI). Values are patched by the
  desktop bootstrap at install time.

Qdrant / mem0 / GitLab / GitLab-runner / Grafana stack etc. are intentionally
NOT shipped yet — we'll step through each one as we add support in the UI.

