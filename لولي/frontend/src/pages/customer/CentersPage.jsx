import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Store, MapPin, Phone, UtensilsCrossed, Map, ShoppingCart } from 'lucide-react'
import WhatsAppIcon from '../../components/common/WhatsAppIcon'

const WA_NUMBER = import.meta.env.VITE_WA_NUMBER || '963XXXXXXXXX'

const fadeUp  = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } }

function CenterCard({ c }) {
  return (
    <motion.div variants={fadeUp}
      className="bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col group">

      {/* Card header gradient */}
      <div className="bg-gradient-to-br from-lolis-pink via-lolis-pink to-pink-400 p-6 relative overflow-hidden">
        {/* decorative blobs */}
        <div className="absolute -top-6 -left-6 w-24 h-24 bg-white/10 rounded-full" />
        <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-white/10 rounded-full" />

        <div className="relative">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
            <Store size={22} className="text-white" strokeWidth={1.75} />
          </div>
          <h3 className="font-black text-white text-xl lolis-body leading-tight">{c.name}</h3>
          {c.location && (
            <div className="flex items-center gap-1.5 mt-2 text-white/80 text-xs font-medium lolis-body">
              <MapPin size={12} />
              <span>{c.location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col gap-4 flex-1">

        {/* Phone */}
        {c.phone && (
          <a href={`tel:${c.phone}`}
            className="flex items-center gap-3 bg-lolis-bg rounded-2xl px-4 py-3 hover:bg-lolis-pink-light transition-colors group/phone">
            <div className="w-9 h-9 bg-lolis-pink rounded-xl flex items-center justify-center text-white flex-shrink-0">
              <Phone size={15} />
            </div>
            <span className="font-black text-lolis-dark text-sm lolis-body" dir="ltr">{c.phone}</span>
          </a>
        )}

        {/* Available products */}
        {c.availableProducts?.length > 0 && (
          <div>
            <div className="text-xs font-black text-lolis-gray mb-2.5 lolis-body flex items-center gap-1.5">
              <UtensilsCrossed size={13} /> متوفر عنده
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.availableProducts.map(p => (
                <span key={p._id}
                  className="text-xs bg-lolis-pink-light text-lolis-pink px-3 py-1.5 rounded-xl font-bold lolis-body">
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {c.notes && (
          <p className="text-xs text-lolis-gray-2 font-medium lolis-body leading-relaxed">{c.notes}</p>
        )}

        {/* Map button */}
        <div className="mt-auto pt-2">
          {c.mapLink ? (
            <a href={c.mapLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-blue-600 text-white font-black text-sm hover:bg-blue-700 transition-colors shadow-sm lolis-body">
              <Map size={15} /> فتح الموقع على خرائط Google
            </a>
          ) : (
            <div className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-lolis-bg text-lolis-gray-2 font-bold text-xs lolis-body">
              <MapPin size={13} /> الموقع قريباً
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function CentersPage() {
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
    <div className="min-h-screen bg-lolis-bg">

      {/* ── Hero ── */}
      <section className="bg-lolis-pink overflow-hidden">
        <div className="container-custom py-14 lg:py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="inline-flex items-center gap-2 bg-white/20 text-white text-xs font-bold px-4 py-1.5 rounded-full mb-5 lolis-body">
              <span className="w-2 h-2 bg-lolis-yellow rounded-full animate-pulse" />
              اوجدينا قريب منك
            </div>
            <h1 className="lolis-heading text-4xl lg:text-5xl text-white mb-3 flex items-center justify-center gap-3">
              <Store size={34} strokeWidth={1.75} /> مراكز البيع
            </h1>
            <p className="text-white/80 font-medium text-base lg:text-lg max-w-md mx-auto lolis-body">
              وجبات لوليز متوفرة في عدة نقاط بيع — اختر الأقرب إليك
            </p>
          </motion.div>
        </div>
        {/* Wave */}
        <div className="relative h-10 overflow-hidden">
          <svg viewBox="0 0 1440 40" fill="none" className="absolute bottom-0 w-full">
            <path d="M0 40L60 33C120 27 240 13 360 10C480 7 600 13 720 17C840 20 960 20 1080 17C1200 13 1320 7 1380 3L1440 0V40H0Z" fill="#F6EFE6"/>
          </svg>
        </div>
      </section>

      {/* ── Centers grid ── */}
      <section className="py-12 lg:py-16">
        <div className="container-custom">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3].map(i => <div key={i} className="bg-white rounded-3xl h-72 animate-pulse shadow-lg" />)}
            </div>
          ) : centers.length === 0 ? (
            <div className="text-center py-20">
              <Store size={48} strokeWidth={1.5} className="mx-auto mb-4 text-lolis-gray-2" />
              <div className="font-black text-lolis-gray text-xl lolis-body">لا توجد مراكز بيع متاحة حالياً</div>
              <p className="text-lolis-gray-2 font-medium mt-2 lolis-body">تابعونا قريباً أو اطلب مباشرة عبر واتساب</p>
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

      {/* ── WhatsApp CTA ── */}
      <section className="bg-lolis-pink py-14 lg:py-16 mt-4">
        <div className="container-custom text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-4">
              <WhatsAppIcon size={26} className="text-white" />
            </div>
            <h3 className="lolis-heading text-3xl text-white mb-3">ما لقيت مركز قريب؟</h3>
            <p className="text-white/80 font-medium mb-6 lolis-body">اطلب توصيل مباشر لبيتك عبر واتساب</p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer"
                className="lolis-btn lolis-btn-lg lolis-btn-wa"><WhatsAppIcon size={16} /> واتساب الآن</a>
              <Link to="/order" className="lolis-btn lolis-btn-lg lolis-btn-white"><ShoppingCart size={16} /> اطلب أونلاين</Link>
            </div>
          </motion.div>
        </div>
      </section>

    </div>
  )
}
