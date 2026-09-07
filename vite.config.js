import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
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
