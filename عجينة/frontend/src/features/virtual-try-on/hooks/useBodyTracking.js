import { useCallback, useEffect, useRef, useState } from 'react'
import { TRACKER_BY_TYPE } from '../types/virtualTryOn.types'

/**
 * Drives the tracker + renderer loop for body-worn products.
 *
 * One hook covers hand, face and pose because the shape is identical — only
 * the module that gets dynamically imported differs. That import is what
 * keeps MediaPipe out of the bundle for stores that never use it.
 */
export function useBodyTracking({
  type, videoRef, calibration, enabled = false,
  onSceneReady, lowPerformance = false,
}) {
  const trackerRef = useRef(null)
  const rendererRef = useRef(null)
  const loopRef = useRef(null)
  const sceneApiRef = useRef(null)

  const [status, setStatus] = useState('idle')   // idle|loading|tracking|error
  const [quality, setQuality] = useState('none')
  const [hint, setHint] = useState('detecting')
  const [error, setError] = useState(null)

  const optionsRef = useRef({
    finger: 'ring',
    targetHand: calibration?.targetHand || 'both',
    side: calibration?.targetSide || 'both',
  })

  const setOptions = useCallback(next => {
    optionsRef.current = { ...optionsRef.current, ...next }
    trackerRef.current?.reset()
  }, [])

  const stop = useCallback(() => {
    if (loopRef.current) { cancelAnimationFrame(loopRef.current); loopRef.current = null }
    trackerRef.current?.dispose()
    trackerRef.current = null
    rendererRef.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(async sceneApi => {
    if (!type || !videoRef.current) return false

    setStatus('loading')
    setError(null)
    sceneApiRef.current = sceneApi

    const trackerKind = TRACKER_BY_TYPE[type]
    if (!trackerKind) { setError('نوع غير مدعوم'); setStatus('error'); return false }

    try {
      /* One dynamic import per tracker kind — a ring product downloads the
         hand model only, never the face or pose bundles. */
      const trackerModule = trackerKind === 'hand' ? await import('../trackers/handTracker')
        : trackerKind === 'face' ? await import('../trackers/faceTracker')
          : await import('../trackers/poseTracker')

      const factory = trackerModule.createHandTracker
        || trackerModule.createFaceTracker
        || trackerModule.createPoseTracker

      const tracker = factory({
        smoothing: calibration?.trackingSmoothing ?? 0.5,
        lowPerformance,
      })
      await tracker.init()
      trackerRef.current = tracker

      // Same idea for renderers: only the one this product needs.
      const rendererDeps = {
        THREE: sceneApi.THREE,
        object: sceneApi.object,
        calibration,
        viewport: { aspect: sceneApi.aspect ?? 1, depth: 1.6, mirrored: false },
      }

      let renderer
      switch (type) {
        case 'ring':
          renderer = (await import('../renderers/ringRenderer')).createRingRenderer(rendererDeps); break
        case 'bracelet':
        case 'watch':
          renderer = (await import('../renderers/braceletRenderer')).createBraceletRenderer(rendererDeps, type); break
        case 'glasses':
          renderer = (await import('../renderers/glassesRenderer')).createGlassesRenderer(rendererDeps); break
        case 'earrings': {
          const mod = await import('../renderers/earringsRenderer')
          renderer = mod.createEarringsRenderer(rendererDeps)
          // The earrings renderer swaps in its own group, so re-parent it.
          sceneApi.scene.remove(sceneApi.object)
          sceneApi.scene.add(renderer.object)
          break
        }
        case 'necklace':
        case 'clothing':
          renderer = (await import('../renderers/necklaceRenderer')).createNecklaceRenderer(rendererDeps); break
        default:
          throw new Error('نوع غير مدعوم')
      }

      rendererRef.current = renderer
      renderer.hide()
      onSceneReady?.(renderer)

      setStatus('tracking')

      const loop = () => {
        loopRef.current = requestAnimationFrame(loop)

        const video = videoRef.current
        if (!video || !trackerRef.current || !rendererRef.current) return

        const opts = optionsRef.current
        const detectArgs = trackerKind === 'hand'
          ? { mode: type, finger: opts.finger, targetHand: opts.targetHand, mirrored: true }
          : trackerKind === 'face'
            ? { mode: type, side: opts.side }
            : { mode: type }

        const result = trackerRef.current.detect(video, detectArgs)

        // null means the same video frame — skip without touching the scene.
        if (result) {
          rendererRef.current.update(result)
          setQuality(result.quality || 'none')
          setHint(result.hint || 'detecting')
        }

        sceneApiRef.current?.render?.()
      }
      loop()

      return true
    } catch (err) {
      setError(err.message || 'تعذّر بدء التتبّع')
      setStatus('error')
      return false
    }
  }, [type, videoRef, calibration, lowPerformance, onSceneReady])

  useEffect(() => {
    if (!enabled) stop()
    return stop
  }, [enabled, stop])

  return {
    status, quality, hint, error,
    start, stop, setOptions,
    renderer: rendererRef,
    resetManual: () => rendererRef.current?.resetManual(),
    adjust: delta => rendererRef.current?.adjust(delta),
  }
}
