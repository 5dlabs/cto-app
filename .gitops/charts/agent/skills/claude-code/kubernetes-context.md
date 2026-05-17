# Kubernetes Context Skill

You are running inside a Kubernetes pod managed by the CTO Desktop local stack.

## Cluster Access

- `kubectl` may be available and configured through the pod service account.
- The default namespace is the namespace where this agent release is installed.
- Local desktop installs use Argo CD for GitOps reconciliation.
- Prefer reading rendered configuration and Kubernetes status before making changes.

## Deployment Pattern

- Do not assume provider-specific or paid infrastructure is present.
- Avoid direct `kubectl apply` unless the user explicitly asks for live debugging.
- Prefer changing chart values, Argo Applications, or source files so changes are reproducible.
- Keep secrets in Kubernetes Secrets; never write secret values to Git.

## Useful Checks

- `kubectl get pods -n "$POD_NAMESPACE"`
- `kubectl get events -n "$POD_NAMESPACE" --sort-by=.lastTimestamp`
- `kubectl logs -n "$POD_NAMESPACE" "$HOSTNAME"`
