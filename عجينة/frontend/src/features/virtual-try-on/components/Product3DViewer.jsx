import { useEffect, useRef, useState } from 'react'
import { Loader2, RotateCw, Maximize2, Minimize2, RefreshCw, AlertTriangle } from 'lucide-react'

/**
 * Standard 360° viewer — the fallback every product with a model can show,
 * and the primary experience on any device without camera AR.
 *
 * Built on <model-viewer>, imported dynamically so the ~300 KB web component
 * only arrives when someone actually opens a viewer.
 */

let modelViewerPromise = null
function loadModelViewer() {
  if (!modelViewerPromise) {
    modelViewerPromise = import('@google/model-viewer').catch(err => {
      modelViewerPromise = null   // let a later attempt retry
      throw err
    })
  }
  return modelViewerPromise
}

export default function Product3DViewer({
  src,
  iosSrc,
  alt = '',
  poster,
  t,
  theme,
  autoRotate = true,
  allowFullscreen = true,
  hotspots = [],
  className = '',
  onLoad,
  onError,
}) {
  const hostRef = useRef(null)
  const viewerRef = useRef(null)

  const [libState, setLibState] = useState('loading')   // loading|ready|error
  const [modelState, setModelState] = useState('loading')
  const [progress, setProgress] = useState(0)
  const [rotating, setRotating] = useState(autoRotate)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    let alive = true
    loadModelViewer()
      .then(() => { if (alive) setLibState('ready') })
      .catch(() => { if (alive) { setLibState('error'); onError?.('library') } })
    return () => { alive = false }
  }, [onError])

  /* <model-viewer> is a custom element, so its events are bound imperatively
     rather than through React props. */
  useEffect(() => {
    const el = viewerRef.current
    if (!el || libState !== 'ready') return

    const onProgress = e => {
      const pct = Math.round((e.detail?.totalProgress ?? 0) * 100)
      setProgress(pct)
      if (pct >= 100) setModelState('ready')
    }
    const onModelLoad = () => { setModelState('ready'); onLoad?.() }
    const onModelError = () => { setModelState('error'); onError?.('model') }

    el.addEventListener('progress', onProgress)
    el.addEventListener('load', onModelLoad)
    el.addEventListener('error', onModelError)
    return () => {
      el.removeEventListener('progress', onProgress)
      el.removeEventListener('load', onModelLoad)
      el.removeEventListener('error', onModelError)
    }
  }, [libState, onLoad, onError])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleRotate = () => {
    const el = viewerRef.current
    if (!el) return
    const next = !rotating
    setRotating(next)
    if (next) el.setAttribute('auto-rotate', '')
    else el.removeAttribute('auto-rotate')
  }

  const resetCamera = () => viewerRef.current?.resetTurntableRotation?.()

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) hostRef.current?.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.().catch(() => {})
  }

  if (libState === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-8 ${className}`}
        style={{ background: theme?.surface, color: theme?.onSurface, borderRadius: theme?.radius }}>
        <AlertTriangle size={28} style={{ color: theme?.primary }} />
        <p className="font-bold text-sm text-center">{t('loadFailed')}</p>
      </div>
    )
  }

  const busy = libState === 'loading' || modelState === 'loading'

  return (
    <div ref={hostRef} className={`relative overflow-hidden ${className}`}
      style={{ background: theme?.surface, borderRadius: theme?.radius }}>

      {libState === 'ready' && (
        <model-viewer
          ref={viewerRef}
          src={src}
          ios-src={iosSrc || undefined}
          alt={alt}
          poster={poster || undefined}
          camera-controls=""
          touch-action="pan-y"
          {...(rotating ? { 'auto-rotate': '' } : {})}
          auto-rotate-delay="1200"
          rotation-per-second="18deg"
          shadow-intensity="1"
          exposure="1"
          environment-image="neutral"
          loading="lazy"
          reveal="auto"
          style={{ width: '100%', height: '100%', backgroundColor: 'transparent', '--poster-color': 'transparent' }}
        >
          {hotspots.map(h => (
            <button key={h.id} className="vto-hotspot" slot={`hotspot-${h.id}`}
              data-position={h.position} data-normal={h.normal}
              style={{
                background: theme?.primary, color: theme?.onPrimary,
                border: 'none', borderRadius: '9999px', padding: '0.35rem 0.7rem',
                fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer',
              }}>
              {h.label}
            </button>
          ))}
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
          {progress > 0 && progress < 100 && (
            <div className="w-32 h-1 rounded-full overflow-hidden" style={{ background: theme?.accent }}>
              <div className="h-full transition-all duration-200"
                style={{ width: `${progress}%`, background: theme?.primary }} />
            </div>
          )}
        </div>
      )}

      {modelState === 'ready' && (
        <>
          <div className="absolute top-3 left-3 flex gap-2">
            <button onClick={toggleRotate} aria-label={t('autoRotate')} title={t('autoRotate')}
              className="w-9 h-9 rounded-full flex items-center justify-center backdrop-blur transition-opacity hover:opacity-80"
              style={{ background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
              <RotateCw size={15} className={rotating ? 'animate-spin' : ''} style={{ animationDuration: '3s' }} />
            </button>
            <button onClick={resetCamera} aria-label={t('resetPosition')} title={t('resetPosition')}
              className="w-9 h-9 rounded-full flex items-center justify-center backdrop-blur transition-opacity hover:opacity-80"
              style={{ background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
              <RefreshCw size={15} />
            </button>
            {allowFullscreen && (
              <button onClick={toggleFullscreen} aria-label={t(fullscreen ? 'exitFullscreen' : 'fullscreen')}
                className="w-9 h-9 rounded-full flex items-center justify-center backdrop-blur transition-opacity hover:opacity-80"
                style={{ background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
                {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            )}
          </div>

          <div className="absolute bottom-3 inset-x-0 text-center pointer-events-none">
            <span className="text-[11px] font-bold px-3 py-1 rounded-full backdrop-blur"
              style={{ background: 'rgba(0,0,0,0.3)', color: '#fff' }}>
              {t('dragToRotate')}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
