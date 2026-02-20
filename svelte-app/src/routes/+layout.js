// Disable SSR — this is a client-side SPA served by the Express backend.
// All data fetching happens client-side via /api calls.
export const ssr = false;
export const prerender = false;
