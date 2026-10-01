import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Store, MapPin, Phone, UtensilsCrossed, Map, MessageCircle, ShoppingBag, ArrowLeft } from 'lucide-react'

import { useWaNumber } from '../../hooks/useWaNumber'

const fadeUp  = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } }

function CenterCard({ c }) {
  return (
    <motion.div variants={fadeUp}
      className="rounded-3xl overflow-hidden flex flex-col group transition-all duration-300 hover:-translate-y-1"
      style={{ background: '#ffffff', border: '1px solid rgba(231,210,183,0.6)', boxShadow: '0 4px 20px rgba(53,32,23,0.07)' }}>

      {/* Card header */}
      <div className="px-6 py-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #A96734 0%, #6F3E25 100%)' }}>
        <div className="absolute -top-6 -left-6 w-24 h-24 rounded-full opacity-10" style={{ background: '#fff' }} />
        <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full opacity-10" style={{ background: '#fff' }} />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.18)' }}>
            <Store size={20} style={{ color: '#FBF7F0' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base lolis-body truncate" style={{ color: '#FBF7F0' }}>{c.name}</h3>
            {c.location && (
              <div className="flex items-center gap-1.5 mt-1 text-xs font-medium lolis-body"
                style={{ color: 'rgba(251,247,240,0.75)' }}>
                <MapPin size={11} />
                <span className="truncate">{c.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col gap-3 flex-1">

        {c.phone && (
          <a href={`tel:${c.phone}`}
            className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors group/phone"
            style={{ background: '#FDF4EA' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(169,103,52,0.12)' }}>
              <Phone size={15} style={{ color: '#A96734' }} />
            </div>
            <span className="font-bold text-sm lolis-body" dir="ltr" style={{ color: '#27201C' }}>{c.phone}</span>
          </a>
        )}

        {c.availableProducts?.length > 0 && (
          <div>
            <div className="text-xs font-bold mb-2 lolis-body flex items-center gap-1.5" style={{ color: '#6B5A4A' }}>
              <UtensilsCrossed size={12} style={{ color: '#A96734' }} /> متوفر عنده
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.availableProducts.map(p => (
                <span key={p._id} className="text-xs px-3 py-1 rounded-xl font-bold lolis-body"
                  style={{ background: 'rgba(169,103,52,0.1)', color: '#A96734' }}>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {c.notes && (
          <p className="text-xs font-medium lolis-body leading-relaxed" style={{ color: '#A09080' }}>{c.notes}</p>
        )}

        <div className="mt-auto pt-2">
          {c.mapLink ? (
            <a href={c.mapLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-bold text-sm lolis-body transition-all hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, #A96734, #6F3E25)', color: '#FBF7F0', boxShadow: '0 4px 14px rgba(169,103,52,0.3)' }}>
              فتح الموقع على خرائط Google <Map size={15} />
            </a>
          ) : (
            <div className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-medium text-xs lolis-body"
              style={{ background: '#F5EEE6', color: '#A09080' }}>
              الموقع قريباً <MapPin size={13} />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function CentersPage() {
  const wa = useWaNumber()
  const [centers, setCenters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'
    fetch(`${base}/centers/public`)
      .then(r => r.json())
      .then(d => setCenters(d.centers || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen" style={{ background: '#FDF4EA' }}>
      {/* Centers grid */}
      <section className="py-14 lg:py-16">
        <div className="container-custom">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3].map(i => (
                <div key={i} className="rounded-3xl h-72 animate-pulse"
                  style={{ background: 'rgba(231,210,183,0.4)' }} />
              ))}
            </div>
          ) : centers.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(169,103,52,0.1)' }}>
                <Store size={28} style={{ color: '#A96734' }} />
              </div>
              <div className="font-bold text-xl lolis-body mb-2" style={{ color: '#6B5A4A' }}>لا توجد فروع بيع متاحة حالياً</div>
              <p className="text-sm font-medium lolis-body" style={{ color: '#A09080' }}>تابعونا قريباً أو اطلب مباشرة عبر واتساب</p>
            </div>
          ) : (
            <motion.div
              variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {centers.map(c => <CenterCard key={c._id} c={c} />)}
            </motion.div>
          )}
        </div>
      </section>

      {/* WhatsApp CTA */}
      <section className="py-14 lg:py-16" style={{ background: '#fff' }}>
        <div className="container-custom text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h3 className="lolis-heading text-3xl mb-3" style={{ color: '#27201C' }}>ما لقيت فرع قريب؟</h3>
            <p className="font-medium mb-8 lolis-body" style={{ color: '#6B5A4A' }}>اطلب توصيل مباشر لبيتك عبر واتساب</p>
            <div className="flex flex-wrap justify-center gap-4">
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                className="lolis-btn lolis-btn-lg lolis-btn-wa">
                واتساب الآن <MessageCircle size={18} />
              </a>
              <Link to="/order" className="lolis-btn lolis-btn-lg"
                style={{ background: '#FDF4EA', color: '#27201C', border: '1.5px solid rgba(231,210,183,0.8)' }}>
                اطلب أونلاين <ShoppingBag size={18} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
