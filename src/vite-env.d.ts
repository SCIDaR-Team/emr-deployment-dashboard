/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'static' reads public/data; 'api' would target a backend. See DataSource. */
  readonly VITE_DATA_SOURCE?: 'static' | 'api';
  readonly VITE_API_BASE_URL?: string;
  /** Opt into the five-band maturity labels. Guide §17.2. */
  readonly VITE_USE_MATURITY_BANDS?: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
