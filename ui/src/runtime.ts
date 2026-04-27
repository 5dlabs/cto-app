export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function shouldSkipLocalStackBootstrap(): boolean {
  return !isTauriRuntime() || import.meta.env.VITE_CTO_SKIP_LOCAL_STACK_BOOTSTRAP === "1";
}
