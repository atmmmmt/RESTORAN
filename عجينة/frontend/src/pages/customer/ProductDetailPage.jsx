import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  UtensilsCrossed, Tag, Salad, AlertTriangle,
  CheckCircle2, MessageCircle, ArrowRight, Share2,
  Activity, PackageX,
} from 'lucide-react'
import { productsAPI, offersAPI } from '../../services/api'
import { formatCurrency, calcDiscountedPrice, isImageUrl } from '../../utils/formatters'
import { VirtualTryOnButton } from '../../features/virtual-try-on'
import { storeVirtualTryOnConfig } from '../../config/virtualTryOn.config'

import { useWaNumber } from '../../hooks/useWaNumber'

function NutriBadge({ label, value, unit, bg, color }) {
  if (!value || value <= 0) return null
  return (
    <div className="rounded-2xl p-4 text-center" style={{ background: bg }}>
      <div className="text-xl font-black lolis-body" style={{ color }}>
        {Math.round(value)}<span className="text-xs font-bold">{unit}</span>
      </div>
      <div className="text-xs font-medium mt-1 lolis-body" style={{ color: '#6B5A4A' }}>{label}</div>
    </div>
  )
}

function Skeleton() {
  const sh = { background: 'linear-gradient(90deg,#EDE0CE 25%,#F6EDDF 50%,#EDE0CE 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.6s infinite' }
  return (
    <div className="min-h-screen" style={{ background: '#FBF7F0' }}>
      <div className="container-custom py-8 max-w-4xl">
        <div className="bg-white rounded-4xl overflow-hidden">
          <div className="h-72" style={sh} />
          <div className="p-8 space-y-4">
            <div className="h-7 rounded-xl w-2/3" style={sh} />
            <div className="h-4 rounded-xl" style={sh} />
            <div className="h-4 rounded-xl w-3/4" style={sh} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Placeholder image SVG ── */
function ProductPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #F6EDDF, #E7D2B7)' }}>
      <svg viewBox="0 0 160 160" fill="none" className="w-32 h-32 opacity-40">
        <circle cx="80" cy="80" r="60" stroke="#A96734" strokeWidth="2" fill="none"/>
        <circle cx="80" cy="80" r="44" stroke="#A96734" strokeWidth="1.5" fill="none" strokeDasharray="4 3"/>
        {/* Fork */}
        <line x1="68" y1="50" x2="68" y2="110" stroke="#A96734" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="64" y1="50" x2="64" y2="68" stroke="#A96734" strokeWidth="2" strokeLinecap="round"/>
        <line x1="68" y1="50" x2="68" y2="68" stroke="#A96734" strokeWidth="2" strokeLinecap="round"/>
        <line x1="72" y1="50" x2="72" y2="68" stroke="#A96734" strokeWidth="2" strokeLinecap="round"/>
        {/* Knife */}
        <line x1="92" y1="50" x2="92" y2="110" stroke="#A96734" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M92 50 C98 55 98 65 92 68" stroke="#A96734" strokeWidth="2" fill="none"/>
      </svg>
    </div>
  )
}

