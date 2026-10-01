import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingBag, Grid3x3, Loader2, AlertTriangle, Box } from 'lucide-react'

import { useCamera } from '../hooks/useCamera'
import { resolveExperience, getDeviceSupport } from '../utils/deviceSupport'
import { resolveTheme, resolveDirection, resolveLocale } from '../config/storeConfig'
import { createTranslator } from '../config/i18n'
import { vtoAnalytics, createSessionTimer } from '../services/analytics'
import CameraPermissionScreen from './CameraPermissionScreen'
import CaptureControls from './CaptureControls'

/* Heavy surfaces are split so opening the modal on a 3D-only product never
   pulls in the tracking stack, and vice versa. */
const TrackingCanvas   = lazy(() => import('./TrackingCanvas'))
const Product3DViewer  = lazy(() => import('./Product3DViewer'))
const ARSpaceViewer    = lazy(() => import('./ARSpaceViewer'))

/**
 * Full-screen try-on experience.
 *
 * Owns the decision of *which* experience to show, walking the fallback
 * order from the spec: live try-on → environment AR → 3D viewer → images.
 * Every exit path stops the camera and disposes the scene.
 */
export default function VirtualTryOnModal({
  open,
  onClose,
  product,
  config,
  storeConfig,
  onAddToCart,
  onChooseAnother,
  formatPrice,
}) {
  const theme = useMemo(() => resolveTheme(storeConfig?.themeMode), [storeConfig?.themeMode])
  const dir = useMemo(resolveDirection, [])
  const t = useMemo(() => createTranslator(resolveLocale()), [])
  const device = useMemo(getDeviceSupport, [])

  const resolved = useMemo(() => resolveExperience(config), [config])

  const [stage, setStage] = useState('permission')   // permission|live|space|viewer|error
  const [errorText, setErrorText] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [starting, setStarting] = useState(false)

  const rendererRef = useRef(null)
  const timerRef = useRef(null)

  const camera = useCamera()

  /* Only a body try-on needs the permission gate; a 3D or space viewer has
     nothing to ask for, so it opens straight into content. */
  useEffect(() => {
    if (!open) return

    timerRef.current = createSessionTimer()
    vtoAnalytics.experienceResolved(resolved.experience, resolved.reason)

    if (resolved.experience === 'live') setStage('permission')
    else if (resolved.experience === 'space-ar') setStage('space')
    else if (resolved.experience === 'viewer-3d') setStage('viewer')
    else { setStage('error'); setErrorText(t('noModel')) }
  }, [open, resolved, t])

  /* Teardown on close: stop the camera, drop the frame, report duration. */
  useEffect(() => {
    if (open) return
    camera.stop()
    setPhoto(null)
    setStarting(false)
    rendererRef.current = null
    if (timerRef.current) {
      vtoAnalytics.sessionEnded(product?._id, timerRef.current.elapsedSeconds(), resolved.experience)
      timerRef.current = null
    }
  }, [open, camera, product?._id, resolved.experience])

  /* Escape closes, and the body must not scroll behind a full-screen sheet. */
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const handleAllowCamera = useCallback(async () => {
    setStarting(true)
    const result = await camera.start('user')
    setStarting(false)

    if (result.ok) {
      vtoAnalytics.permissionAccepted(product?._id)
      setStage('live')
    } else {
      vtoAnalytics.permissionRejected(product?._id, result.code)
      // A refusal isn't a dead end — the 3D viewer still works.
      if (result.code !== 'denied') {
        setStage('viewer')
      }
    }
  }, [camera, product?._id])

  const handleTrackingError = useCallback(reason => {
    vtoAnalytics.trackingFailed(product?._id, config?.type, String(reason))
    // Never strand the customer on a broken tracker — drop a rung.
    camera.stop()
    setStage('viewer')
  }, [camera, config?.type, product?._id])

  const handleCapture = useCallback(() => {
    const dataUrl = camera.captureFrame(document.querySelector('[data-vto-canvas]'))
    if (dataUrl) {
      setPhoto(dataUrl)
      vtoAnalytics.photoCaptured(product?._id)
    }
  }, [camera, product?._id])

  const savePhoto = useCallback(() => {
    if (!photo) return
    const a = document.createElement('a')
    a.href = photo
    a.download = `${product?.name || 'try-on'}-${Date.now()}.jpg`
    a.click()
    setPhoto(null)
  }, [photo, product?.name])

  const sharePhoto = useCallback(async () => {
    if (!photo || !navigator.share) return
    try {
      const blob = await (await fetch(photo)).blob()
      const file = new File([blob], `${product?.name || 'try-on'}.jpg`, { type: 'image/jpeg' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: product?.name })
      }
    } catch { /* user dismissed the share sheet */ }
    setPhoto(null)
  }, [photo, product?.name])

  const handleAddToCart = useCallback(() => {
    vtoAnalytics.addedToCart(product?._id, resolved.experience)
    onAddToCart?.(product)
  }, [onAddToCart, product, resolved.experience])

  if (!open) return null

  const canShare = !!navigator.share && storeConfig?.allowSharing !== false

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        dir={dir}
        role="dialog"
        aria-modal="true"
        aria-label={product?.name}
        className="fixed inset-0 z-[100] flex flex-col"
        style={{ background: stage === 'live' ? '#000' : theme.surface, fontFamily: theme.fontBody }}
      >
        {/* ── Header ── */}
        <div className="relative z-20 flex items-start justify-between gap-3 px-4 pt-4 pb-3"
          style={{
            background: stage === 'live'
              ? 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)'
              : 'transparent',
          }}>
          <button onClick={onClose} aria-label={t('close')}
            className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur transition-transform active:scale-90 flex-shrink-0"
            style={{
              background: stage === 'live' ? 'rgba(255,255,255,0.15)' : `${theme.primary}18`,
              color: stage === 'live' ? '#fff' : theme.onSurface,
            }}>
            <X size={19} />
          </button>

          <div className="flex-1 text-center min-w-0">
            <div className="font-black text-base truncate"
              style={{
                color: stage === 'live' ? '#fff' : theme.onSurface,
                fontFamily: theme.fontHeading,
              }}>
              {product?.name}
            </div>
            {product?.price != null && (
              <div className="text-sm font-bold"
                style={{ color: stage === 'live' ? 'rgba(255,255,255,0.8)' : theme.primary }}>
                {formatPrice ? formatPrice(product.price) : product.price}
              </div>
            )}
          </div>

          <div className="w-10 flex-shrink-0" />
        </div>

        {/* ── Body ── */}
        <div className="relative flex-1 min-h-0">
          <Suspense fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 size={26} className="animate-spin" style={{ color: theme.primary }} />
              <span className="text-xs font-bold" style={{ color: theme.muted }}>{t('loadingEngine')}</span>
            </div>
          }>
            {stage === 'permission' && (
              <CameraPermissionScreen
                t={t} theme={theme}
                privacyMessage={storeConfig?.cameraPrivacyMessage}
                onAllow={handleAllowCamera}
                onCancel={() => setStage('viewer')}
                errorCode={camera.errorCode}
                busy={starting}
              />
            )}

            {stage === 'live' && (
              <TrackingCanvas
                t={t} theme={theme}
                type={config.type}
                calibration={config}
                videoRef={camera.videoRef}
                onTrackingReady={kind => vtoAnalytics.trackingStarted(product?._id, kind)}
                onTrackingError={handleTrackingError}
                onRendererReady={r => { rendererRef.current = r }}
              />
            )}

            {stage === 'space' && (
              <ARSpaceViewer
                t={t} theme={theme}
                src={config.model3DUrl}
                iosSrc={config.iosModelUrl}
                alt={product?.name}
                placement={config.placement}
                className="absolute inset-0"
              />
            )}

            {stage === 'viewer' && (
              <Product3DViewer
                t={t} theme={theme}
                src={config.model3DUrl}
                iosSrc={config.iosModelUrl}
                poster={config.previewImageUrl}
                alt={product?.name}
                className="absolute inset-0"
                onError={() => { setStage('error'); setErrorText(t('loadFailed')) }}
              />
            )}

            {stage === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                {config?.previewImageUrl ? (
                  <img src={config.previewImageUrl} alt={product?.name}
                    className="max-h-[45vh] object-contain" style={{ borderRadius: theme.radius }} />
                ) : (
                  <Box size={40} style={{ color: theme.muted }} />
                )}
                <AlertTriangle size={22} style={{ color: theme.primary }} />
                <p className="font-black text-sm" style={{ color: theme.onSurface }}>
                  {errorText || t('deviceUnsupported')}
                </p>
                <p className="text-xs font-medium" style={{ color: theme.muted }}>{t('view3DInstead')}</p>
              </div>
            )}
          </Suspense>

          {/* Reason banner — tells the customer why they got a fallback. */}
          {stage === 'viewer' && resolved.experience !== 'viewer-3d' && (
            <div className="absolute top-2 inset-x-0 flex justify-center px-4 pointer-events-none">
              <span className="text-[11px] font-bold px-3 py-1.5 rounded-full text-center"
                style={{ background: `${theme.primary}18`, color: theme.onSurface }}>
                {resolved.reason === 'low-performance' ? t('lowPerformance') : t('deviceUnsupported')}
              </span>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="relative z-20 px-4 pb-5 pt-3"
          style={{
            background: stage === 'live'
              ? 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)'
              : 'transparent',
          }}>
          {stage === 'live' && (
            <CaptureControls
              t={t} theme={theme}
              onCapture={handleCapture}
              onSwitchCamera={camera.switchCamera}
              onReset={() => rendererRef.current?.resetManual?.()}
              canSwitch={camera.canSwitch}
              allowCapture={storeConfig?.allowCustomerCapture !== false}
              capturedPhoto={photo}
              onSavePhoto={savePhoto}
              onSharePhoto={sharePhoto}
              onDiscardPhoto={() => setPhoto(null)}
              canShare={canShare}
            />
          )}

          <div className="flex items-center gap-3 mt-3">
            {storeConfig?.showAddToCartInsideViewer !== false && onAddToCart && (
              <button onClick={handleAddToCart}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 font-black text-sm transition-transform active:scale-95"
                style={{
                  background: theme.primary, color: theme.onPrimary,
                  borderRadius: '9999px', fontFamily: theme.fontHeading,
                }}>
                {t('addToCart')} <ShoppingBag size={17} />
              </button>
            )}

            {onChooseAnother && (
              <button onClick={onChooseAnother}
                className="flex items-center justify-center gap-2 px-5 py-3.5 font-bold text-sm transition-transform active:scale-95"
                style={{
                  background: stage === 'live' ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: stage === 'live' ? '#fff' : theme.muted,
                  border: stage === 'live' ? 'none' : `1.5px solid ${theme.accent}`,
                  borderRadius: '9999px',
                }}>
                <Grid3x3 size={16} />
                <span className="hidden sm:inline">{t('chooseAnother')}</span>
              </button>
            )}
          </div>

          <p className="text-[10px] font-medium text-center mt-3"
            style={{ color: stage === 'live' ? 'rgba(255,255,255,0.55)' : theme.muted }}>
            {t('privacyNotice')}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
