/// <reference types="vite/client" />

interface ImportMetaEnv {
  // See auth/AuthContext.tsx's DEV_SKIP_AUTH -- local-dev-only convenience,
  // never set in the real deployment.
  readonly VITE_DEV_SKIP_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
