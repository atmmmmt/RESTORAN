import { useEffect, useState, useRef } from 'react'
import Lottie from 'lottie-react'

// Free & public Lottie animation URLs from LottieFiles CDN
export const LOTTIE_URLS = {
  foodHero:    'https://assets2.lottiefiles.com/packages/lf20_y2bckx4f.json',
  cooking:     'https://assets9.lottiefiles.com/packages/lf20_se5qp7ko.json',
  delivery:    'https://assets5.lottiefiles.com/packages/lf20_dews3j6m.json',
  success:     'https://assets1.lottiefiles.com/packages/lf20_ovo1lskg.json',
  empty:       'https://assets4.lottiefiles.com/packages/lf20_0yfsb3a1.json',
  loading:     'https://assets4.lottiefiles.com/private_files/lf30_fup2uejx.json',
  heartbeat:   'https://assets3.lottiefiles.com/packages/lf20_hntzYU.json',
  stars:       'https://assets7.lottiefiles.com/packages/lf20_qm8eqzse.json',
}

export default function LottiePlayer({
  src,
  animationData,
  width = 300,
  height = 300,
  loop = true,
  autoplay = true,
  className = '',
  fallback = null,
  style = {},
}) {
  const [data, setData] = useState(animationData || null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(!animationData)

  useEffect(() => {
    if (animationData) { setData(animationData); setLoading(false); return }
    if (!src) { setError(true); setLoading(false); return }

    const controller = new AbortController()
    fetch(src, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })

    return () => controller.abort()
  }, [src, animationData])

  if (error) return fallback || <div style={{ width, height }} className={`flex items-center justify-center ${className}`}>{fallback}</div>
  if (loading || !data) {
    return (
      <div style={{ width, height }} className={`flex items-center justify-center ${className}`}>
        <div className="w-12 h-12 rounded-full border-4 border-fuchsia/20 border-t-fuchsia animate-spin" />
      </div>
    )
  }

  return (
    <Lottie
      animationData={data}
      loop={loop}
      autoplay={autoplay}
      style={{ width, height, ...style }}
      className={className}
    />
  )
}
