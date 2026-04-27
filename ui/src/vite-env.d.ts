/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CODER_BASE_URL?: string;
  readonly VITE_GITLAB_ORIGIN?: string;
  readonly VITE_GITLAB_DEFAULT_PATH?: string;
  readonly VITE_PROJECT_API_URL?: string;
  readonly VITE_VOICE_BRIDGE_WS?: string;
  readonly VITE_CTO_SKIP_LOCAL_STACK_BOOTSTRAP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
