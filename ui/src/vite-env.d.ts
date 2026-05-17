/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CODER_BASE_URL?: string;
  readonly VITE_GITLAB_ORIGIN?: string;
  readonly VITE_GITLAB_DEFAULT_PATH?: string;
  readonly VITE_PROJECT_API_URL?: string;
  readonly VITE_VOICE_BRIDGE_WS?: string;
  /** When "1", show first-run setup in the browser with Tauri/bootstrap calls stubbed. */
  readonly VITE_CTO_INIT_PREVIEW?: string;
  /** When "1", show the local-stack bootstrap gate even inside the desktop shell. */
  readonly VITE_CTO_FORCE_LOCAL_STACK_BOOTSTRAP?: string;
  /**
   * Set to "0" for UI/layout work without launching Morgan remotely:
   * — no LiveKit iframe, no LemonSlice agent widget, no voice-bridge connects.
   * URL `?morganAutostart=true|false` overrides at runtime.
   */
  readonly VITE_CTO_MORGAN_AUTOSTART?: string;
  /** When "1", expose the deferred self-hosted Source lanes: 5D Origin, GitHub Enterprise, and self-managed GitLab. */
  readonly VITE_CTO_ENABLE_SELF_HOSTED_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
