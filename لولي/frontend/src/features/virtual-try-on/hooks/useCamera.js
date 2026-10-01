import { useCallback, useEffect, useRef, useState } from 'react'
import {
  requestCamera, stopStream, hasMultipleCameras,
  queryCameraPermission, PERMISSION_STATE,
} from '../utils/cameraPermissions'
import { getDeviceSupport } from '../utils/deviceSupport'

/**
 * Camera lifecycle for the try-on viewer.
 *
 * The stream is never opened implicitly — `start()` must be called from a
 * user gesture. On unmount, close, or tab-hide every track is stopped, which
 * is what turns the device's recording indicator back off.
 */
export function useCamera({ onError } = {}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [state, setState] = useState('idle')   // idle|starting|ready|error
  const [permission, setPermission] = useState(PERMISSION_STATE.UNKNOWN)
  const [facingMode, setFacingMode] = useState('user')
  const [canSwitch, setCanSwitch] = useState(false)
  const [errorCode, setErrorCode] = useState(null)

  /** Attach a stream to the <video> and wait until it actually has frames. */
  const attach = useCallback(async stream => {
    const video = videoRef.current
    if (!video) return false

    video.srcObject = stream
    video.setAttribute('playsinline', '')   // iOS refuses inline playback otherwise
    video.muted = true

    await new Promise(resolve => {
      if (video.readyState >= 2) return resolve()
      video.onloadedmetadata = () => resolve()
    })

    try {
      await video.play()
    } catch {
      // Autoplay can still be refused; the user gesture that opened the
      // modal normally satisfies it, so this is rare and non-fatal.
    }
    return true
  }, [])

  const stop = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState('idle')
  }, [])

  const start = useCallback(async (mode = facingMode) => {
    setState('starting')
    setErrorCode(null)

    // Release the previous device before asking for another, or the switch
    // fails with NotReadableError on most Android builds.
    stopStream(streamRef.current)
    streamRef.current = null

    const { lowPerformance } = getDeviceSupport()
    const result = await requestCamera({ facingMode: mode, lowPerformance })

    if (!result.ok) {
      setState('error')
      setErrorCode(result.code)
      setPermission(result.code === 'denied' ? PERMISSION_STATE.DENIED : permission)
      onError?.(result.code)
      return { ok: false, code: result.code }
    }

    streamRef.current = result.stream
    setPermission(PERMISSION_STATE.GRANTED)
    setFacingMode(mode)

    const attached = await attach(result.stream)
    if (!attached) {
      stopStream(result.stream)
      setState('error')
      setErrorCode('attach-failed')
      return { ok: false, code: 'attach-failed' }
    }

    setState('ready')
    hasMultipleCameras().then(setCanSwitch)
    return { ok: true }
  }, [attach, facingMode, onError, permission])

  const switchCamera = useCallback(
    () => start(facingMode === 'user' ? 'environment' : 'user'),
    [facingMode, start]
  )

  /** Grab the current frame as a JPEG data URL for the capture control. */
  const captureFrame = useCallback((overlayCanvas = null) => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')

    // Undo the CSS mirror so the saved photo matches what the customer saw.
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    if (facingMode === 'user') ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (overlayCanvas) ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', 0.92)
  }, [facingMode])

  /* Release the camera whenever the page is backgrounded — leaving it live
     drains battery and keeps the indicator on while the user is elsewhere. */
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [stop])

  useEffect(() => {
    queryCameraPermission().then(setPermission)
    return () => stopStream(streamRef.current)
  }, [])

  return {
    videoRef, state, permission, facingMode, canSwitch, errorCode,
    start, stop, switchCamera, captureFrame,
    stream: streamRef,
  }
}