export default function ProductDetailPage() {
  const wa = useWaNumber()
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [offer,   setOffer]   = useState(null)
  const [qty,     setQty]     = useState(1)
  const [loading, setLoading] = useState(true)
  const [ordered, setOrdered] = useState(false)

  useEffect(() => {
    Promise.all([
      productsAPI.getPublicById(id).then(r => setProduct(r.data.product)),
      offersAPI.getPublic().then(r => {
        const active = r.data.offers?.find(o => o.productId?._id === id || o.productId === id)
        setOffer(active || null)
      }),
    ]).finally(() => setLoading(false))
  }, [id])

  if (loading) return <Skeleton />
  if (!product) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#FBF7F0' }}>
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-3xl flex items-center justify-center"
          style={{ background: 'rgba(169,103,52,0.1)' }}>
          <PackageX size={36} style={{ color: '#A96734' }} />
        </div>
        <div className="font-bold text-xl lolis-body" style={{ color: '#6B5A4A' }}>المنتج غير موجود</div>
        <Link to="/menu" className="mt-5 lolis-btn lolis-btn-md inline-flex"
          style={{ background: 'linear-gradient(135deg, #A96734, #6F3E25)', color: '#FBF7F0' }}>
          العودة للمنيو
        </Link>
      </div>
    </div>
  )

  const finalPrice = offer ? calcDiscountedPrice(product.directPrice, offer) : product.directPrice
  const total = finalPrice * qty

  const orderOnWhatsApp = () => {
    setOrdered(true)
    const msg = `مرحباً! أريد الطلب من عجينة وطحينة\n\nالطلب: ${product.name}\nالكمية: ${qty}\nالإجمالي: ${total.toLocaleString('ar-SY')} ل.س\n\nشكراً!`
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank')
    setTimeout(() => setOrdered(false), 3000)
  }

  return (
    <div className="min-h-screen" style={{ background: '#FBF7F0' }}>
      <div className="container-custom py-6 lg:py-10 max-w-5xl">

        {/* Breadcrumb */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-sm font-medium mb-6 lolis-body" style={{ color: '#A09080' }}>
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-1 transition-colors hover:opacity-70">
            <ArrowRight size={14} /> رجوع
          </button>
          <span>/</span>
          <Link to="/menu" className="transition-colors hover:opacity-70" style={{ color: '#A96734' }}>المنيو</Link>
          <span>/</span>
          <span className="font-bold line-clamp-1" style={{ color: '#27201C' }}>{product.name}</span>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-7">

          {/* ── Left: product info ─────────────── */}
          <div className="lg:col-span-3 space-y-5">

            {/* Main card */}
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-4xl overflow-hidden"
              style={{ border: '1px solid rgba(231,210,183,0.6)', boxShadow: '0 2px 20px rgba(53,32,23,0.07)' }}>

              {/* Image */}
              <div className={`relative overflow-hidden ${isImageUrl(product.image) ? 'h-64 lg:h-80' : 'h-56 lg:h-64'}`}>
                {isImageUrl(product.image) ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <ProductPlaceholder />
                )}

                {offer && (
                  <div className="absolute top-4 right-4">
                    <span className="lolis-badge-offer text-sm px-3 py-1 flex items-center gap-1">
                      <Tag size={12} />
                      {offer.discountType === 'percentage' ? `خصم ${offer.discountValue}%` : 'عرض خاص'}
                    </span>
                  </div>
                )}
                {product.category && (
                  <div className="absolute bottom-4 left-4">
                    <span className="lolis-chip lolis-chip-pink">{product.category}</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-6 lg:p-8">
                <h1 className="lolis-heading text-3xl lg:text-4xl mb-3" style={{ color: '#27201C' }}>{product.name}</h1>
                {product.description && (
                  <p className="font-medium leading-relaxed text-base lolis-body" style={{ color: '#6B5A4A' }}>{product.description}</p>
                )}
              </div>
            </motion.div>

            {/* Nutrition */}
            {product.nutrition && (product.nutrition.calories > 0 || product.nutrition.protein > 0) && (
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
                className="bg-white rounded-3xl p-6"
                style={{ border: '1px solid rgba(231,210,183,0.6)', boxShadow: '0 2px 12px rgba(53,32,23,0.05)' }}>
                <h3 className="font-bold mb-4 flex items-center gap-2 lolis-body" style={{ color: '#27201C' }}>
                  <Activity size={18} style={{ color: '#A96734' }} /> القيمة الغذائية
                  {product.nutrition.portionSize && (
                    <span className="lolis-chip lolis-chip-gray mr-auto">{product.nutrition.portionSize}</span>
                  )}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <NutriBadge label="سعرات"  value={product.nutrition.calories} unit=""  bg="#FDF2F4" color="#A96734" />
                  <NutriBadge label="بروتين" value={product.nutrition.protein}  unit="غ" bg="#F0FBF4" color="#2E7A4A" />
                  <NutriBadge label="كارب"   value={product.nutrition.carbs}    unit="غ" bg="#FBF7F0" color="#6F3E25" />
                  <NutriBadge label="دهون"   value={product.nutrition.fat}      unit="غ" bg="#F0F4FF" color="#4A6AB8" />
                  <NutriBadge label="مشبعة" value={product.nutrition.saturatedFat} unit="غ" bg="#FFF8E7" color="#8A5A15" />
                  <NutriBadge label="سكريات" value={product.nutrition.sugars} unit="غ" bg="#FFF0F6" color="#A6426B" />
                  <NutriBadge label="ألياف" value={product.nutrition.fiber} unit="غ" bg="#EFFAF1" color="#39724B" />
                  <NutriBadge label="صوديوم" value={product.nutrition.sodium} unit="ملغ" bg="#EEF5FF" color="#41658A" />
                </div>
                {product.nutrition.basis === 'estimated' && (
                  <p className="mt-4 text-xs font-medium leading-5" style={{ color: '#8A735F' }}>
                    القيم تقديرية للحصة الموضحة وقد تختلف باختلاف حجم القطعة وطريقة التحضير.
                  </p>
                )}
              </motion.div>
            )}

            {/* Allergy */}
            {product.allergyNotes && (
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
                className="rounded-3xl p-5 flex items-start gap-4"
                style={{ background: '#FFFBEB', border: '1px solid #F5D87A' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: '#FEF3C7' }}>
                  <AlertTriangle size={18} style={{ color: '#D97706' }} />
                </div>
                <div>
                  <div className="font-bold mb-1 lolis-body" style={{ color: '#92400E' }}>ملاحظات حساسية</div>
                  <div className="text-sm font-medium leading-relaxed lolis-body" style={{ color: '#B45309' }}>{product.allergyNotes}</div>
                </div>
              </motion.div>
            )}
          </div>

          {/* ── Right: order panel ─────────────── */}
          <div className="lg:col-span-2">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
              className="bg-white rounded-4xl p-6 sticky top-24 space-y-5"
              style={{ border: '1px solid rgba(231,210,183,0.6)', boxShadow: '0 2px 20px rgba(53,32,23,0.07)' }}>

              {/* Price */}
              <div className="pb-5" style={{ borderBottom: '1px solid #E7D2B7' }}>
                <div className="text-xs font-medium mb-2 lolis-body" style={{ color: '#A09080' }}>السعر</div>
                {offer ? (
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="line-through font-medium text-sm lolis-body" style={{ color: '#A09080' }}>{formatCurrency(product.directPrice)}</span>
                      <span className="lolis-badge-offer">{offer.discountType === 'percentage' ? `${offer.discountValue}% خصم` : 'عرض'}</span>
                    </div>
                    <div className="text-3xl font-black lolis-body" style={{ color: '#A96734' }}>{formatCurrency(finalPrice)}</div>
                  </div>
                ) : (
                  <div className="text-3xl font-black lolis-body" style={{ color: '#A96734' }}>{formatCurrency(product.directPrice)}</div>
                )}

                <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold lolis-body ${
                  product.availableQuantity > 0 ? '' : ''
                }`}
                  style={{
                    background: product.availableQuantity > 0 ? 'rgba(46,122,74,0.1)' : 'rgba(239,68,68,0.08)',
                    color: product.availableQuantity > 0 ? '#2E7A4A' : '#DC2626',
                  }}>
                  <span className="w-2 h-2 rounded-full"
                    style={{ background: product.availableQuantity > 0 ? '#2E7A4A' : '#DC2626',
                      animation: product.availableQuantity > 0 ? 'ajPulse 2s infinite' : 'none' }} />
                  {product.availableQuantity > 0 ? `متاح — ${product.availableQuantity} وحدة` : 'نفدت الكمية'}
                </div>
              </div>

              {product.availableQuantity > 0 ? (
                <>
                  {/* Qty selector */}
                  <div>
                    <div className="text-xs font-medium mb-2 lolis-body" style={{ color: '#A09080' }}>الكمية</div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setQty(q => Math.max(1, q - 1))}
                        className="w-10 h-10 rounded-full font-black text-xl flex items-center justify-center transition-all"
                        style={{ background: 'rgba(169,103,52,0.1)', color: '#A96734' }}>
                        −
                      </button>
                      <span className="text-2xl font-black w-8 text-center lolis-body" style={{ color: '#27201C' }}>{qty}</span>
                      <button onClick={() => setQty(q => Math.min(product.availableQuantity, q + 1))}
                        className="w-10 h-10 rounded-full font-black text-xl flex items-center justify-center transition-all"
                        style={{ background: 'rgba(169,103,52,0.1)', color: '#A96734' }}>
                        +
                      </button>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="rounded-2xl p-4" style={{ background: '#FBF7F0' }}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium lolis-body" style={{ color: '#6B5A4A' }}>الإجمالي</span>
                      <span className="text-xl font-black lolis-body" style={{ color: '#A96734' }}>{formatCurrency(total)}</span>
                    </div>
                  </div>

                  {/* WebAR Virtual Try-On — renders nothing unless this
                      product has a ready 3D model. */}
                  <VirtualTryOnButton
                    product={product}
                    presetConfig={product.virtualTryOn || undefined}
                    storeConfig={storeVirtualTryOnConfig}
                    formatPrice={formatCurrency}
                    onAddToCart={orderOnWhatsApp}
                    className="mb-3 justify-center"
                  />

                  {/* CTA */}
                  <div className="space-y-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={orderOnWhatsApp}
                      className={`lolis-btn lolis-btn-lg lolis-btn-wa w-full ${ordered ? 'opacity-90' : ''}`}>
                      {ordered
                        ? <><CheckCircle2 size={18} /> تم الإرسال!</>
                        : <><MessageCircle size={18} /> اطلب عبر واتساب</>
                      }
                    </motion.button>
                    <Link to="/menu" className="lolis-btn lolis-btn-sm w-full"
                      style={{ background: 'transparent', color: '#A96734', border: '1.5px solid #E7D2B7' }}>
                      العودة للمنيو
                    </Link>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(169,103,52,0.08)' }}>
                    <PackageX size={26} style={{ color: '#A96734' }} />
                  </div>
                  <div className="font-bold lolis-body" style={{ color: '#6B5A4A' }}>نفدت الكمية</div>
                  <div className="text-xs mt-1 lolis-body" style={{ color: '#A09080' }}>تابعونا لمعرفة موعد التوفر</div>
                  <Link to="/menu" className="mt-4 lolis-btn lolis-btn-sm inline-flex"
                    style={{ background: 'linear-gradient(135deg, #A96734, #6F3E25)', color: '#FBF7F0' }}>
                    شوف أصناف أخرى
                  </Link>
                </div>
              )}

              {/* Share */}
              <div className="pt-4" style={{ borderTop: '1px solid #E7D2B7' }}>
                <div className="text-xs font-medium text-center flex items-center justify-center gap-1.5 lolis-body"
                  style={{ color: '#A09080' }}>
                  <Share2 size={12} /> شارك هذا الصنف مع أصدقائك
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
