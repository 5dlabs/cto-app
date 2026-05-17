export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readBooleanSearchParam(name: string): boolean | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(name);
  if (!raw) return null;
  if (/^(1|true|on|yes)$/i.test(raw)) return true;
  if (/^(0|false|off|no)$/i.test(raw)) return false;
  return null;
}

/** Browser UI preview: show LocalStackBootstrap without running Rust / Kind provisioning. */
export function isInitPreviewMode(): boolean {
  const override = readBooleanSearchParam("initPreview");
  const bootstrapOverride = readBooleanSearchParam("bootstrapPreview");
  if (override !== null) return override;
  if (bootstrapOverride !== null) return bootstrapOverride;
  return import.meta.env.VITE_CTO_INIT_PREVIEW === "1";
}

/** Back-compat alias used by bootstrap + tauri helpers. */
export function isLocalStackBootstrapPreview(): boolean {
  return isInitPreviewMode();
}

export function shouldSkipLocalStackBootstrap(): boolean {
  if (isInitPreviewMode()) {
    return false;
  }
  if (import.meta.env.VITE_CTO_FORCE_LOCAL_STACK_BOOTSTRAP === "1") {
    return false;
  }
  return !isTauriRuntime();
}

/** When false (e.g. `VITE_CTO_MORGAN_AUTOSTART=0`), remote Morgan stays off — embed, LemonSlice, and voice bridge never connect while you work on the UI. */
export function shouldAutostartMorgan(): boolean {
  const override = readBooleanSearchParam("morganAutostart");
  if (override !== null) return override;
  return import.meta.env.VITE_CTO_MORGAN_AUTOSTART !== "0";
}

/** Time-crunch launch switch: hide self-hosted Source lanes unless explicitly enabled. */
export function shouldEnableSelfHostedSource(): boolean {
  return import.meta.env.VITE_CTO_ENABLE_SELF_HOSTED_SOURCE === "1";
}
