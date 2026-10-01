import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, Instagram } from 'lucide-react'
import { tenantHeader } from '../../services/api'
import { useSiteSettings } from '../../hooks/useSiteSettings'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'

const AUTOPLAY_MS = 5000
/* After someone steers the slider by hand, leave them alone for a while. */
const RESUME_AFTER_MS = 15000

/* Four across on a laptop, three on a tablet, one-and-a-bit on a phone so
   the next cover peeks in and says "swipe". */
const SLIDE_W = 'w-[72%] sm:w-[32%] lg:w-[23.5%]'

const postLink = p => `https://www.instagram.com/${p.kind === 'reel' ? 'reel' : 'p'}/${p.code}/`

/**
 * Instagram on the storefront, with no third party in between.
 *
 * Posts chosen in Settings are shown by their cover and played in our own
 * player — the server copies each post's cover and video to our Cloudinary
 * (services/instagramPostsService.js). That is what lets only one video play
 * at a time, and keeps Instagram's embed chrome (account header, follower
 * count) off the page. A post whose media has not been fetched yet falls
 * back to Instagram's embed for that one card.
 *
 * If an access token is ever connected, the account's own feed wins.
 */
export default function InstagramFeed({ instagramUrl: urlProp }) {
  const settings = useSiteSettings()
  const instagramUrl = settings.instagramUrl || urlProp || ''
  const chosen = settings.instagramPosts || []

  const [feed,    setFeed]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch(`${API_URL}/site-settings/instagram-feed`, { headers: tenantHeader })
      .then(r => r.json())
      .then(d => { if (alive) setFeed(d.posts || []) })
      .catch(() => { /* fall back to the chosen posts / follow button */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (!instagramUrl && !feed.length && !chosen.length && !loading) return null

  const handle = instagramUrl
    ? '@' + instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').split(/[/?#]/)[0]
    : null

  const slides = feed.length
    ? feed.map(p => ({ key: p.id, feed: p }))
    : chosen.map(p => ({ key: p.code, post: p }))

  return (
    <section className="bg-white py-14 lg:py-16">
      <div className="container-custom">

        <div className="text-center mb-8">
          <div className="inline-flex items-center bg-gradient-to-r from-purple-100 via-pink-100 to-orange-100 text-pink-600 text-xs font-bold px-4 py-1.5 rounded-full mb-4 lolis-body">
            انستغرام
          </div>
          <h2 className="lolis-heading text-3xl lg:text-4xl text-lolis-dark mb-2">
            تابعونا على الانستغرام
          </h2>
          {handle && (
            <a href={instagramUrl} target="_blank" rel="noopener noreferrer" dir="ltr"
              className="text-lolis-gray hover:text-lolis-pink font-bold text-sm transition-colors lolis-body">
              {handle}
            </a>
          )}
        </div>

        {slides.length > 0 ? (
          <Slider slides={slides} />
        ) : loading ? (
          <div className="flex gap-4 overflow-hidden">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`shrink-0 ${SLIDE_W} aspect-[9/16] rounded-2xl bg-lolis-bg animate-pulse`} />
            ))}
          </div>
        ) : (
          <div className="flex justify-center">
            <a href={instagramUrl || '#'} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-lg text-white
                bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400
                hover:shadow-xl hover:scale-105 transition-all duration-300">
              تابعونا على الانستغرام
            </a>
          </div>
        )}

        {slides.length > 0 && instagramUrl && (
          <div className="text-center mt-6">
            <a href={instagramUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-black text-lolis-pink hover:text-lolis-pink-dark transition-colors lolis-body">
              شوف المزيد على انستغرام ←
            </a>
          </div>
        )}

      </div>
    </section>
  )
}

/**
 * One chosen post: its cover until tapped, then our own player.
 * `nowPlaying` holds whichever <video> is playing across all cards, so
 * starting one pauses the last.
 */
