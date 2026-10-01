import { useEffect, useRef, useState } from 'react'
import { Loader2, Move3d, AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * Environment AR — place the product on a real surface.
 *
 * <model-viewer> brokers this to whichever native pipeline the device has:
 * WebXR where available, Scene Viewer on Android, AR Quick Look on iOS. We
 * don't reimplement plane detection; the OS does it far better.
 */

let modelViewerPromise = null
const loadModelViewer = () => {
  if (!modelViewerPromise) {
    modelViewerPromise = import('@google/model-viewer').catch(err => {
      modelViewerPromise = null
      throw err
    })
  }
  return modelViewerPromise
}

export default function ARSpaceViewer({
  src,
  iosSrc,
  alt = '',
  t,
  theme,
  placement = 'floor',
  allowScaling = true,
  className = '',
  onArStatus,
}) {
  const viewerRef = useRef(null)
  const [libState, setLibState] = useState('loading')
  const [modelState, setModelState] = useState('loading')
  const [progress, setProgress] = useState(0)
  const [arAvailable, setArAvailable] = useState(false)

  useEffect(() => {
    let alive = true
    loadModelViewer()
      .then(() => alive && setLibState('ready'))
      .catch(() => alive && setLibState('error'))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const el = viewerRef.current
    if (!el || libState !== 'ready') return

    const onProgress = e => {
      const pct = Math.round((e.detail?.totalProgress ?? 0) * 100)
      setProgress(pct)
      if (pct >= 100) setModelState('ready')
    }
    const onLoad = () => {
      setModelState('ready')
      // canActivateAR is only meaningful once the model has loaded.
      setArAvailable(!!el.canActivateAR)
    }
    const onErr = () => setModelState('error')
    const onArChange = e => onArStatus?.(e.detail?.status)

    el.addEventListener('progress', onProgress)
    el.addEventListener('load', onLoad)
    el.addEventListener('error', onErr)
    el.addEventListener('ar-status', onArChange)
    return () => {
      el.removeEventListener('progress', onProgress)
      el.removeEventListener('load', onLoad)
      el.removeEventListener('error', onErr)
      el.removeEventListener('ar-status', onArChange)
    }
  }, [libState, onArStatus])

  const activateAR = () => {
    try { viewerRef.current?.activateAR?.() } catch { /* device refused */ }
  }

  const resetView = () => viewerRef.current?.resetTurntableRotation?.()

  if (libState === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-8 ${className}`}
        style={{ background: theme?.surface, color: theme?.onSurface, borderRadius: theme?.radius }}>
        <AlertTriangle size={28} style={{ color: theme?.primary }} />
        <p className="font-bold text-sm">{t('loadFailed')}</p>
      </div>
    )
  }

  const busy = libState === 'loading' || modelState === 'loading'

  return (
    <div className={`relative overflow-hidden ${className}`}
      style={{ background: theme?.surface, borderRadius: theme?.radius }}>

      {libState === 'ready' && (
        <model-viewer
          ref={viewerRef}
          src={src}
          ios-src={iosSrc || undefined}
          alt={alt}
          ar=""
          /* Order matters — the first pipeline the device supports wins. */
          ar-modes="webxr scene-viewer quick-look"
          ar-placement={placement}
          {...(allowScaling ? {} : { 'ar-scale': 'fixed' })}
          camera-controls=""
          touch-action="pan-y"
          shadow-intensity="1"
          exposure="1"
          environment-image="neutral"
          loading="lazy"
          style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
        >
          {/* The stock AR button is replaced by our own, themed one. */}
          <button slot="ar-button" style={{ display: 'none' }} />
          <div slot="progress-bar" />
        </model-viewer>
      )}

      {busy && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
          style={{ background: theme?.surface }}>
          <Loader2 size={26} className="animate-spin" style={{ color: theme?.primary }} />
          <div className="text-xs font-bold" style={{ color: theme?.muted }}>
            {t('loadingModel')}{progress > 0 && progress < 100 ? ` ${progress}%` : ''}
          </div>
        </div>
      )}

      {modelState === 'ready' && (
        <>
          <button onClick={resetView} aria-label={t('resetPosition')}
            className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur transition-opacity hover:opacity-80"
            style={{ background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
            <RefreshCw size={15} />
          </button>

          {arAvailable && (
            <div className="absolute bottom-4 inset-x-0 flex justify-center px-4">
              <button onClick={activateAR}
                className="flex items-center gap-2 px-6 py-3 font-black text-sm shadow-lg transition-transform active:scale-95"
                style={{
                  background: theme?.primary, color: theme?.onPrimary,
                  borderRadius: '9999px', fontFamily: theme?.fontHeading,
                }}>
                {t('placeInRoom')} <Move3d size={17} />
              </button>
            </div>
          )}

          {!arAvailable && (
            <div className="absolute bottom-3 inset-x-0 text-center px-4 pointer-events-none">
              <span className="text-[11px] font-bold px-3 py-1 rounded-full backdrop-blur"
                style={{ background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
                {t('dragToRotate')}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
