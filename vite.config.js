import { defineConfig } from 'vite';

// base must match the GitHub Pages project URL (guarded by smoke_checks/h0_base_path.mjs)
export default defineConfig({
  base: '/tumble-rush/',
  build: { chunkSizeWarningLimit: 2000 },
});