function ReelCard({ post, nowPlaying, onPlayingChange }) {
  const [open, setOpen] = useState(false)
  const videoRef = useRef(null)

  /* Media not fetched yet — Instagram's own embed for this card only. */
  if (!post.cover) {
    return (
      <div className="rounded-2xl overflow-hidden border border-lolis-border bg-white">
        <iframe src={`${postLink(post)}embed/`} title={`Instagram ${post.code}`} loading="lazy" scrolling="no"
          allow="encrypted-media; picture-in-picture" className="w-full block" style={{ height: 560, border: 0 }} />
      </div>
    )
  }

  const onPlay = () => {
    const mine = videoRef.current
    if (nowPlaying.current && nowPlaying.current !== mine) nowPlaying.current.pause()
    nowPlaying.current = mine
    onPlayingChange(true)
  }
  const onStop = () => {
    if (nowPlaying.current === videoRef.current) nowPlaying.current = null
    onPlayingChange(false)
  }

  return (
    <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-black shadow-md group">
      {open && post.video ? (
        <video ref={videoRef} src={post.video} poster={post.cover} controls autoPlay playsInline
          onPlay={onPlay} onPause={onStop} onEnded={onStop}
          className="w-full h-full object-cover" />
      ) : (
        <button type="button" aria-label="تشغيل الفيديو"
          onClick={() => (post.video ? setOpen(true) : window.open(postLink(post), '_blank', 'noopener'))}
          className="absolute inset-0 w-full h-full">
          <img src={post.cover} alt="" loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
              <Play size={24} className="text-lolis-dark ml-1" fill="currentColor" />
            </span>
          </span>
        </button>
      )}

      <a href={postLink(post)} target="_blank" rel="noopener noreferrer" aria-label="فتح على انستغرام"
        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white hover:bg-black/60">
        <Instagram size={15} />
      </a>
    </div>
  )
}

/**
 * A scroll-snap track that turns on its own.
 *
 * Laid out left-to-right on purpose: scroll positions in an RTL container
 * differ between browsers, and a row of covers reads fine either way.
 * Autoplay only runs while the section is on screen and nothing is playing,
 * stops while the pointer or a finger is on it, and backs off after any
 * manual move. It scrolls the track only, never the page.
 */
function Slider({ slides }) {
  const trackRef   = useRef(null)
  const nowPlaying = useRef(null)
  const pausedUntil = useRef(0)
  const [index, setIndex]       = useState(0)
  const [visible, setVisible]   = useState(false)
  const [hovering, setHovering] = useState(false)
  const [playing, setPlaying]   = useState(false)

  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const goTo = useCallback((i, manual = false) => {
    const track = trackRef.current
    if (!track) return
    const n = slides.length
    const next = ((i % n) + n) % n
    const slide = track.children[next]
    if (!slide) return
    track.scrollTo({ left: slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2, behavior: reduced ? 'auto' : 'smooth' })
    setIndex(next)
    if (manual) pausedUntil.current = Date.now() + RESUME_AFTER_MS
  }, [slides.length, reduced])

  const onScroll = () => {
    const track = trackRef.current
    if (!track) return
    const centre = track.scrollLeft + track.clientWidth / 2
    let best = 0, bestDist = Infinity
    ;[...track.children].forEach((el, i) => {
      const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - centre)
      if (d < bestDist) { bestDist = d; best = i }
    })
    setIndex(best)
  }

  useEffect(() => {
    const el = trackRef.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (reduced || !visible || hovering || playing || slides.length < 2) return
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return
      goTo(index + 1)
    }, AUTOPLAY_MS)
    return () => clearInterval(t)
  }, [reduced, visible, hovering, playing, index, goTo, slides.length])

  const arrow = 'absolute top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/95 shadow-lg border border-lolis-border flex items-center justify-center text-lolis-dark hover:scale-105 transition-transform'

  return (
    <div className="relative"
      onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
      onTouchStart={() => { pausedUntil.current = Date.now() + RESUME_AFTER_MS }}>

      <div ref={trackRef} dir="ltr" onScroll={onScroll}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {slides.map(s => (
          <div key={s.key} className={`snap-center shrink-0 ${SLIDE_W}`}>
            {s.post ? (
              <ReelCard post={s.post} nowPlaying={nowPlaying} onPlayingChange={setPlaying} />
            ) : (
              <a href={s.feed.permalink} target="_blank" rel="noopener noreferrer"
                className="relative block aspect-[9/16] rounded-2xl overflow-hidden group bg-black">
                <img src={s.feed.image} alt={s.feed.caption?.slice(0, 40) || 'Instagram'} loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </a>
            )}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <button type="button" aria-label="السابق" onClick={() => goTo(index - 1, true)} className={`${arrow} left-1 lg:-left-5`}>
            <ChevronLeft size={20} />
          </button>
          <button type="button" aria-label="التالي" onClick={() => goTo(index + 1, true)} className={`${arrow} right-1 lg:-right-5`}>
            <ChevronRight size={20} />
          </button>

          <div className="flex justify-center gap-1.5 mt-4" dir="ltr">
            {slides.map((s, i) => (
              <button key={s.key} type="button" aria-label={`منشور ${i + 1}`} onClick={() => goTo(i, true)}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-lolis-pink' : 'w-2 bg-lolis-border'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
