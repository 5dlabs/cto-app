import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");

function introRegion() {
  const start = source.indexOf('key="intro"');
  const end = source.indexOf(') : isCredentialSetup ? (', start);
  assert.notEqual(start, -1, "intro setup branch should exist");
  assert.notEqual(end, -1, "credential branch should follow intro setup branch");
  return source.slice(start, end);
}

describe("Client Cluster first setup screen", () => {
  it("shows only the baseline infrastructure install scope before Source", () => {
    const region = introRegion();

    assert.match(region, /Client Cluster/);
    assert.match(region, /Kind/);
    assert.match(region, /Ingress/);
    assert.match(region, /NGINX/);
    assert.match(region, /Argo CD/);
    assert.match(region, /Helm/);
    assert.match(region, /Charts/);
    assert.match(region, /CTO \+ Qdrant/);
    assert.match(region, /Prepare Client Cluster baseline/);

    assert.doesNotMatch(region, />\s*Tools\s*</);
    assert.doesNotMatch(region, /Kind \+ kubectl \+ Helm/);
    assert.doesNotMatch(region, /providers|models|agent tokens/i);
    assert.doesNotMatch(region, /local stack/i);
    assert.doesNotMatch(region, /I.ll prepare the Client Cluster first/i);
    assert.doesNotMatch(region, /local-bootstrap__decision-card-kicker">Morgan/);
  });

  it("surfaces the same complete status footprint before and after metrics load", () => {
    const region = introRegion();

    assert.match(region, /data-testid="client-cluster-pod-status"/);
    assert.match(source, /buildClientClusterBaselineItems/);
    assert.match(source, /countPodsInNamespace/);
    assert.match(source, /summarizePodsInNamespace/);

    const functionStart = source.indexOf("function buildClientClusterBaselineItems");
    const functionEnd = source.indexOf("function formatRuntimeFootprint", functionStart);
    const buildBaselineItems = source.slice(functionStart, functionEnd);
    const missingReportBranchStart = buildBaselineItems.indexOf("if (!metrics.report)");
    const missingReportBranchEnd = buildBaselineItems.indexOf("const report = metrics.report", missingReportBranchStart);
    const missingReportBranch = buildBaselineItems.slice(missingReportBranchStart, missingReportBranchEnd);

    assert.match(region, /\{buildClientClusterBaselineItems\(metrics\)\.map/);
    for (const label of ["Kind", "Ingress", "Argo CD", "CTO", "Pods"]) {
      assert.match(missingReportBranch, new RegExp(`label: "${label}"`));
      assert.match(buildBaselineItems, new RegExp(`label: "${label}"`));
    }

    assert.match(buildBaselineItems, /ingress-nginx/);
    assert.match(buildBaselineItems, /argocd/);
    assert.match(buildBaselineItems, /cto/);
  });
});
