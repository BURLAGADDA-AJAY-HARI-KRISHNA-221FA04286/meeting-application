import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // ── Chunk splitting for faster loads ──
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['lucide-react', 'react-hot-toast'],
        },
      },
    },
    // ── Smaller output ──
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    chunkSizeWarningLimit: 600,
    sourcemap: false,
  },
  // ── Dev server speed ──
  server: {
    hmr: { overlay: true },
    warmup: { clientFiles: ['./src/App.jsx', './src/main.jsx'] },
  },
  // ── Optimize deps ──
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'axios', 'framer-motion', 'lucide-react'],
  },
})
