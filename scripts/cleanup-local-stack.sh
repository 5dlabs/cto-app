#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CTO_KIND_CLUSTER_NAME:-cto-app}"
KIND_CONTEXT="${CTO_KIND_CONTEXT:-kind-${CLUSTER_NAME}}"
ASSUME_YES=0
REMOVE_BOOTSTRAP_PROFILE=0

usage() {
  cat <<USAGE
Usage: scripts/cleanup-local-stack.sh [--yes] [--remove-bootstrap-profile]

Deletes the local CTO Kind cluster so the desktop bootstrap can be tested from a
clean Kubernetes state. This script only targets the CTO cluster named:

  ${CLUSTER_NAME}

Options:
  --yes                       Do not prompt before deleting the Kind cluster.
  --remove-bootstrap-profile  Also remove the persisted first-run setup profile.
  -h, --help                  Show this help.

Environment:
  CTO_KIND_CLUSTER_NAME       Override the Kind cluster name (default: cto-app).
  CTO_KIND_CONTEXT            Override the kube context (default: kind-\$cluster).
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)
      ASSUME_YES=1
      shift
      ;;
    --remove-bootstrap-profile)
      REMOVE_BOOTSTRAP_PROFILE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

have() {
  command -v "$1" >/dev/null 2>&1
}

confirm() {
  if [[ "${ASSUME_YES}" == "1" ]]; then
    return 0
  fi
  printf 'Delete Kind cluster "%s" and CTO local Kubernetes resources? [y/N] ' "${CLUSTER_NAME}" >&2
  read -r reply
  [[ "${reply}" == "y" || "${reply}" == "Y" || "${reply}" == "yes" || "${reply}" == "YES" ]]
}

if ! have kind; then
  echo "kind is not installed or not on PATH; nothing to delete." >&2
  exit 0
fi

if ! kind get clusters 2>/dev/null | grep -Fxq "${CLUSTER_NAME}"; then
  echo "Kind cluster ${CLUSTER_NAME} does not exist."
else
  if ! confirm; then
    echo "Canceled."
    exit 0
  fi

  if have kubectl && kubectl config get-contexts "${KIND_CONTEXT}" >/dev/null 2>&1; then
    echo "Removing Argo CD Application finalizers before cluster deletion..."
    kubectl --context "${KIND_CONTEXT}" -n argocd patch applications.argoproj.io --all \
      --type merge \
      --patch '{"metadata":{"finalizers":[]}}' >/dev/null 2>&1 || true
    kubectl --context "${KIND_CONTEXT}" -n argocd delete applications.argoproj.io --all \
      --ignore-not-found --wait=false >/dev/null 2>&1 || true
  fi

  echo "Deleting Kind cluster ${CLUSTER_NAME}..."
  kind delete cluster --name "${CLUSTER_NAME}"
fi

if [[ "${REMOVE_BOOTSTRAP_PROFILE}" == "1" ]]; then
  case "$(uname -s)" in
    Darwin)
      profile_path="${HOME}/Library/Application Support/ai.5dlabs.cto-desktop/bootstrap/setup.json"
      ;;
    Linux)
      profile_path="${XDG_CONFIG_HOME:-${HOME}/.config}/ai.5dlabs.cto-desktop/bootstrap/setup.json"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      profile_path="${APPDATA:-${HOME}/AppData/Roaming}/ai.5dlabs.cto-desktop/bootstrap/setup.json"
      ;;
    *)
      profile_path=""
      ;;
  esac

  if [[ -n "${profile_path}" && -f "${profile_path}" ]]; then
    rm -f "${profile_path}"
    echo "Removed bootstrap profile ${profile_path}."
  elif [[ -n "${profile_path}" ]]; then
    echo "Bootstrap profile ${profile_path} does not exist."
  else
    echo "Could not determine bootstrap profile path for this OS." >&2
  fi
fi

echo "Local CTO stack cleanup complete."
