import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Store, MapPin, Phone, Map, ArrowLeft } from 'lucide-react'

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }

export default function CentersSection() {
  const [centers, setCenters] = useState([])

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'
    fetch(`${base}/centers/public`)
      .then(r => r.json())
      .then(d => setCenters((d.centers || []).slice(0, 3)))
      .catch(() => {})
  }, [])

  if (!centers.length) return null

  return (
    <section className="bg-lolis-bg py-14 lg:py-16">
      <div className="container-custom">

        {/* Header */}
        <div className="text-center mb-10">
          <span className="lolis-chip lolis-chip-pink mb-3 inline-flex items-center gap-1.5">
            <Store size={13} /> مراكز البيع
          </span>
          <h2 className="lolis-heading text-3xl lg:text-4xl text-lolis-dark mb-2">وين تلاقينا؟</h2>
          <p className="text-lolis-gray font-medium text-sm lolis-body">أقرب نقطة بيع لوليز منك</p>
        </div>

        {/* Cards */}
        <motion.div
          variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {centers.map(c => (
            <motion.div key={c._id} variants={fadeUp}
              className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">

              {/* Top bar */}
              <div className="bg-gradient-to-l from-lolis-pink to-pink-400 px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-white/25 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Store size={18} className="text-white" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-white text-base lolis-body truncate">{c.name}</h3>
                  {c.location && (
                    <p className="text-white/80 text-xs font-medium lolis-body truncate flex items-center gap-1">
                      <MapPin size={10} /> {c.location}
                    </p>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="p-4 flex flex-col gap-3 flex-1">
                {c.phone && (
                  <a href={`tel:${c.phone}`}
                    className="flex items-center gap-2 text-sm font-black text-lolis-pink lolis-body hover:underline">
                    <Phone size={13} /> <span dir="ltr">{c.phone}</span>
                  </a>
                )}

                {c.availableProducts?.length > 0 && (
                  <div>
                    <p className="text-xs text-lolis-gray font-bold mb-1.5 lolis-body">متوفر:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {c.availableProducts.slice(0, 4).map(p => (
                        <span key={p._id}
                          className="text-xs bg-lolis-pink-light text-lolis-pink px-2.5 py-1 rounded-xl font-bold lolis-body">
                          {p.name}
                        </span>
                      ))}
                      {c.availableProducts.length > 4 && (
                        <span className="text-xs bg-lolis-bg text-lolis-gray px-2.5 py-1 rounded-xl font-bold lolis-body">
                          +{c.availableProducts.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {c.mapLink && (
                  <a href={c.mapLink} target="_blank" rel="noopener noreferrer"
                    className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl bg-blue-600 text-white font-black text-xs hover:bg-blue-700 transition-colors lolis-body">
                    <Map size={13} /> فتح في خرائط Google
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* See all button */}
        <div className="text-center mt-8">
          <Link to="/centers"
            className="lolis-btn lolis-btn-md lolis-btn-outline-pink inline-flex items-center gap-2">
            <Store size={15} /> شوف كل مراكز البيع <ArrowLeft size={14} />
          </Link>
        </div>

      </div>
    </section>
  )
}
