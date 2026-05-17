import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { smokeTestInternals } from "./kind-platform-smoke.mjs";

const { collectBadContainerStatuses } = smokeTestInternals;

describe("Kubernetes smoke pod status handling", () => {
  it("does not fail pods for successfully completed init containers", () => {
    const pod = {
      metadata: { name: "cto-tools-abc" },
      status: {
        initContainerStatuses: [
          { name: "setup-directories", state: { terminated: { reason: "Completed", exitCode: 0 } } },
          { name: "prewarm-mcp-cache", state: { terminated: { reason: "Completed", exitCode: 0 } } },
        ],
        containerStatuses: [{ name: "tools", state: { running: { startedAt: "2026-04-30T00:00:00Z" } } }],
      },
    };

    assert.deepEqual(collectBadContainerStatuses(pod), []);
  });

  it("still fails waiting init containers and bad terminated containers", () => {
    const pod = {
      metadata: { name: "morgan-0" },
      status: {
        initContainerStatuses: [{ name: "init-workspace", state: { waiting: { reason: "PodInitializing" } } }],
        containerStatuses: [{ name: "agent", state: { terminated: { reason: "Error", exitCode: 1 } } }],
      },
    };

    assert.deepEqual(collectBadContainerStatuses(pod), ["init-workspace:PodInitializing", "agent:Error"]);
  });
});
