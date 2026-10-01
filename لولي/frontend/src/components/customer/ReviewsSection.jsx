import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Star, BadgeCheck } from 'lucide-react'

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }

export default function ReviewsSection() {
  const [reviews, setReviews] = useState([])

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'
    fetch(`${base}/reviews/public`)
      .then(r => r.json())
      .then(d => setReviews(d.reviews || []))
      .catch(() => {})
  }, [])

  if (!reviews.length) return null

  return (
    <section className="bg-lolis-bg py-14 lg:py-16">
      <div className="container-custom">
        <div className="text-center mb-10">
          <span className="lolis-chip lolis-chip-yellow mb-3 inline-flex items-center gap-1.5">
            <Star size={13} fill="currentColor" strokeWidth={0} /> آراء الزبائن
          </span>
          <h2 className="lolis-heading text-3xl lg:text-4xl text-lolis-dark mb-2">شو قالوا عننا</h2>
          <p className="text-lolis-gray font-medium text-sm lolis-body">آراء حقيقية من زبائن حقيقيين</p>
        </div>

        <motion.div
          variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {reviews.map(r => (
            <motion.div key={r._id} variants={fadeUp}
              className="bg-white rounded-3xl p-6 shadow-sm border border-lolis-border flex flex-col gap-4">
              {/* Stars */}
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} size={16}
                    className={s <= r.rating ? 'text-yellow-400' : 'text-lolis-border'}
                    fill="currentColor" strokeWidth={0} />
                ))}
              </div>

              {/* Content */}
              <p className="text-lolis-dark font-medium text-sm leading-relaxed flex-1 lolis-body">
                "{r.content}"
              </p>

              {/* Customer */}
              <div className="flex items-center gap-3 pt-3 border-t border-lolis-border">
                <div className="w-10 h-10 rounded-2xl bg-lolis-pink-light flex items-center justify-center flex-shrink-0">
                  <span className="font-black text-lolis-pink text-sm lolis-body">
                    {r.customerName?.trim()?.[0] || '؟'}
                  </span>
                </div>
                <div>
                  <div className="font-black text-lolis-dark text-sm lolis-body">{r.customerName}</div>
                  <div className="text-xs text-lolis-gray font-medium lolis-body flex items-center gap-1">
                    زبونة لوليز <BadgeCheck size={12} className="text-lolis-mint-dark" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
