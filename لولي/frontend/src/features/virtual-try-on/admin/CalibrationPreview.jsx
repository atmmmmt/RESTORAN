import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Camera, CameraOff, Move, RotateCw, Maximize } from 'lucide-react'
import { loadThree, loadModel, normalizeModel, disposeObject } from '../utils/modelLoader'
import { degToRad } from '../utils/landmarkMath'
import { requestCamera, stopStream } from '../utils/cameraPermissions'

/**
 * Interactive calibration canvas for the admin dashboard.
 *
 * Shows the model live against either a plain backdrop or the admin's own
 * camera, and lets them drag / scroll / rotate it directly instead of
 * guessing numbers. Every gesture writes back through `onChange`, so the
 * numeric fields and this canvas are always two views of one state.
 */
export default function CalibrationPreview({ modelUrl, calibration, onChange, height = 380 }) {
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const videoRef = useRef(null)

  const sceneRef = useRef(null)
  const objectRef = useRef(null)
  const frameRef = useRef(null)
  const streamRef = useRef(null)

  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [mode, setMode] = useState('move')   // move | rotate | scale

  // Read through a ref so the render loop always sees the latest values
  // without being torn down and rebuilt on every slider tick.
  const calibRef = useRef(calibration)
  useEffect(() => { calibRef.current = calibration }, [calibration])

  /* ── Build the scene once per model ── */
  useEffect(() => {
    if (!modelUrl || !canvasRef.current) return
    let cancelled = false

    ;(async () => {
      setStatus('loading')
      setError(null)
      try {
        const THREE = await loadThree()
        const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.outputColorSpace = THREE.SRGBColorSpace

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100)
        camera.position.set(0, 0, 3)

        scene.add(new THREE.AmbientLight(0xffffff, 1.5))
        const key = new THREE.DirectionalLight(0xffffff, 1.5)
        key.position.set(2, 3, 4)
        scene.add(key)

        const { scene: raw } = await loadModel(modelUrl)
        const { object } = await normalizeModel(raw)
        scene.add(object)

        if (cancelled) { disposeObject(object); renderer.dispose(); return }

        sceneRef.current = { THREE, scene, camera, renderer }
        objectRef.current = object
        setStatus('ready')

        const resize = () => {
          const el = hostRef.current
          if (!el) return
          const w = el.clientWidth
          const h = el.clientHeight
          renderer.setSize(w, h, false)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(hostRef.current)

        const loop = () => {
          frameRef.current = requestAnimationFrame(loop)
          const c = calibRef.current || {}
          const p = c.positionOffset || { x: 0, y: 0, z: 0 }
          const r = c.rotationOffset || { x: 0, y: 0, z: 0 }

          object.position.set(p.x, p.y, p.z)
          object.rotation.set(degToRad(r.x), degToRad(r.y), degToRad(r.z))
          object.scale.setScalar(c.scale ?? 1)

          renderer.render(scene, camera)
        }
        loop()

        return () => ro.disconnect()
      } catch (err) {
        if (!cancelled) { setError(err.message); setStatus('error') }
      }
    })()

    return () => {
      cancelled = true
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      if (objectRef.current) disposeObject(objectRef.current)
      if (sceneRef.current?.renderer) {
        sceneRef.current.renderer.dispose()
        sceneRef.current.renderer.forceContextLoss?.()
      }
      sceneRef.current = null
      objectRef.current = null
    }
  }, [modelUrl])

  /* Release the admin's camera whenever the preview closes. */
  useEffect(() => () => stopStream(streamRef.current), [])

  const toggleCamera = async () => {
    if (cameraOn) {
      stopStream(streamRef.current)
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      setCameraOn(false)
      return
    }
    const res = await requestCamera({ facingMode: 'user' })
    if (!res.ok) { setError(res.code); return }
    streamRef.current = res.stream
    if (videoRef.current) {
      videoRef.current.srcObject = res.stream
      await videoRef.current.play().catch(() => {})
    }
    setCameraOn(true)
  }

  /* ── Direct manipulation ── */
  const drag = useRef(null)

  const onPointerDown = e => {
    if (status !== 'ready') return
    drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = e => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }

    const c = calibRef.current
    if (mode === 'move') {
      // Screen pixels → world units at the preview's depth.
      const k = 0.004
      onChange({
        positionOffset: {
          ...c.positionOffset,
          x: +(c.positionOffset.x + dx * k).toFixed(3),
          y: +(c.positionOffset.y - dy * k).toFixed(3),
        },
      })
    } else if (mode === 'rotate') {
      onChange({
        rotationOffset: {
          ...c.rotationOffset,
          y: Math.round(c.rotationOffset.y + dx * 0.6),
          x: Math.round(c.rotationOffset.x + dy * 0.6),
        },
      })
    } else {
      const next = Math.max(0.05, +(c.scale + dx * 0.006).toFixed(3))
      onChange({ scale: next })
    }
  }

  const onPointerUp = e => {
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  const onWheel = e => {
    if (status !== 'ready') return
    e.preventDefault()
    const c = calibRef.current
    const next = Math.max(0.05, +(c.scale * (e.deltaY > 0 ? 0.95 : 1.05)).toFixed(3))
    onChange({ scale: next })
  }

  const MODES = [
    { key: 'move', Icon: Move, label: 'تحريك' },
    { key: 'rotate', Icon: RotateCw, label: 'تدوير' },
    { key: 'scale', Icon: Maximize, label: 'تحجيم' },
  ]

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-brand-border bg-brand-bg">
      <div ref={hostRef} className="relative" style={{ height }}>
        <video ref={videoRef} playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)', display: cameraOn ? 'block' : 'none' }} />

        {!cameraOn && (
          <div className="absolute inset-0"
            style={{ background: 'repeating-conic-gradient(#EDE4D8 0% 25%, #F7F1E8 0% 50%) 50%/24px 24px' }} />
        )}

        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
          style={{ transform: cameraOn ? 'scaleX(-1)' : 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        />

        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70">
            <Loader2 size={22} className="animate-spin text-fuchsia" />
            <span className="text-xs font-bold text-brand-gray">جاري تحميل النموذج…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center bg-white/80">
            <span className="text-xs font-bold text-red-500">{error || 'تعذّر تحميل النموذج'}</span>
          </div>
        )}

        {/* Gesture mode picker */}
        <div className="absolute top-2 right-2 flex gap-1">
          {MODES.map(({ key, Icon, label }) => (
            <button key={key} type="button" onClick={() => setMode(key)} title={label}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                mode === key ? 'bg-fuchsia text-white' : 'bg-white/85 text-brand-gray hover:bg-white'
              }`}>
              <Icon size={14} />
            </button>
          ))}
        </div>

        <button type="button" onClick={toggleCamera} title="معاينة بالكاميرا"
          className="absolute top-2 left-2 w-8 h-8 rounded-lg flex items-center justify-center bg-white/85 hover:bg-white transition-colors">
          {cameraOn ? <CameraOff size={14} className="text-red-500" /> : <Camera size={14} className="text-brand-gray" />}
        </button>
      </div>

      <div className="px-3 py-2 text-[11px] font-bold text-brand-gray-light bg-white border-t border-brand-border">
        اسحب داخل المعاينة للتعديل · عجلة الفأرة للتكبير · فعّل الكاميرا لمعاينة حية
      </div>
    </div>
  )
}
