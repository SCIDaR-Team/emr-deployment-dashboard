/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'static' reads public/data; 'api' would target a backend. See DataSource. */
  readonly VITE_DATA_SOURCE?: 'static' | 'api';
  readonly VITE_API_BASE_URL?: string;
  /** Opt into the five-band maturity labels. Guide §17.2. */
  readonly VITE_USE_MATURITY_BANDS?: 'true' | 'false';
  /** Show the "Ask the data" assistant in a production build. Leave off
   *  unless the deployment has the endpoint; `npm run dev` always shows it.
   *  See server/README.md. */
  readonly VITE_ASSISTANT_ENABLED?: 'true' | 'false';
  /** Where the assistant endpoint is; defaults to `/api/assistant` on the
   *  dashboard's own origin. */
  readonly VITE_ASSISTANT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
