import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // Relative, so the build works at a domain root and under a repository
    // subpath (GitHub Pages serves this one from /CLM-POC/) without a rebuild.
    base: './',
    plugins: [react()],
    server: {
      proxy: {
        '/salesforce': {
          target: env.VITE_SALESFORCE_URL || 'https://login.salesforce.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/salesforce/, ''),
        },

        '/documenso': {
          target: env.VITE_DOCUMENSO_URL || 'https://app.documenso.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/documenso/, '/api/v2'),
        },
      },
    },
  }
})
