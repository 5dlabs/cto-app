# Restore Real Setup Functionality Implementation Plan

> **For Hermes:** Execute immediately in the active CTO Desktop worktree; do not wait for a separate confirmation.

**Goal:** Remove the temporary demo-only fake install / skip automation so the desktop setup flow always runs the real Tauri/Rust baseline prep and final `bootstrap_local_stack` path.

**Architecture:** Keep the existing browser init preview and browser shell bypasses because they are explicit non-desktop tooling, but delete the live-demo-only setup mode that short-circuited real work. The desktop wizard should require real readiness gates, call `prepare_local_stack_dependencies` from the intro prep step, and call `bootstrap_local_stack` from Start.

**Tech Stack:** React + TypeScript setup gate, Tauri command bridge, Node test assertions.

---

### Task 1: Remove demo mode detection and auto-advance hooks

**Objective:** Delete `setupDemo` / `setupDemoAuto` runtime switches and the 350ms demo auto-navigation machinery.

**Files:**
- Modify: `ui/src/components/LocalStackBootstrap.tsx`
- Modify: `ui/src/vite-env.d.ts`

**Steps:**
1. Remove `SETUP_DEMO_ADVANCE_MS`, `isSetupDemoMode()`, and `isSetupDemoAutoAdvanceMode()`.
2. Remove `VITE_CTO_SETUP_DEMO` and `VITE_CTO_SETUP_DEMO_AUTO` from `ImportMetaEnv`.
3. Remove the demo-only auto-advance effect and helper.
4. Keep normal Morgan intro pacing based on media duration / fallback.

**Verification:** Source search for `setupDemo`, `SETUP_DEMO`, and `VITE_CTO_SETUP_DEMO` should return no matches in `ui/src`.

### Task 2: Restore real Client Cluster prep

**Objective:** Ensure the intro Client Cluster phase always calls the real Tauri prep command in the desktop app.

**Files:**
- Modify: `ui/src/components/LocalStackBootstrap.tsx`

**Steps:**
1. Remove the `isSetupDemoMode()` short-circuit from `prepareClusterDependencies()`.
2. Preserve the existing explicit browser init-preview branch.
3. Keep the real `invokeTauri("prepare_local_stack_dependencies")` branch as the only desktop path.

**Verification:** The prep function contains `invokeTauri("prepare_local_stack_dependencies")` and no `Demo baseline prepared` message.

### Task 3: Restore real final bootstrap

**Objective:** Ensure Start cannot fake completion and must use the real bootstrap command when running inside Tauri.

**Files:**
- Modify: `ui/src/components/LocalStackBootstrap.tsx`

**Steps:**
1. Delete `runDemoBootstrap()`.
2. Remove the demo early-return from `runBootstrap()`.
3. Keep `persistSourceConnection()` before `invokeTauri("bootstrap_local_stack", ...)`.
4. Change the final Start button back to `disabled={!canContinue}` so skipped/incomplete required screens cannot launch.

**Verification:** `runBootstrap()` contains `persistSourceConnection()` and `invokeTauri("bootstrap_local_stack")`, and Start uses `disabled={!canContinue}`.

### Task 4: Flip tests from demo-contract to real-functionality contract

**Objective:** Replace tests that guaranteed fake demo behavior with tests that guard against its return.

**Files:**
- Modify: `scripts/e2e/morgan-media-playback-once.test.mjs`

**Steps:**
1. Replace the two demo-mode assertions with tests that assert demo symbols are absent.
2. Add / keep assertions that prep and final Start route through the real Tauri commands.
3. Keep Morgan media playback assertions intact.

**Verification:** `node --test scripts/e2e/morgan-media-playback-once.test.mjs` passes.

### Task 5: Validate focused build gates

**Objective:** Prove the restored source is type-safe and covered by the focused contract tests.

**Commands:**
- `npm --workspace ui run typecheck`
- `node --test scripts/e2e/morgan-media-playback-once.test.mjs`

**Expected:** Both commands pass.
