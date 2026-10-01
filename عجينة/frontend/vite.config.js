import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  resolve: { alias: { '@': '/src' } },
  build: {
    chunkSizeWarningLimit: 800,
    minify: 'terser',
    terserOptions: { compress: { drop_console: true, drop_debugger: true } },
    rollupOptions: {
      output: {
        /* Granular chunks — browser caches each independently */
        manualChunks(id) {
          if (id.includes('node_modules')) {
            /* Match on the package name, not a substring of the full path.
               Substring matching silently mis-sorted `lit-element` into
               `vendor` while `@lit/reactive-element` went to the AR chunk,
               which created a vendor → AR static edge and dragged the whole
               AR payload into the eager graph. */
            const norm = id.replace(/\\/g, '/')
            const after = norm.split('node_modules/').pop()
            const pkg = after.startsWith('@')
              ? after.split('/').slice(0, 2).join('/')
              : after.split('/')[0]

            /* React, react-dom and scheduler ship as one chunk on purpose.
               Splitting react-dom out on its own leaves `react` in `vendor`,
               and because other vendor packages reach back into react-dom
               the two chunks import each other. Rollup then evaluates
               react-dom before React is initialised and the app dies at
               boot with "__SECRET_INTERNALS... of undefined" — a blank page
               in production while the dev server stays fine. */
            if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'react-vendor'
            if (pkg === 'react-router-dom') return 'router'
            if (pkg === 'framer-motion')    return 'framer'
            if (pkg === 'recharts')         return 'charts'
            if (pkg === 'axios')            return 'axios'
            if (pkg === 'react-hot-toast')  return 'toast'
            if (pkg === 'lucide-react')     return 'lucide'

            /* ── WebAR Virtual Try-On ──────────────────────────────────
               These must never reach 'vendor'. Vendor is in the entry's
               static graph, so anything landing there — or anything vendor
               statically imports — is downloaded by every visitor. Keeping
               the AR libraries in their own chunks is what makes them load
               only when a customer opens a viewer. */
            if (pkg === '@mediapipe/tasks-vision') return 'ar-mediapipe'

            // model-viewer plus its entire static dependency subtree.
            if (pkg === '@google/model-viewer'
              || pkg === '@monogrid/gainmap-js'      // imports three directly
              || pkg === 'three-mesh-bvh'
              || pkg === 'lit' || pkg === 'lit-html' || pkg === 'lit-element'
              || pkg.startsWith('@lit')) {
              return 'ar-model-viewer'
            }

            if (pkg === 'three') return 'ar-three'

            return 'vendor'
          }

          /* The try-on module is deliberately NOT forced into one chunk —
             naming it would collapse its lazily-imported viewers into a
             single chunk that the storefront reaches statically, undoing
             the code splitting. Rollup splits it correctly on its own. */
          /* Customer-facing pages → own chunk */
          if (id.includes('pages/customer')) return 'customer-pages'
          /* Admin pages → own chunk (never loaded by customers) */
          if (id.includes('pages/admin'))   return 'admin-pages'
          if (id.includes('pages/center'))  return 'center-pages'
        },
        /* Long-term cache: content-hashed filenames */
        entryFileNames:  'assets/[name]-[hash].js',
        chunkFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash].[ext]',
      }
    }
  }
})
