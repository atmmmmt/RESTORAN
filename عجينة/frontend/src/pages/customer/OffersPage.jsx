import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Tag, ShoppingCart, UtensilsCrossed } from 'lucide-react'
import { offersAPI } from '../../services/api'
import { formatCurrency, calcDiscountedPrice } from '../../utils/formatters'
import dayjs from 'dayjs'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } }
const fadeUp  = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.42 } } }

/* ── Offer Card ────────────────────────── */
function OfferCard({ offer }) {
  const prod = offer.productId
  const discountedPrice = prod ? calcDiscountedPrice(prod.directPrice, offer) : 0
  const daysLeft  = dayjs(offer.endDate).diff(dayjs(), 'day')
  const hoursLeft = dayjs(offer.endDate).diff(dayjs(), 'hour') % 24
  const isUrgent  = daysLeft <= 1

  const timerLabel = daysLeft <= 0
    ? `${hoursLeft} ساعة أخيرة!`
    : daysLeft === 1
    ? 'آخر يوم!'
    : `${daysLeft} يوم متبقي`

  const timerClass = isUrgent
    ? 'bg-red-50 text-red-500 border border-red-200'
    : daysLeft <= 3
    ? 'bg-lolis-yellow-light text-amber-700 border border-yellow-300'
    : 'bg-lolis-mint-light text-lolis-mint-dark border border-teal-200'

  return (
    <motion.div variants={fadeUp} whileHover={{ y: -4 }}>
      <div className="lolis-card flex flex-col h-full bg-white">
        {/* Visual */}
        <div className={`relative flex items-center justify-center py-10 ${isUrgent ? 'bg-red-50' : 'bg-lolis-yellow-light'}`}>
          <div className="text-7xl select-none">{prod?.image || '🍽️'}</div>

          {/* Discount badge */}
          <div className={`absolute top-4 right-4 font-black text-sm px-4 py-1.5 rounded-full text-white ${
            isUrgent ? 'bg-red-500' : 'bg-lolis-pink'
          }`}>
            {offer.discountType === 'percentage'
              ? `${offer.discountValue}% خصم`
              : `وفّري ${formatCurrency(offer.discountValue)}`}
          </div>

          {/* Timer */}
          <div className={`absolute bottom-4 left-4 text-xs font-bold px-3 py-1.5 rounded-full lolis-body ${timerClass} ${isUrgent ? 'animate-pulse' : ''}`}>
            {timerLabel}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col flex-1">
          <h3 className="font-black text-lolis-dark text-lg mb-1.5 line-clamp-1 lolis-body">
            {offer.title || prod?.name}
          </h3>
          {offer.description && (
            <p className="text-lolis-gray text-sm font-medium line-clamp-2 leading-relaxed mb-4 lolis-body">{offer.description}</p>
          )}

          {/* Price comparison */}
          {prod && (
            <div className="bg-lolis-bg rounded-2xl p-4 mb-5 flex items-center justify-between">
              <div>
                <div className="text-xs text-lolis-gray font-medium lolis-body">السعر الأصلي</div>
                <div className="text-sm text-lolis-gray line-through font-medium lolis-body">{formatCurrency(prod.directPrice)}</div>
              </div>
              <div className="text-lolis-gray-2 text-xl">←</div>
              <div className="text-right">
                <div className="text-xs text-lolis-mint-dark font-bold lolis-body">بعد الخصم</div>
                <div className="text-xl font-black text-lolis-pink lolis-body">{formatCurrency(discountedPrice)}</div>
              </div>
            </div>
          )}

          {/* CTA */}
          {prod && (
            <Link to={`/menu/${prod._id || prod}`} className="mt-auto lolis-btn lolis-btn-md lolis-btn-pink w-full inline-flex items-center justify-center gap-2">
              اطلب بسعر العرض <ShoppingCart size={16} />
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ── Main Page ─────────────────────────── */
export default function OffersPage() {
  const [offers,  setOffers]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    offersAPI.getPublic().then(r => setOffers(r.data.offers || [])).finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-lolis-bg">

      {/* ── Page Header ─────────────────── */}
      <div className="bg-lolis-yellow">
        <div className="container-custom py-12 lg:py-16">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 bg-white/30 text-lolis-dark text-xs font-bold px-3 py-1.5 rounded-full mb-4 lolis-body">
              <Tag size={12} /> عروض حصرية محدودة الوقت
            </div>
            <h1 className="lolis-heading text-4xl lg:text-5xl text-lolis-dark mb-2">أحلى العروض</h1>
            <p className="text-lolis-dark/65 font-medium lolis-body">
              {offers.length > 0 ? `${offers.length} عرض نشط — لا تفوّتها!` : 'تابعونا لأحدث العروض!'}
            </p>
          </motion.div>
        </div>
        <div className="relative h-10 overflow-hidden">
          <svg viewBox="0 0 1440 40" fill="none" className="absolute bottom-0 w-full">
            <path d="M0 40L60 33C120 27 240 13 360 10C480 7 600 13 720 17C840 20 960 20 1080 17C1200 13 1320 7 1380 3L1440 0V40H0Z" fill="#F7F5F5" />
          </svg>
        </div>
      </div>

      <div className="container-custom py-10 lg:py-14">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <div key={i} className="lolis-card bg-white animate-pulse">
                <div className="h-52 lolis-shimmer" />
                <div className="p-6 space-y-3">
                  <div className="h-5 lolis-shimmer rounded-xl w-3/4" />
                  <div className="h-4 lolis-shimmer rounded-xl" />
                  <div className="h-12 lolis-shimmer rounded-full mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : offers.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-24">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(169,103,52,0.1)' }}>
              <Tag size={28} style={{ color: '#A96734' }} />
            </div>
            <h2 className="font-black text-lolis-gray text-2xl mb-2 lolis-body">لا توجد عروض حالياً</h2>
            <p className="text-lolis-gray-2 font-medium text-sm mb-6 lolis-body">تابعونا على واتساب لتصلك أحدث العروض أولاً!</p>
            <Link to="/menu" className="lolis-btn lolis-btn-md lolis-btn-pink inline-flex items-center gap-2">
              شوف المنيو كاملاً <UtensilsCrossed size={16} />
            </Link>
          </motion.div>
        ) : (
          <motion.div
            variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {offers.map(offer => <OfferCard key={offer._id} offer={offer} />)}
          </motion.div>
        )}
      </div>
    </div>
  )
}
