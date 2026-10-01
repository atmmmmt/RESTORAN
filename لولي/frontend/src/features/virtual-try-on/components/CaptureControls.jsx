import { motion, AnimatePresence } from 'framer-motion'
import { Camera, SwitchCamera, RefreshCw, Download, Share2, X, ShoppingBag } from 'lucide-react'

/**
 * Bottom control bar, plus the review sheet shown after a capture.
 *
 * A captured frame stays in memory as a data URL and is only written to the
 * device when the customer presses Save — nothing is uploaded, and nothing
 * is persisted without that press.
 */
export default function CaptureControls({
  t, theme,
  onCapture, onSwitchCamera, onReset,
  canSwitch = false,
  allowCapture = true,
  capturedPhoto = null,
  onSavePhoto, onSharePhoto, onDiscardPhoto,
  canShare = false,
}) {
  return (
    <>
      <div className="flex items-center justify-center gap-6 pb-2">
        <button onClick={onReset} aria-label={t('resetPosition')} title={t('resetPosition')}
          className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur transition-transform active:scale-90"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
          <RefreshCw size={19} />
        </button>

        {allowCapture && (
          <button onClick={onCapture} aria-label={t('capture')}
            className="w-[68px] h-[68px] rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{ background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.35)' }}>
            <span className="w-[58px] h-[58px] rounded-full flex items-center justify-center"
              style={{ border: `3px solid ${theme.primary}` }}>
              <Camera size={24} style={{ color: theme.primary }} />
            </span>
          </button>
        )}

        <button onClick={onSwitchCamera} disabled={!canSwitch}
          aria-label={t('switchCamera')} title={t('switchCamera')}
          className="w-12 h-12 rounded-full flex items-center justify-center backdrop-blur transition-transform active:scale-90 disabled:opacity-35"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
          <SwitchCamera size={19} />
        </button>
      </div>

      {/* Review sheet — the only place a photo can leave the session. */}
      <AnimatePresence>
        {capturedPhoto && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center p-5"
            style={{ background: 'rgba(0,0,0,0.88)' }}
          >
            <motion.img
              initial={{ scale: 0.94 }} animate={{ scale: 1 }}
              src={capturedPhoto} alt=""
              className="max-w-full max-h-[60vh] object-contain"
              style={{ borderRadius: theme.radius }}
            />

            <p className="text-xs font-medium text-center mt-4 mb-5 max-w-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {t('photoConsent')}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button onClick={onSavePhoto}
                className="flex items-center gap-2 px-5 py-3 font-black text-sm transition-transform active:scale-95"
                style={{ background: theme.primary, color: theme.onPrimary, borderRadius: '9999px' }}>
                {t('savePhoto')} <Download size={16} />
              </button>

              {canShare && (
                <button onClick={onSharePhoto}
                  className="flex items-center gap-2 px-5 py-3 font-bold text-sm transition-transform active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: '9999px' }}>
                  {t('sharePhoto')} <Share2 size={16} />
                </button>
              )}

              <button onClick={onDiscardPhoto}
                className="flex items-center gap-2 px-5 py-3 font-bold text-sm transition-transform active:scale-95"
                style={{ background: 'transparent', color: 'rgba(255,255,255,0.75)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: '9999px' }}>
                {t('discardPhoto')} <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
