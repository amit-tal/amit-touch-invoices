import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { documentServerMiddleware } from './server/documentServerMiddleware.ts'

function documentsBackendPlugin(): Plugin {
  return {
    name: 'documents-backend-api',
    configureServer(server) {
      server.middlewares.use(documentServerMiddleware())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), documentsBackendPlugin()],
  server: {
    allowedHosts: true,
    watch: {
      ignored: [
        '**/data/**',
        '**/scratch/**',
        '**/protected_backups/**',
        '**/.system_generated/**',
        '**/*.json',
        '**/*.pdf',
        '**/*.html',
      ],
    },
  },
})
