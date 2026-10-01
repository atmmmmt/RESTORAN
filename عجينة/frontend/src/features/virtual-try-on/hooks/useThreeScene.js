import { useCallback, useEffect, useRef, useState } from 'react'
import { loadThree, loadModel, normalizeModel, limitTextureSizes, disposeObject } from '../utils/modelLoader'
import { getDeviceSupport } from '../utils/deviceSupport'

/**
 * A transparent Three.js layer sitting over the camera feed.
 *
 * Owns the renderer, camera, lights and the loaded product, and — just as
 * importantly — tears all of it down. Three.js holds GPU memory that the
 * garbage collector cannot reclaim, so every path out of here disposes.
 */
export function useThreeScene({ modelUrl, calibration, enabled = true }) {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const objectRef = useRef(null)
  const frameRef = useRef(null)

  const [status, setStatus] = useState('idle')   // idle|loading|ready|error
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  const dispose = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    if (objectRef.current) {
      disposeObject(objectRef.current)
      objectRef.current = null
    }
    if (rendererRef.current) {
      rendererRef.current.dispose()
      // forceContextLoss frees the GPU context immediately; browsers cap how
      // many live WebGL contexts a page may hold.
      rendererRef.current.forceContextLoss?.()
      rendererRef.current = null
    }
    sceneRef.current = null
    cameraRef.current = null
    setStatus('idle')
  }, [])

  const init = useCallback(async () => {
    if (!canvasRef.current || !modelUrl) return null

    setStatus('loading')
    setProgress(0)
    setError(null)

    try {
      const THREE = await loadThree()
      const device = getDeviceSupport()

      const renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        alpha: true,                  // camera feed shows through
        antialias: !device.lowPerformance,
        powerPreference: device.lowPerformance ? 'low-power' : 'high-performance',
      })
      // Capping DPR is the single biggest win on high-density phones —
      // rendering at native 3x costs 9x the fragments for no visible gain.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, device.lowPerformance ? 1 : 2))
      renderer.setClearColor(0x000000, 0)
      renderer.outputColorSpace = THREE.SRGBColorSpace

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100)
      camera.position.set(0, 0, 2)

      scene.add(new THREE.AmbientLight(0xffffff, 1.4))
      const key = new THREE.DirectionalLight(0xffffff, 1.6)
      key.position.set(1, 2, 3)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xffffff, 0.5)
      fill.position.set(-2, -1, 1)
      scene.add(fill)

      const { scene: raw } = await loadModel(modelUrl, setProgress)
      const { object } = await normalizeModel(raw)

      if (device.lowPerformance) await limitTextureSizes(object, 512)

      if (calibration?.showShadow) {
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        key.castShadow = true
        object.traverse(n => { if (n.isMesh) { n.castShadow = true } })
      }

      scene.add(object)

      rendererRef.current = renderer
      sceneRef.current = scene
      cameraRef.current = camera
      objectRef.current = object

      setStatus('ready')
      return { THREE, scene, camera, renderer, object }
    } catch (err) {
      setError(err.message || 'تعذّر تحميل النموذج')
      setStatus('error')
      return null
    }
  }, [modelUrl, calibration?.showShadow])

  /** Match the drawing buffer to the video's aspect so nothing stretches. */
  const resize = useCallback((width, height) => {
    const renderer = rendererRef.current
    const camera = cameraRef.current
    if (!renderer || !camera || !width || !height) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }, [])

  const render = useCallback(() => {
    const r = rendererRef.current
    if (r && sceneRef.current && cameraRef.current) r.render(sceneRef.current, cameraRef.current)
  }, [])

  useEffect(() => {
    if (!enabled) dispose()
    return dispose
  }, [enabled, dispose])

  return {
    canvasRef, status, progress, error,
    init, dispose, resize, render,
    scene: sceneRef, camera: cameraRef, renderer: rendererRef, object: objectRef,
  }
}
