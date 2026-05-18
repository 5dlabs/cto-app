#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const assumeYes = args.has("--yes") || args.has("-y");
const preserveGithubCliAuth = args.has("--preserve-github-cli-auth");
const skipGitopsRepoDelete = args.has("--skip-gitops-repo-delete") || process.env.CTO_E2E_DELETE_GITOPS_REPO === "0";
const clusterName = process.env.CTO_KIND_CLUSTER_NAME ?? "cto-app";
const gitopsRepoName = process.env.CTO_E2E_GITOPS_REPO_NAME ?? "cto-gitops";

if (!assumeYes && process.env.CI !== "true") {
  throw new Error("clean-slate teardown deletes local CTO state; pass --yes to continue");
}

main();

function main() {
  deleteKindCluster();
  deleteGitopsReferenceRepo();
  removePath(bootstrapProfilePath(), "bootstrap profile");
  removePath(sourceControlStoreDir(), "source-control credentials");
  removePath(bootstrapRunLogDir(), "bootstrap run logs");
  clearE2eTokenEnvironment();
  if (!preserveGithubCliAuth) {
    console.log("GitHub CLI auth preserved; pass --preserve-github-cli-auth explicitly documents that this teardown will not run gh auth logout.");
  }
  console.log("Clean-slate CTO local E2E teardown complete.");
}

function deleteKindCluster() {
  const clusters = run("kind", ["get", "clusters"], { allowFailure: true }).stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!clusters.includes(clusterName)) {
    console.log(`Kind cluster ${clusterName} does not exist.`);
    return;
  }

  const context = process.env.CTO_KIND_CONTEXT ?? `kind-${clusterName}`;
  run(
    "kubectl",
    [
      "--context",
      context,
      "-n",
      "argocd",
      "patch",
      "applications.argoproj.io",
      "--all",
      "--type",
      "merge",
      "--patch",
      '{"metadata":{"finalizers":[]}}',
    ],
    { allowFailure: true },
  );
  run(
    "kubectl",
    ["--context", context, "-n", "argocd", "delete", "applications.argoproj.io", "--all", "--ignore-not-found", "--wait=false"],
    { allowFailure: true },
  );

  run("kind", ["delete", "cluster", "--name", clusterName]);
}

function deleteGitopsReferenceRepo() {
  if (skipGitopsRepoDelete) {
    console.log("GitOps reference repository deletion skipped.");
    return;
  }

  const owner = githubOwner();
  if (!owner) {
    console.log("GitOps reference repository deletion skipped because no GitHub owner is configured.");
    return;
  }

  const repo = gitopsRepoName;
  const tokenAvailable = Boolean(
    process.env.CTO_E2E_GITHUB_PAT ?? process.env.CTO_GITHUB_PAT ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_PAT,
  );
  const authStatus = tokenAvailable
    ? { status: 0 }
    : run("gh", ["auth", "status", "--hostname", "github.com"], { allowFailure: true });
  if (authStatus.status !== 0) {
    console.log(`GitOps reference repository ${owner}/${repo} deletion skipped because GitHub auth is unavailable.`);
    return;
  }

  run("gh", ["api", "-X", "DELETE", `repos/${owner}/${repo}`], { allowFailure: true });
  console.log(`Requested deletion for GitOps reference repository ${owner}/${repo}.`);
}

function githubOwner() {
  const configured = process.env.CTO_E2E_GITHUB_OWNER ?? process.env.CTO_GITHUB_OWNER;
  if (configured?.trim()) return configured.trim();
  const result = run("gh", ["api", "user", "--jq", ".login"], { allowFailure: true });
  const owner = result.stdout.trim();
  return owner.length > 0 ? owner : undefined;
}

function bootstrapProfilePath() {
  return join(appConfigDir(), "bootstrap", "setup.json");
}

function sourceControlStoreDir() {
  return join(appConfigDir(), "source-control");
}

function bootstrapRunLogDir() {
  return join(process.cwd(), ".local", "bootstrap-runs");
}

function appConfigDir() {
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "ai.5dlabs.cto-desktop");
  if (platform() === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "ai.5dlabs.cto-desktop");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "ai.5dlabs.cto-desktop");
}

function removePath(path, label) {
  if (!existsSync(path)) {
    console.log(`${label} ${path} does not exist.`);
    return;
  }
  rmSync(path, { force: true, recursive: true });
  console.log(`Removed ${label} ${path}.`);
}

function clearE2eTokenEnvironment() {
  for (const name of [
    "CTO_E2E_GITHUB_PAT",
    "CTO_GITHUB_PAT",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "GITHUB_PAT",
    "CTO_E2E_GITHUB_OWNER",
    "CTO_GITHUB_OWNER",
  ]) {
    delete process.env[name];
  }
  console.log("Cleared in-process E2E GitHub token and owner environment overrides.");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`.trim());
  }
  return result;
}
