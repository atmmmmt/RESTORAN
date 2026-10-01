import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, Flame, Calendar, UtensilsCrossed, ShoppingCart, ArrowLeft, Tag, Gift } from 'lucide-react'
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

  const TimerIcon = daysLeft <= 0 ? Clock : daysLeft === 1 ? Flame : Calendar
  const timerLabel = daysLeft <= 0
    ? `${hoursLeft} ساعة أخيرة`
    : daysLeft === 1
    ? 'آخر يوم'
    : `${daysLeft} يوم متبقي`

  const timerClass = isUrgent
    ? 'bg-red-50 text-red-500 border border-red-200'
    : daysLeft <= 3
    ? 'bg-lolis-yellow-light text-amber-700 border border-yellow-300'
    : 'bg-lolis-mint-light text-lolis-mint-dark border border-lolis-mint'

  return (
    <motion.div variants={fadeUp} whileHover={{ y: -4 }}>
      <div className="lolis-card flex flex-col h-full bg-white">
        {/* Visual */}
        <div className={`relative flex items-center justify-center py-10 overflow-hidden ${isUrgent ? 'bg-red-50' : 'bg-lolis-yellow-light'}`}>
          {prod?.image?.startsWith('http')
            ? <img src={prod.image} alt={prod.name} className="absolute inset-0 w-full h-full object-cover" />
            : <UtensilsCrossed size={56} strokeWidth={1.25} className="text-lolis-dark/25 select-none" />}

          {/* Discount badge */}
          <div className={`absolute top-4 right-4 font-black text-sm px-4 py-1.5 rounded-full text-white ${
            isUrgent ? 'bg-red-500' : 'bg-lolis-pink'
          }`}>
            {offer.discountType === 'percentage'
              ? `${offer.discountValue}% خصم`
              : `وفّري ${formatCurrency(offer.discountValue)}`}
          </div>

          {/* Timer */}
          <div className={`absolute bottom-4 left-4 text-xs font-bold px-3 py-1.5 rounded-full lolis-body flex items-center gap-1.5 ${timerClass} ${isUrgent ? 'animate-pulse' : ''}`}>
            <TimerIcon size={13} /> {timerLabel}
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
              <ArrowLeft size={18} className="text-lolis-gray-2" />
              <div className="text-right">
                <div className="text-xs text-lolis-mint-dark font-bold lolis-body">بعد الخصم</div>
                <div className="text-xl font-black text-lolis-pink lolis-body">{formatCurrency(discountedPrice)}</div>
              </div>
            </div>
          )}

          {/* CTA */}
          {prod && (
            <Link to={`/menu/${prod._id || prod}`} className="mt-auto lolis-btn lolis-btn-md lolis-btn-pink w-full">
              <ShoppingCart size={15} /> اطلب بسعر العرض
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
              <Tag size={13} /> عروض حصرية محدودة الوقت
            </div>
            <h1 className="lolis-heading text-4xl lg:text-5xl text-lolis-dark mb-2 flex items-center gap-3">
              <Gift size={34} strokeWidth={1.75} /> أحلى العروض
            </h1>
            <p className="text-lolis-dark/65 font-medium lolis-body">
              {offers.length > 0 ? `${offers.length} عرض نشط — لا تفوّتها!` : 'تابعونا لأحدث العروض!'}
            </p>
          </motion.div>
        </div>
        <div className="relative h-10 overflow-hidden">
          <svg viewBox="0 0 1440 40" fill="none" className="absolute bottom-0 w-full">
            <path d="M0 40L60 33C120 27 240 13 360 10C480 7 600 13 720 17C840 20 960 20 1080 17C1200 13 1320 7 1380 3L1440 0V40H0Z" fill="#F6EFE6" />
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
            <Tag size={56} strokeWidth={1.25} className="mx-auto mb-5 text-lolis-gray-2" />
            <h2 className="font-black text-lolis-gray text-2xl mb-2 lolis-body">لا توجد عروض حالياً</h2>
            <p className="text-lolis-gray-2 font-medium text-sm mb-6 lolis-body">تابعونا على واتساب لتصلك أحدث العروض أولاً!</p>
            <Link to="/menu" className="lolis-btn lolis-btn-md lolis-btn-pink inline-flex">
              <UtensilsCrossed size={16} /> شوف المنيو كاملاً
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
