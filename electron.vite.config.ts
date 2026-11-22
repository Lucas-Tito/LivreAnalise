import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          documentWorker: resolve('src/main/services/documentWorker.cjs')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), {
      name: 'renderer-content-security-policy',
      transformIndexHtml(html, context) {
        const dev = Boolean(context.server)
        const policy = [
          "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-src 'none'",
          `script-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
          "style-src 'self' 'unsafe-inline'", "font-src 'self' data:", "img-src 'self' data:",
          `connect-src 'self'${dev ? ' ws:' : ''}`
        ].join('; ')
        return html.replace('<!-- CONTENT_SECURITY_POLICY -->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`)
      }
    }],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    }
  }
})
