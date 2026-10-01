import { motion } from 'framer-motion'
import { Camera, ShieldCheck, X, AlertTriangle, Settings } from 'lucide-react'

/**
 * The screen shown before any camera is opened.
 *
 * The spec is explicit and the browser agrees: explain first, then request
 * only on a deliberate press. Nothing here touches getUserMedia — pressing
 * the button is what calls it, one level up.
 */
export default function CameraPermissionScreen({
  t, theme, privacyMessage,
  onAllow, onCancel,
  errorCode = null,
  busy = false,
}) {
  const denied = errorCode === 'denied'
  const insecure = errorCode === 'insecure' || errorCode === 'unsupported'
  const noCamera = errorCode === 'no-camera'
  const inUse = errorCode === 'in-use'

  const errorText = denied ? t('permissionDenied')
    : insecure ? t('permissionInsecure')
      : noCamera ? t('noCameraFound')
        : inUse ? t('cameraInUse')
          : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center text-center px-6 py-10 h-full"
      style={{ color: theme.onSurface, fontFamily: theme.fontBody }}
    >
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
        style={{ background: `${theme.primary}22` }}>
        <Camera size={34} style={{ color: theme.primary }} />
      </div>

      <h2 className="text-xl font-black mb-3" style={{ fontFamily: theme.fontHeading }}>
        {t('permissionTitle')}
      </h2>

      <p className="text-sm font-medium leading-relaxed max-w-sm mb-5" style={{ color: theme.muted }}>
        {privacyMessage || t('permissionMessage')}
      </p>

      {/* Privacy reassurance stays visible next to the ask, not buried. */}
      <div className="flex items-start gap-2.5 rounded-2xl px-4 py-3 mb-6 max-w-sm text-right"
        style={{ background: `${theme.primary}12`, border: `1px solid ${theme.primary}30` }}>
        <ShieldCheck size={17} style={{ color: theme.primary }} className="flex-shrink-0 mt-0.5" />
        <span className="text-xs font-bold leading-relaxed" style={{ color: theme.onSurface }}>
          {t('privacyNotice')}
        </span>
      </div>

      {errorText && (
        <div className="flex flex-col items-center gap-2 rounded-2xl px-4 py-3 mb-5 max-w-sm"
          style={{ background: 'rgba(192,80,80,0.12)', border: '1px solid rgba(192,80,80,0.3)' }}>
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: '#C05050' }}>
            <AlertTriangle size={15} /> {errorText}
          </div>
          {denied && (
            <div className="flex items-start gap-2 text-xs font-medium leading-relaxed" style={{ color: theme.muted }}>
              <Settings size={13} className="flex-shrink-0 mt-0.5" />
              <span>{t('permissionDeniedHelp')}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        {/* A denied permission can't be re-prompted from JS — the browser
            requires the user to change it in settings, so hide the button. */}
        {!denied && !insecure && !noCamera && (
          <button onClick={onAllow} disabled={busy}
            className="flex-1 py-3.5 font-black text-sm transition-transform active:scale-95 disabled:opacity-60"
            style={{
              background: theme.primary, color: theme.onPrimary,
              borderRadius: '9999px', fontFamily: theme.fontHeading,
            }}>
            {busy ? '…' : t('permissionAllow')}
          </button>
        )}
        <button onClick={onCancel}
          className="flex-1 py-3.5 font-bold text-sm transition-colors"
          style={{
            background: 'transparent', color: theme.muted,
            border: `1.5px solid ${theme.accent}`, borderRadius: '9999px',
          }}>
          {denied ? t('close') : t('permissionCancel')}
        </button>
      </div>
    </motion.div>
  )
}
