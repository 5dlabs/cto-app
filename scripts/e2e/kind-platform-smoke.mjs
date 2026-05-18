#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const context = readArg("--context") ?? process.env.CTO_E2E_KUBE_CONTEXT ?? "kind-cto-app";
const namespace = readArg("--namespace") ?? process.env.CTO_E2E_NAMESPACE ?? "cto";
const timeoutMs = Number(readArg("--timeout-ms") ?? process.env.CTO_E2E_TIMEOUT_MS ?? "900000");
const pollMs = Number(readArg("--poll-ms") ?? "5000");
const expectedApps = ["cto", "qdrant", "morgan", "voice-bridge"];
const expectedTools = ["filesystem", "memory", "firecrawl", "tavily", "exa"];

if (pathToFileURL(path.resolve(process.argv[1] ?? "")).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

async function main() {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = runSmokeOnce();
    if (result.ok) {
      console.log("Kubernetes platform smoke passed");
      return;
    }
    if (!watch) {
      throw new Error(result.errors.join("\n"));
    }
    console.log(`Kubernetes platform smoke waiting:\n${result.errors.join("\n")}`);
    await delay(pollMs);
  } while (Date.now() < deadline);

  throw new Error(`Kubernetes platform smoke timed out after ${timeoutMs}ms`);
}

function runSmokeOnce() {
  const errors = [];
  const kind = kubectl(["cluster-info"]);
  if (kind.status !== 0) {
    return { ok: false, errors: [`cluster is not ready for context ${context}: ${kind.stderr || kind.stdout}`] };
  }

  assertNamespace(errors);
  assertArgoApps(errors);
  assertWorkloads(errors);
  assertSecrets(errors);
  assertToolsConfig(errors);
  assertToolsService(errors);

  return { ok: errors.length === 0, errors };
}

function assertNamespace(errors) {
  const cto = kubectl(["get", "namespace", namespace, "-o", "name"]);
  if (cto.status !== 0) errors.push(`namespace ${namespace} is missing`);

  const old = kubectl(["get", "namespace", "cto-system", "-o", "name"]);
  if (namespace !== "cto-system" && old.status === 0) {
    errors.push("legacy namespace cto-system exists; desktop bootstrap should converge on cto only");
  }
}

function assertArgoApps(errors) {
  for (const app of expectedApps) {
    const result = kubectl([
      "-n",
      "argocd",
      "get",
      "application",
      app,
      "-o",
      "jsonpath={.status.sync.status} {.status.health.status}",
    ]);
    if (result.status !== 0) {
      errors.push(`Argo Application ${app} is missing: ${result.stderr || result.stdout}`);
      continue;
    }
    const status = result.stdout.trim();
    if (status !== "Synced Healthy") {
      errors.push(`Argo Application ${app} not ready: ${status || "unknown"}`);
    }
  }
}

function assertWorkloads(errors) {
  for (const resource of [
    "deployment/cto-controller",
    "deployment/cto-tools",
    "deployment/voice-bridge",
    "statefulset/qdrant",
    "statefulset/openclaw-gateway-morgan",
  ]) {
    const result = kubectl(["-n", namespace, "rollout", "status", resource, "--timeout=1s"]);
    if (result.status !== 0) {
      errors.push(`${resource} not rolled out: ${compact(result.stderr || result.stdout)}`);
    }
  }

  const pods = kubectl(["-n", namespace, "get", "pods", "-o", "json"]);
  if (pods.status !== 0) {
    errors.push(`failed to list pods: ${pods.stderr || pods.stdout}`);
    return;
  }
  const data = JSON.parse(pods.stdout);
  for (const pod of data.items ?? []) {
    const badStatuses = collectBadContainerStatuses(pod);
    if (badStatuses.length > 0) {
      errors.push(`${pod.metadata.name} has non-running containers: ${badStatuses.join(", ")}`);
    }
  }
}

function collectBadContainerStatuses(pod) {
  return [...(pod.status?.initContainerStatuses ?? []), ...(pod.status?.containerStatuses ?? [])]
    .filter((status) => {
      if (status.state?.waiting) return true;
      const terminated = status.state?.terminated;
      if (!terminated) return false;
      return !(terminated.reason === "Completed" && (terminated.exitCode ?? 0) === 0);
    })
    .map((status) => `${status.name}:${status.state?.waiting?.reason ?? status.state?.terminated?.reason}`);
}

function assertSecrets(errors) {
  const expectedSecrets = [
    ["cto-agent-keys", ["GITHUB_TOKEN"]],
    ["ghcr-pull-secret", [".dockerconfigjson"]],
  ];
  for (const [secret, keys] of expectedSecrets) {
    const result = kubectl(["-n", namespace, "get", "secret", secret, "-o", "json"]);
    if (result.status !== 0) {
      errors.push(`secret ${namespace}/${secret} is missing`);
      continue;
    }
    const data = JSON.parse(result.stdout).data ?? {};
    for (const key of keys) {
      if (!(key in data)) errors.push(`secret ${namespace}/${secret} missing key ${key}`);
    }
  }

  const argocdRepo = kubectl(["-n", "argocd", "get", "secret", "ghcr-helm-charts-repository", "-o", "name"]);
  if (argocdRepo.status !== 0) {
    errors.push("Argo CD GHCR OCI repository secret is missing");
  }
}

function assertToolsConfig(errors) {
  const result = kubectl([
    "-n",
    namespace,
    "get",
    "configmap",
    "cto-tools-config",
    "-o",
    "jsonpath={.data.mcp-servers\\.json}",
  ]);
  if (result.status !== 0) {
    errors.push(`cto-tools ConfigMap is missing: ${result.stderr || result.stdout}`);
    return;
  }

  const config = JSON.parse(result.stdout);
  const servers = config.servers ?? {};
  for (const tool of expectedTools) {
    if (!servers[tool]?.enabled) {
      errors.push(`tools ConfigMap missing enabled MCP server ${tool}`);
    }
  }
}

function assertToolsService(errors) {
  const ready = kubectl([
    "get",
    "--raw",
    `/api/v1/namespaces/${namespace}/services/http:cto-tools:3000/proxy/ready`,
  ]);
  if (ready.status !== 0) {
    errors.push(`cto-tools /ready failed: ${compact(ready.stderr || ready.stdout)}`);
  }
}

function kubectl(args) {
  return run("kubectl", ["--context", context, ...args]);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function compact(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const smokeTestInternals = { collectBadContainerStatuses };

export function startKubernetesSmoke(extraArgs = []) {
  return spawn(process.execPath, [fileURLToPath(import.meta.url), "--watch", ...extraArgs], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}
