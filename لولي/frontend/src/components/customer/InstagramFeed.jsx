import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Instagram, Play, ArrowLeft } from 'lucide-react'

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }

/**
 * InstagramFeed
 * - If beholdFeedId is provided → fetches last 6 posts from Behold.so and shows a grid
 * - If only instagramUrl is provided → shows a simple "Follow us" CTA
 * - If neither → renders nothing
 *
 * To get a Behold Feed ID (free):
 * 1. Sign up at behold.so
 * 2. Connect your Instagram account
 * 3. Create a feed → copy the Feed ID
 * 4. Paste it in Admin → الإعدادات → الانستغرام
 */
export default function InstagramFeed({ instagramUrl, beholdFeedId }) {
  const [posts,   setPosts]   = useState([])
  const [loading, setLoading] = useState(false)
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    if (!beholdFeedId) return
    setLoading(true)
    fetch(`https://feeds.behold.so/${beholdFeedId}`)
      .then(r => r.json())
      .then(data => setPosts((Array.isArray(data) ? data : []).slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [beholdFeedId])

  if (!instagramUrl && !beholdFeedId) return null

  /* ── helpers ── */
  const handle = instagramUrl
    ? '@' + instagramUrl.replace(/https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')
    : null

  const getThumb = (post) =>
    post.sizes?.medium?.url || post.sizes?.small?.url || post.mediaUrl || ''

  return (
    <section className="bg-white py-14 lg:py-16">
      <div className="container-custom">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-100 via-pink-100 to-orange-100 text-pink-600 text-xs font-bold px-4 py-1.5 rounded-full mb-4 lolis-body">
            <Instagram size={13} /> انستغرام
          </div>
          <h2 className="lolis-heading text-3xl lg:text-4xl text-lolis-dark mb-2">
            تابعونا على الانستغرام
          </h2>
          {handle && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lolis-gray hover:text-lolis-pink font-bold text-sm transition-colors lolis-body">
              {handle}
            </a>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-lolis-bg animate-pulse" />
            ))}
          </div>
        ) : posts.length > 0 ? (
          <motion.div
            variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
            className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {posts.map((post) => (
              <motion.a
                key={post.id}
                variants={fadeUp}
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-square rounded-2xl overflow-hidden group cursor-pointer block"
                onMouseEnter={() => setHovered(post.id)}
                onMouseLeave={() => setHovered(null)}>

                {/* Thumbnail */}
                <img
                  src={getThumb(post)}
                  alt={post.caption?.slice(0, 40) || 'Instagram'}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                />

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent
                  opacity-0 group-hover:opacity-100 transition-all duration-300
                  flex flex-col items-center justify-end p-3">
                  <div className="text-white text-center">
                    <Instagram size={20} className="mx-auto mb-1" />
                    {post.caption && (
                      <p className="text-xs font-medium leading-relaxed line-clamp-2 lolis-body">
                        {post.caption.slice(0, 80)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Video badge */}
                {post.mediaType === 'VIDEO' && (
                  <div className="absolute top-2 left-2 bg-black/60 text-white px-1.5 py-1 rounded-lg">
                    <Play size={11} fill="currentColor" strokeWidth={0} />
                  </div>
                )}
              </motion.a>
            ))}
          </motion.div>
        ) : (
          /* No posts yet / no Behold ID — big CTA button */
          <div className="flex justify-center">
            <a
              href={instagramUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-lg text-white
                bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400
                hover:shadow-xl hover:scale-105 transition-all duration-300">
              <Instagram size={22} />
              تابعونا على الانستغرام
            </a>
          </div>
        )}

        {/* "See more" link when posts are loaded */}
        {posts.length > 0 && instagramUrl && (
          <div className="text-center mt-6">
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-black text-lolis-pink hover:text-lolis-pink-dark transition-colors lolis-body">
              شوف المزيد <ArrowLeft size={14} />
            </a>
          </div>
        )}

      </div>
    </section>
  )
}
