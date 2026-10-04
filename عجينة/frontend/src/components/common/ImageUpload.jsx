import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { uploadAPI } from '../../services/api'
import toast from 'react-hot-toast'

/**
 * ImageUpload — Cloudinary image uploader with drag-and-drop.
 *
 * Props:
 *   value       — current image URL (from Cloudinary) or emoji string
 *   publicId    — current Cloudinary publicId (to delete old image)
 *   onChange    — called with (url, publicId) when upload completes
 *   onDelete    — called when image is removed
 *   label       — optional field label
 *   placeholder — emoji fallback shown when no image
 */
export default function ImageUpload({
  value,
  publicId,
  onChange,
  onDelete,
  label = 'صورة المنتج',
  placeholder = '🍽️',
}) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)
  // Asset uploaded during the current unsaved form session.
  // Existing product images are never deleted until the product save succeeds.
  const pendingUploadRef = useRef(null)

  // Determine if current value is a real URL (not an emoji)
  const isUrl = value && (value.startsWith('http') || value.startsWith('/'))

  const handleFile = useCallback(async (file) => {
    if (!file) return

    // Validate type
    if (!file.type.startsWith('image/')) {
      toast.error('الملف يجب أن يكون صورة')
      return
    }

    // Validate size (max 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('حجم الصورة يجب أن لا يتجاوز 10 ميغابايت')
      return
    }

    setUploading(true)
    setProgress(10)
    let progressInterval = null

    try {
      progressInterval = setInterval(() => {
        setProgress(p => Math.min(p + 15, 85))
      }, 300)

      const res = await uploadAPI.upload(file)
      setProgress(100)

      const { url, publicId: newPublicId, sizeKB } = res.data
      if (!url || !newPublicId) throw new Error('السيرفر لم يرجع بيانات الصورة بشكل صحيح')

      const previousPending = pendingUploadRef.current
      if (previousPending && previousPending !== newPublicId) {
        uploadAPI.delete(previousPending).catch(() => {})
      }
      pendingUploadRef.current = newPublicId
      onChange(url, newPublicId)

      const originalKB = Math.round(file.size / 1024)
      const saved = originalKB > sizeKB ? `وُفِّر ${originalKB - sizeKB} KB` : ''
      toast.success(`✅ تم الرفع${saved ? ` — ${saved}` : ''} (WebP ${sizeKB} KB)`)
    } catch (err) {
      toast.error(err?.message || err?.response?.data?.message || 'فشل رفع الصورة')
    } finally {
      if (progressInterval) clearInterval(progressInterval)
      setUploading(false)
      setProgress(0)
    }
  }, [onChange])

  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = '' // allow re-selecting same file
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleRemove = async () => {
    // Only delete immediately when this was uploaded in the current,
    // still-unsaved form session. Persisted images are removed by the backend
    // only after the product update is safely saved.
    if (pendingUploadRef.current && publicId === pendingUploadRef.current) {
      try { await uploadAPI.delete(publicId) } catch { /* orphan cleanup only */ }
      pendingUploadRef.current = null
    }
    onDelete?.()
    onChange('', null)
  }

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-bold text-brand-dark block">{label}</label>}

      <div
        className={`relative rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
          dragOver
            ? 'border-fuchsia bg-fuchsia-bg border-dashed'
            : 'border-brand-border hover:border-fuchsia/50 border-dashed'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Preview area */}
        <div className="relative h-48 flex items-center justify-center bg-brand-bg">
          <AnimatePresence mode="wait">
            {isUrl ? (
              <motion.img
                key="image"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                src={value}
                alt={label}
                className="h-full w-full object-cover"
              />
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-7xl select-none"
              >
                {value || placeholder}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload progress overlay */}
          <AnimatePresence>
            {uploading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3"
              >
                <div className="w-16 h-16 rounded-full border-4 border-fuchsia/20 border-t-fuchsia animate-spin" />
                <div className="text-sm font-black text-fuchsia">
                  {progress < 30 ? 'جاري الضغط...' : progress < 85 ? 'جاري الرفع...' : 'يكتمل...'}
                </div>
                {/* Progress bar */}
                <div className="w-40 h-1.5 bg-fuchsia/20 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-fuchsia rounded-full"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Drag overlay */}
          <AnimatePresence>
            {dragOver && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-fuchsia/10 flex items-center justify-center pointer-events-none"
              >
                <div className="text-fuchsia font-black text-lg">📂 أفلت الصورة هنا</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-brand-border">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 bg-fuchsia text-white text-xs font-black px-4 py-2 rounded-xl hover:bg-fuchsia-dark transition-all disabled:opacity-50"
            >
              📁 {isUrl ? 'تغيير الصورة' : 'رفع صورة'}
            </button>
            {isUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading}
                className="inline-flex items-center gap-1 bg-red-50 text-red-500 text-xs font-bold px-3 py-2 rounded-xl hover:bg-red-100 transition-all"
              >
                🗑️ حذف
              </button>
            )}
          </div>
          <div className="text-[10px] text-brand-gray font-bold text-left">
            JPEG · PNG · WebP<br />
            <span className="text-fuchsia/70">يُضغط تلقائياً → WebP</span>
          </div>
        </div>
      </div>

      {/* Size info if uploaded */}
      {isUrl && (
        <div className="flex items-center gap-2 text-xs text-brand-mint-dark font-bold">
          <span>✅</span>
          {/* A migrated image is a file shipped with the site, not an upload —
              saying "on Cloudinary" there sends anyone hunting for it to the
              wrong place. */}
          <span>{value.startsWith('http') ? 'مرفوعة على Cloudinary' : 'صورة من ملفات الموقع'}</span>
          <a href={value} target="_blank" rel="noopener noreferrer"
            className="text-fuchsia hover:underline">عرض ↗</a>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  )
}
