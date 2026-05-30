import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../../ui/src/components/LocalStackBootstrap.tsx", import.meta.url), "utf8");

describe("Morgan setup provider filtering", () => {
  it("filters provider choices by the selected dynamic workflow before rendering the Providers screen", () => {
    assert.match(source, /selectedProviderFilterCliIds/);
    assert.match(source, /provider\.cliIds\.some\(\(cliId\) => selectedProviderFilterCliIds\.includes\(cliId\)\)/);
    assert.match(source, /slice\(0, PROVIDER_VISIBLE_LIMIT\)/);
    assert.match(source, /showAllProviders/);
    const visibleProviderOptionsIndex = source.indexOf('const visibleProviderOptions = useMemo');
    const selectedProviderFilterIndex = source.indexOf('selectedProviderFilterCliIds.length > 0');
    const limitedProviderOptionsIndex = source.indexOf('const limitedProviderOptions = useMemo');
    assert.ok(visibleProviderOptionsIndex >= 0, "visible provider options memo should exist");
    assert.ok(selectedProviderFilterIndex > visibleProviderOptionsIndex, "provider filtering should happen inside visibleProviderOptions");
    assert.ok(limitedProviderOptionsIndex > visibleProviderOptionsIndex, "providers should be capped after filtering");
  });

  it("keeps the first provider decision compact unless the user asks for more", () => {
    assert.match(source, /const PROVIDER_VISIBLE_LIMIT = 12/);
    assert.match(source, /Show all providers/);
    assert.match(source, /recommended providers/);
  });
});
