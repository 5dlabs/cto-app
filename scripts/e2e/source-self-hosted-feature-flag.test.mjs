import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const runtime = readFileSync(new URL("../../ui/src/runtime.ts", import.meta.url), "utf8");
const envTypes = readFileSync(new URL("../../ui/src/vite-env.d.ts", import.meta.url), "utf8");
const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");

function sourceRegion() {
  const start = source.indexOf('setupScreen === "source" ? (');
  const end = source.indexOf('setupScreen === "clis" ? (', start);
  assert.notEqual(start, -1, "source screen branch should exist");
  assert.notEqual(end, -1, "clis branch should follow source screen branch");
  return source.slice(start, end);
}

describe("Source self-hosted feature flag", () => {
  it("defines a Vite kill switch that defaults self-hosted Source off", () => {
    assert.match(envTypes, /VITE_CTO_ENABLE_SELF_HOSTED_SOURCE/);
    assert.match(runtime, /shouldEnableSelfHostedSource/);
    assert.match(runtime, /VITE_CTO_ENABLE_SELF_HOSTED_SOURCE\s*===\s*"1"/);
  });

  it("guards top-level 5D Origin without deleting its code path", () => {
    const region = sourceRegion();

    assert.match(source, /shouldEnableSelfHostedSource/);
    assert.match(source, /const enableSelfHostedSource = shouldEnableSelfHostedSource\(\)/);
    assert.match(region, /enableSelfHostedSource \? \(/);
    assert.match(region, /data-testid="source-install-5d-origin"/);
    assert.match(region, /setSourceModalProvider\("origin"\)/);
  });

  it("guards existing-provider self-hosted toggles behind the same flag", () => {
    assert.match(source, /enableSelfHostedSource && showSourceAdvanced \? \(/);
    assert.match(source, /data-testid="source-github-enterprise"/);
    assert.match(source, /data-testid="source-gitlab-self-managed"/);
    assert.match(source, /enableSelfHostedSource && sourceModalProvider === null && sourceHostMode === "self-hosted"/);
  });
});
