/**
 * API client for WebAR Virtual Try-On.
 *
 * Uses the host store's axios instance so auth headers, the offline queue and
 * error normalisation all apply automatically — the module never creates its
 * own HTTP client or duplicates that behaviour.
 */

import { api } from '../../../services/api'

const base = productId => `/products/${productId}/virtual-try-on`

export const virtualTryOnApi = {
  /** Public — used by the storefront to decide whether to show a button. */
  get: productId => api.get(base(productId)),

  /** Admin — save calibration values. */
  update: (productId, data) => api.patch(base(productId), data),

  /**
   * Admin — upload a GLB/glTF, or a USDZ when `kind` is 'ios'.
   * `onProgress` receives 0..100 so the dashboard can show a real bar
   * instead of an indefinite spinner on a 15 MB file.
   */
  uploadModel: (productId, file, { kind = 'glb', onProgress } = {}) => {
    const form = new FormData()
    form.append('model', file)
    return api.post(`${base(productId)}/model`, form, {
      params: kind === 'ios' ? { kind: 'ios' } : undefined,
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,   // large assets over mobile upload links
      onUploadProgress: evt => {
        if (onProgress && evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100))
      },
    })
  },

  deleteModel: (productId, kind = 'glb') =>
    api.delete(`${base(productId)}/model`, {
      params: kind === 'ios' ? { kind: 'ios' } : undefined,
    }),

  uploadPreview: (productId, file, onProgress) => {
    const form = new FormData()
    form.append('image', file)
    return api.post(`${base(productId)}/preview`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: evt => {
        if (onProgress && evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100))
      },
    })
  },

  copyFrom: (productId, sourceId) => api.post(`${base(productId)}/copy-from/${sourceId}`),

  reset: productId => api.post(`${base(productId)}/reset`),
}

export default virtualTryOnApi
