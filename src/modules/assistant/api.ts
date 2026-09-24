/** Where the assistant's endpoints are: `/api/assistant` on the dashboard's
 *  own origin unless a build points elsewhere. */
export const ASSISTANT_ENDPOINT = import.meta.env.VITE_ASSISTANT_URL || '/api/assistant';
