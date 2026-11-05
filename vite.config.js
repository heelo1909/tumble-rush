import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (name) => fileURLToPath(new URL(name, import.meta.url));

// base must match the GitHub Pages project URL (guarded by smoke_checks/h0_base_path.mjs)
export default defineConfig({
  base: '/tumble-rush/',
  build: {
    chunkSizeWarningLimit: 2000,
    // two pages: the game (index.html) and the school-Wi-Fi connection check (probe.html, H1)
    rollupOptions: {
      input: {
        main: page('index.html'),
        probe: page('probe.html'),
      },
    },
  },
});
