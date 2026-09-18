import { defineConfig } from 'vite'

// The GitHub Pages deployment serves the game from /<repo>/, while `npm run dev`
// and any custom domain serve it from /. BASE_PATH is set by the Pages workflow.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
  },
  server: {
    fs: {
      // Private reference originals must not be reachable as a URL.
      deny: ['**/refs/**'],
    },
  },
})
