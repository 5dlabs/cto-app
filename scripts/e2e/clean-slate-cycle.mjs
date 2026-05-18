#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const teardownArgs = ["scripts/e2e/clean-slate-teardown.mjs", "--yes", "--preserve-github-cli-auth"];
const cycleArgs = ["scripts/e2e/local-stack-cycle.mjs", "--reset", "--start", "--k8s-smoke"];
if (process.argv.includes("--intent-test") || process.env.CTO_E2E_INTENT_TEST === "1") {
  cycleArgs.push("--intent-test");
}

run(process.execPath, teardownArgs);

run(process.execPath, cycleArgs, {
  ...process.env,
  CTO_E2E_DISABLE_GITHUB_TOKEN_FALLBACK: process.env.CTO_E2E_DISABLE_GITHUB_TOKEN_FALLBACK ?? "1",
});

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
