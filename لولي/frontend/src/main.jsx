import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

/* Offline shell. Registered only in production — during dev the SW would
   serve stale bundles and fight Vite's HMR. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('تعذّر تسجيل service worker:', err?.message)
    })
  })
}

/* Fade out the index.html splash once the app has painted — kept up for at
   least ~0.9s from page start so it reads as a splash, not a flash. */
const splash = document.getElementById('luliz-splash')
if (splash) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      splash.classList.add('is-done')
      setTimeout(() => splash.remove(), 500)
    }, Math.max(0, 900 - performance.now()))
  })
}
