export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readBootstrapSearchFlag(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("bootstrapPreview") === "1";
}

export function isLocalStackBootstrapPreview(): boolean {
  return (
    !isTauriRuntime() &&
    (import.meta.env.VITE_CTO_FORCE_LOCAL_STACK_BOOTSTRAP === "1" || readBootstrapSearchFlag())
  );
}

export function shouldSkipLocalStackBootstrap(): boolean {
  if (isLocalStackBootstrapPreview()) {
    return false;
  }

  return !isTauriRuntime() || import.meta.env.VITE_CTO_SKIP_LOCAL_STACK_BOOTSTRAP === "1";
}
