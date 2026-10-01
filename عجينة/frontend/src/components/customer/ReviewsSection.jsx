import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Star, UserCircle, CheckCircle2 } from 'lucide-react'

const fadeUp  = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }
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
    <section className="py-14 lg:py-16" style={{ background: '#FBF7F0' }}>
      <div className="container-custom">
        <div className="text-center mb-10">
          <span className="lolis-chip lolis-chip-pink mb-3 inline-flex items-center gap-1.5">
            <Star size={13} fill="#A96734" style={{ color: '#A96734' }} /> آراء الزبائن
          </span>
          <h2 className="lolis-heading text-3xl lg:text-4xl mb-2" style={{ color: '#27201C' }}>شو قالوا عننا</h2>
          <p className="font-medium text-sm lolis-body" style={{ color: '#6B5A4A' }}>
            آراء حقيقية من زبائن حقيقيين
          </p>
        </div>

        <motion.div
          variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {reviews.map(r => (
            <motion.div key={r._id} variants={fadeUp}
              className="bg-white rounded-3xl p-6 flex flex-col gap-4"
              style={{ border: '1px solid rgba(231,210,183,0.6)', boxShadow: '0 2px 16px rgba(53,32,23,0.05)' }}>

              {/* Stars */}
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} size={16}
                    fill={s <= r.rating ? '#A96734' : 'transparent'}
                    style={{ color: s <= r.rating ? '#A96734' : '#E7D2B7' }}
                    strokeWidth={1.5}
                  />
                ))}
              </div>

              {/* Content */}
              <p className="font-medium text-sm leading-relaxed flex-1 lolis-body" style={{ color: '#27201C' }}>
                "{r.content}"
              </p>

              {/* Customer */}
              <div className="flex items-center gap-3 pt-3" style={{ borderTop: '1px solid #E7D2B7' }}>
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(169,103,52,0.1)' }}>
                  <UserCircle size={22} style={{ color: '#A96734' }} />
                </div>
                <div>
                  <div className="font-bold text-sm lolis-body" style={{ color: '#27201C' }}>{r.customerName}</div>
                  <div className="text-xs font-medium flex items-center gap-1 lolis-body" style={{ color: '#A09080' }}>
                    <CheckCircle2 size={11} style={{ color: '#4A7A2E' }} /> زبون عجينة وطحينة
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
