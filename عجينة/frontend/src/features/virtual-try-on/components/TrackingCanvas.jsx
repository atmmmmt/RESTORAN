import { useCallback, useEffect, useRef, useState } from 'react'
import CameraFeed from './CameraFeed'
import TrackingStatus from './TrackingStatus'
import { useThreeScene } from '../hooks/useThreeScene'
import { useBodyTracking } from '../hooks/useBodyTracking'
import { TRACKER_BY_TYPE } from '../types/virtualTryOn.types'
import { getDeviceSupport } from '../utils/deviceSupport'

/**
 * Live try-on surface: camera feed + WebGL overlay + tracking loop.
 *
 * Rendered only for body-tracked product types, and only after the customer
 * has granted the camera — so MediaPipe and Three.js are fetched at the last
 * possible moment.
 */
export default function TrackingCanvas({
  t, theme, type, calibration, videoRef,
  onTrackingReady, onTrackingError, onRendererReady,
}) {
  const canvasHostRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const startedRef = useRef(false)

  const device = getDeviceSupport()
  const trackerKind = TRACKER_BY_TYPE[type] || 'hand'

  const scene = useThreeScene({
    modelUrl: calibration?.model3DUrl,
    calibration,
    enabled: true,
  })

  const tracking = useBodyTracking({
    type,
    videoRef,
    calibration,
    enabled: true,
    lowPerformance: device.lowPerformance,
    onSceneReady: onRendererReady,
  })

  const handleResize = useCallback((w, h) => {
    setDimensions({ width: w, height: h })
    scene.resize(w, h)
  }, [scene])

  /* Boot once the video is delivering frames. Starting earlier hands the
     tracker an empty texture and produces a bad first read.
     `scene.init()` resolves with the THREE module it already loaded, so the
     library is never imported twice. */
  useEffect(() => {
    if (startedRef.current) return
    if (!dimensions.width || !dimensions.height) return

    startedRef.current = true
    let cancelled = false

    ;(async () => {
      const built = await scene.init()
      if (!built) { onTrackingError?.('model-failed'); return }
      if (cancelled) return

      scene.resize(dimensions.width, dimensions.height)

      const ok = await tracking.start({
        THREE: built.THREE,
        scene: built.scene,
        camera: built.camera,
        object: built.object,
        aspect: dimensions.width / dimensions.height,
        render: scene.render,
      })

      if (cancelled) return
      if (ok) onTrackingReady?.(trackerKind)
      else onTrackingError?.('init-failed')
    })()

    return () => { cancelled = true }
    // Intentionally keyed on first valid dimensions only — re-running would
    // rebuild the whole scene on every rotation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions.width, dimensions.height])

  useEffect(() => {
    if (scene.status === 'error') onTrackingError?.(scene.error || 'model-failed')
  }, [scene.status, scene.error, onTrackingError])

  const busy = scene.status === 'loading' || tracking.status === 'loading'

  return (
    <div ref={canvasHostRef} className="absolute inset-0">
      <CameraFeed
        ref={videoRef}
        canvasRef={scene.canvasRef}
        mirrored
        onResize={handleResize}
      />

      <div className="absolute inset-x-0 top-20 flex justify-center z-10">
        <TrackingStatus
          t={t}
          quality={tracking.quality}
          hint={tracking.hint}
          trackerKind={trackerKind}
          loading={busy}
        />
      </div>

      {scene.status === 'loading' && scene.progress > 0 && scene.progress < 100 && (
        <div className="absolute inset-x-0 bottom-32 flex justify-center z-10">
          <div className="w-40 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <div className="h-full transition-all duration-200"
              style={{ width: `${scene.progress}%`, background: theme.primary }} />
          </div>
        </div>
      )}
    </div>
  )
}
