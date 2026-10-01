import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Store, MapPin, Phone, Map, ArrowLeft } from 'lucide-react'

const fadeUp  = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }
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
    <section className="py-14 lg:py-16" style={{ background: '#FDF4EA' }}>
      <div className="container-custom">

        <div className="text-center mb-10">
          <span className="lolis-chip lolis-chip-pink mb-3 inline-flex items-center gap-1.5">
            <Store size={13} /> فروعنا
          </span>
          <h2 className="lolis-heading text-3xl lg:text-4xl mb-2" style={{ color: '#27201C' }}>وين تلاقينا؟</h2>
          <p className="font-medium text-sm lolis-body" style={{ color: '#6B5A4A' }}>أقرب نقطة بيع منك</p>
        </div>

        <motion.div
          variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {centers.map(c => (
            <motion.div key={c._id} variants={fadeUp}
              className="rounded-3xl overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1"
              style={{ background: '#fff', border: '1px solid rgba(231,210,183,0.6)', boxShadow: '0 2px 16px rgba(53,32,23,0.06)' }}>

              <div className="px-5 py-4 flex items-center gap-3"
                style={{ background: 'linear-gradient(135deg, #A96734 0%, #6F3E25 100%)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <Store size={18} style={{ color: '#FBF7F0' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base lolis-body truncate" style={{ color: '#FBF7F0' }}>{c.name}</h3>
                  {c.location && (
                    <p className="text-xs font-medium lolis-body truncate flex items-center gap-1 mt-0.5"
                      style={{ color: 'rgba(251,247,240,0.75)' }}>
                      <MapPin size={10} /> {c.location}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 flex flex-col gap-3 flex-1">
                {c.phone && (
                  <a href={`tel:${c.phone}`}
                    className="flex items-center gap-2 text-sm font-bold lolis-body hover:underline"
                    style={{ color: '#A96734' }}>
                    <Phone size={14} /> <span dir="ltr">{c.phone}</span>
                  </a>
                )}

                {c.availableProducts?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.availableProducts.slice(0, 4).map(p => (
                      <span key={p._id}
                        className="text-xs px-2.5 py-1 rounded-xl font-bold lolis-body"
                        style={{ background: 'rgba(169,103,52,0.1)', color: '#A96734' }}>
                        {p.name}
                      </span>
                    ))}
                    {c.availableProducts.length > 4 && (
                      <span className="text-xs px-2.5 py-1 rounded-xl font-bold lolis-body"
                        style={{ background: '#F5EEE6', color: '#A09080' }}>
                        +{c.availableProducts.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {c.mapLink && (
                  <a href={c.mapLink} target="_blank" rel="noopener noreferrer"
                    className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl font-bold text-xs lolis-body transition-colors"
                    style={{ background: 'rgba(169,103,52,0.1)', color: '#A96734', border: '1px solid rgba(169,103,52,0.2)' }}>
                    فتح على الخريطة <Map size={13} />
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>

        <div className="text-center mt-8">
          <Link to="/centers" className="lolis-btn lolis-btn-md inline-flex items-center gap-2"
            style={{ background: 'transparent', color: '#A96734', border: '1.5px solid #E7D2B7', fontWeight: 700, padding: '0.6rem 1.5rem', borderRadius: '9999px' }}>
            شوف كل فروعنا <ArrowLeft size={15} />
          </Link>
        </div>
      </div>
    </section>
  )
}
