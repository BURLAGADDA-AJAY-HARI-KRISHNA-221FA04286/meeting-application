import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // ── Chunk splitting for parallel loading ──
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': ['react', 'react-dom'],
          'react-router': ['react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['lucide-react', 'react-hot-toast'],
        },
      },
      treeshake: { moduleSideEffects: false },
    },
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    sourcemap: false,
  },
  // Drop console/debugger in production (correct top-level key)
  esbuild: {
    drop: ['console', 'debugger'],
  },
  // ── Dev server ──
  server: {
    hmr: { overlay: true },
    warmup: {
      clientFiles: [
        './src/App.jsx',
        './src/main.jsx',
        './src/pages/DashboardPage.jsx',
        './src/pages/MeetingsPage.jsx',
        './src/components/Layout.jsx',
      ],
    },
  },
  // ── Pre-bundle for instant dev loads ──
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-router-dom',
      'axios', 'framer-motion', 'lucide-react', 'react-hot-toast',
    ],
  },
})

