import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: '../dist-svelte',
      assets: '../dist-svelte',
      fallback: 'index.html',  // SPA fallback for client-side routing
    }),
  },
};

export default config;
