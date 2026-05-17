import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const script = readFileSync(new URL("../dev/cto-app", import.meta.url), "utf8");

describe("cto-app CLI launcher", () => {
  it("provides the requested start subcommand", () => {
    assert.match(script, /case "\$\{1:-start\}" in/);
    assert.match(script, /start\)/);
    assert.match(script, /exec npm run tauri:dev/);
  });

  it("runs CTO Desktop from the repository root with Rust and Homebrew paths available", () => {
    assert.match(script, /REPO_ROOT=.*5dlabs\/cto-app/);
    assert.match(script, /cd "\$REPO_ROOT"/);
    assert.match(script, /\.rustup\/toolchains\/stable-aarch64-apple-darwin\/bin/);
    assert.match(script, /\.cargo\/bin/);
    assert.match(script, /\/opt\/homebrew\/bin/);
  });

  it("keeps normal start on real setup rather than demo or bootstrap skip modes", () => {
    assert.doesNotMatch(script, /VITE_CTO_SETUP_DEMO/);
    assert.doesNotMatch(script, /VITE_CTO_SKIP_LOCAL_STACK_BOOTSTRAP/);
    assert.doesNotMatch(script, /setupDemo/);
    assert.match(script, /VITE_CTO_FORCE_LOCAL_STACK_BOOTSTRAP=1/);
  });
});
