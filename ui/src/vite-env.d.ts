/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CODER_BASE_URL?: string;
  readonly VITE_GITLAB_ORIGIN?: string;
  readonly VITE_GITLAB_DEFAULT_PATH?: string;
  readonly VITE_PROJECT_API_URL?: string;
  readonly VITE_VOICE_BRIDGE_WS?: string;
  readonly VITE_CTO_SKIP_LOCAL_STACK_BOOTSTRAP?: string;
  /** When "1", show first-run setup in the browser with Tauri/bootstrap calls stubbed. */
  readonly VITE_CTO_INIT_PREVIEW?: string;
  /** Back-compat alias for init preview mode used by main branch scripts. */
  readonly VITE_CTO_FORCE_LOCAL_STACK_BOOTSTRAP?: string;
  /** Set to "0" to keep Morgan idle until opened explicitly. */
  readonly VITE_CTO_MORGAN_AUTOSTART?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
