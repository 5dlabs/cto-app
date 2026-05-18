# Coder / Control Plane Coordination Note

## Current ownership

Regular Coder (`Coder#3336`) is owned by the OpenClaw/Hermes workspace StatefulSet:

- Kubernetes context: `ovh-cluster`
- Namespace: `cto`
- Workload: `statefulset/openclaw-hermes-coder`
- Pod: `openclaw-hermes-coder-0`
- Container: `agent`
- Argo app: `cto-hermes-coder`
- Discord bot ID: `1494033882683539456`
- Discord channel: `#coder` / `1494057364301545542`

Control-plane Coder is a separate Hermes gateway deployment:

- Workload: `deployment/cto-hermes-coder-control`
- Current pod observed: `cto-hermes-coder-control-5bb576dc85-fvv7z`
- Runtime image: `docker.io/nousresearch/hermes-agent:v2026.4.23`

These should be treated as separate agents/workloads.

## Recent root cause and fix

Regular Coder was intermittently disappearing from Discord because two workloads were using the same Discord bot token at the same time:

1. `openclaw-hermes-coder-0`
2. legacy `cto-hermes-gateway`

Discord gateway sessions competed, and OpenClaw logs showed:

```text
discord gateway: Gateway websocket closed: 1006
```

The source-owned fix was committed and pushed:

```text
6f5292bd fix: disable duplicate Coder Discord gateway
```

The legacy `cto-hermes-gateway` app now renders no runtime resources via a chart-level `enabled: false` values file, while keeping the Argo app source-owned.

## Verified state

Regular Coder is currently healthy:

```text
openclaw-hermes-coder-0: Running
agent:true:0
kaniko:true:0
promtail:true:0
OpenClaw Discord: ON / OK, accounts 1/1
/health: 200 {"ok":true,"status":"live"}
/healthz: 200 {"ok":true,"status":"live"}
Discord API identity: Coder#3336 / 1494033882683539456
cto-hermes-coder: Synced / Healthy
cto-hermes-gateway: Synced / Healthy
```

The duplicate legacy `cto-hermes-gateway` workload is absent, so it is no longer competing for the regular Coder token.

## Coordination rule

Before touching regular Coder, control-plane Coder, Hermes gateway charts, Discord token wiring, or shared GitOps app definitions:

1. Check current Argo and workload state.
2. Confirm which bot/workload owns the Discord token being changed.
3. Do not run two workloads with the same Discord bot token.
4. Prefer source-owned GitOps/chart changes over live-only patches.
5. Use Discord coordination or a shared handoff note before editing overlapping files.

## Suggested control-plane handoff message

```text
Coordination note: regular Coder#3336 is currently owned by `openclaw-hermes-coder-0` via Argo app `cto-hermes-coder`. The old standalone `cto-hermes-gateway` path was disabled because it used the same Discord token and caused duplicate Discord gateway sessions / close code 1006. Please do not re-enable `cto-hermes-gateway` or add another runtime using the `coder` Discord token unless we intentionally migrate ownership. Control-plane Coder (`cto-hermes-coder-control`) is separate and should not share the regular Coder token. Coordinate changes through GitOps/source and this thread before editing shared Hermes gateway/chart/token paths.
```

## Quick verification commands

```bash
kubectl --context ovh-cluster -n cto get pods | \
  grep -Ei 'cto-hermes-gateway|openclaw-hermes-coder|cto-hermes-coder-control'

kubectl --context ovh-cluster -n argocd get app \
  cto-hermes-coder cto-hermes-gateway hermes-control-plane-builder -o wide

kubectl --context ovh-cluster -n cto exec openclaw-hermes-coder-0 -c agent -- sh -lc '
openclaw status --deep 2>&1 | sed -E "s/[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/[REDACTED]/g; s/(token|apiKey|password|secret|auth)[^[:space:]]*/\1=[REDACTED]/gI" | grep -A9 -B2 "Channels"'
```
