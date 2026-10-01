import { useCallback, useEffect, useState } from 'react'
import virtualTryOnApi from '../services/virtualTryOnApi'
import { DEFAULT_TRY_ON, getTryOnMode } from '../types/virtualTryOn.types'

/**
 * Loads a product's try-on configuration.
 *
 * Used by the storefront (to decide whether to render a button) and by the
 * admin calibration editor (as the working copy being edited).
 */
export function useTryOnCalibration(productId, { autoLoad = true } = {}) {
  const [config, setConfig] = useState(DEFAULT_TRY_ON)
  const [loading, setLoading] = useState(autoLoad)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!productId) { setLoading(false); return null }
    setLoading(true)
    setError(null)
    try {
      const res = await virtualTryOnApi.get(productId)
      const next = { ...DEFAULT_TRY_ON, ...res.data.virtualTryOn }
      // The server sends `mode`, but recompute defensively so a stale cached
      // payload can't route a product to the wrong bundle.
      next.mode = next.mode || getTryOnMode(next.type)
      setConfig(next)
      return next
    } catch (err) {
      setError(err.message || 'تعذّر تحميل إعدادات التجربة')
      return null
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => { if (autoLoad) load() }, [autoLoad, load])

  /** Local-only edit, for the admin editor's live preview. */
  const patchLocal = useCallback(updates => {
    setConfig(prev => ({ ...prev, ...updates }))
  }, [])

  const save = useCallback(async (updates = {}) => {
    const payload = { ...config, ...updates }
    const res = await virtualTryOnApi.update(productId, payload)
    const next = { ...DEFAULT_TRY_ON, ...res.data.virtualTryOn }
    next.mode = next.mode || getTryOnMode(next.type)
    setConfig(next)
    return next
  }, [config, productId])

  return { config, loading, error, load, save, patchLocal, setConfig }
}
