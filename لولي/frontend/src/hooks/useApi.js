import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'

export function useApi(apiFn, options = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const execute = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFn(...args)
      setData(res.data)
      if (options.successMessage) toast.success(options.successMessage)
      return res.data
    } catch (err) {
      const msg = err.message || 'حدث خطأ'
      setError(msg)
      if (!options.silentError) toast.error(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [apiFn, options.successMessage, options.silentError])

  return { data, loading, error, execute }
}
