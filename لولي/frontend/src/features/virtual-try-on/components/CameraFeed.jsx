import { forwardRef, useEffect } from 'react'

/**
 * The live camera <video> plus the transparent WebGL canvas drawn over it.
 *
 * Both are sized from the video's intrinsic dimensions rather than CSS, so
 * the 3D overlay lands exactly where the tracker thinks it should.
 */
const CameraFeed = forwardRef(function CameraFeed(
  { canvasRef, mirrored = true, onResize, className = '' },
  videoRef
) {
  /* Keep the drawing buffer in step with the video. Phones report a size
     change on rotation and, on iOS, a moment after the stream attaches. */
  useEffect(() => {
    const video = videoRef?.current
    if (!video) return

    const sync = () => {
      const w = video.videoWidth
      const h = video.videoHeight
      if (w && h) onResize?.(w, h)
    }

    video.addEventListener('loadedmetadata', sync)
    video.addEventListener('resize', sync)
    sync()

    const ro = new ResizeObserver(sync)
    ro.observe(video)

    return () => {
      video.removeEventListener('loadedmetadata', sync)
      video.removeEventListener('resize', sync)
      ro.disconnect()
    }
  }, [videoRef, onResize])

  // A front camera feed is mirrored so the customer sees themselves as in a
  // mirror; the overlay must be mirrored identically or it lands on the
  // wrong side.
  const transform = mirrored ? 'scaleX(-1)' : 'none'

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ transform }}
      />
    </div>
  )
})

export default CameraFeed
