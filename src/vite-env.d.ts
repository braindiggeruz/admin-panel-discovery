/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ADMIN_PASSPHRASE?: string;
  readonly VITE_GAME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
