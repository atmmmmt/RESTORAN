import { useEffect, useState, useCallback } from 'react'

/**
 * Wraps the `beforeinstallprompt` flow so any component can show an
 * "ثبّت التطبيق" button without duplicating the event plumbing.
 *
 * Chrome/Edge/Android fire `beforeinstallprompt`; we stash it and replay it
 * on demand via `promptInstall()`. iOS Safari never fires it (no native
 * install prompt there), so `isIos` is exposed for a manual-steps fallback.
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches
  )

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    return outcome === 'accepted'
  }, [deferredPrompt])

  return {
    canInstall: Boolean(deferredPrompt) && !installed,
    isIos: isIos && !installed,
    installed,
    promptInstall,
  }
}
