/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITLAB_ORIGIN?: string;
  readonly VITE_GITLAB_DEFAULT_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
