import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  UtensilsCrossed, Tag, Salad, AlertTriangle, Minus, Plus,
  CheckCircle2, ArrowRight, Share2,
} from 'lucide-react'
import { productsAPI, offersAPI } from '../../services/api'
import { formatCurrency, calcDiscountedPrice } from '../../utils/formatters'
import { VirtualTryOnButton } from '../../features/virtual-try-on'
import { storeVirtualTryOnConfig } from '../../config/virtualTryOn.config'
import WhatsAppIcon from '../../components/common/WhatsAppIcon'

const WA_NUMBER = import.meta.env.VITE_WA_NUMBER || '963XXXXXXXXX'

function NutriBadge({ label, value, unit, chip }) {
  if (!value || value <= 0) return null
  return (
    <div className={`rounded-2xl p-4 text-center ${chip}`}>
      <div className="text-xl font-black lolis-body">{Math.round(value)}<span className="text-xs font-bold">{unit}</span></div>
      <div className="text-xs text-lolis-gray font-medium mt-1 lolis-body">{label}</div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="min-h-screen bg-lolis-bg">
      <div className="container-custom py-8 max-w-4xl">
        <div className="bg-white rounded-4xl overflow-hidden animate-pulse">
          <div className="h-72 lolis-shimmer" />
          <div className="p-8 space-y-4">
            <div className="h-7 lolis-shimmer rounded-xl w-2/3" />
            <div className="h-4 lolis-shimmer rounded-xl" />
            <div className="h-4 lolis-shimmer rounded-xl w-3/4" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProductDetailPage() {
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
    <div className="min-h-screen flex items-center justify-center bg-lolis-bg">
      <div className="text-center">
        <UtensilsCrossed size={48} strokeWidth={1.5} className="mx-auto mb-4 text-lolis-gray-2" />
        <div className="font-black text-lolis-gray text-xl lolis-body">المنتج غير موجود</div>
        <Link to="/menu" className="mt-5 lolis-btn lolis-btn-md lolis-btn-pink inline-flex">
          العودة للمنيو
        </Link>
      </div>
    </div>
  )

  const finalPrice = offer ? calcDiscountedPrice(product.directPrice, offer) : product.directPrice
  const total = finalPrice * qty

  const orderOnWhatsApp = () => {
    setOrdered(true)
    const msg = `مرحباً، أريد الطلب من لوليز\n\nالطلب: ${product.name}\nالكمية: ${qty}\nالإجمالي: ${total.toLocaleString('ar-SY')} ل.س\n\nشكراً`
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank')
    setTimeout(() => setOrdered(false), 3000)
  }

  return (
    <div className="min-h-screen bg-lolis-bg">
      <div className="container-custom py-6 lg:py-10 max-w-5xl">

        {/* Breadcrumb */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-sm font-medium text-lolis-gray mb-6 lolis-body">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 hover:text-lolis-pink transition-colors">
            <ArrowRight size={15} /> رجوع
          </button>
          <span className="text-lolis-gray-2">/</span>
          <Link to="/menu" className="hover:text-lolis-pink transition-colors">المنيو</Link>
          <span className="text-lolis-gray-2">/</span>
          <span className="text-lolis-dark font-black line-clamp-1">{product.name}</span>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-7">

          {/* ── Left: product info ─────────────── */}
          <div className="lg:col-span-3 space-y-5">

            {/* Main card */}
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-4xl overflow-hidden shadow-sm border border-lolis-border">

              {/* Big image area */}
              <div className={`relative overflow-hidden ${product.image?.startsWith('http') ? 'h-64 lg:h-80' : 'bg-lolis-pink-light flex items-center justify-center py-14 lg:py-20'}`}>
                {product.image?.startsWith('http') ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <UtensilsCrossed size={100} strokeWidth={1.25} className="text-lolis-pink/40 select-none" />
                )}

                {offer && (
                  <div className="absolute top-4 right-4">
                    <span className="lolis-badge-offer text-sm px-3 py-1 flex items-center gap-1.5">
                      <Tag size={13} /> {offer.discountType === 'percentage' ? `خصم ${offer.discountValue}%` : 'عرض خاص'}
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
                <h1 className="lolis-heading text-3xl lg:text-4xl text-lolis-dark mb-3">{product.name}</h1>
                {product.description && (
                  <p className="text-lolis-gray font-medium leading-relaxed text-base lolis-body">{product.description}</p>
                )}
              </div>
            </motion.div>

            {/* Nutrition */}
            {product.nutrition && (product.nutrition.calories > 0 || product.nutrition.protein > 0) && (
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
                className="bg-white rounded-3xl p-6 border border-lolis-border shadow-sm">
                <h3 className="font-black text-lolis-dark mb-4 flex items-center gap-2 lolis-body">
                  <Salad size={18} className="text-lolis-mint-dark" /> القيمة الغذائية
                  {product.nutrition.portionSize && (
                    <span className="lolis-chip lolis-chip-gray mr-auto">{product.nutrition.portionSize}</span>
                  )}
                </h3>
                <div className="grid grid-cols-4 gap-3">
                  <NutriBadge label="سعرات"  value={product.nutrition.calories} unit=""  chip="bg-lolis-pink-light text-lolis-pink" />
                  <NutriBadge label="بروتين" value={product.nutrition.protein}  unit="غ" chip="bg-lolis-mint-light text-lolis-mint-dark" />
                  <NutriBadge label="كارب"   value={product.nutrition.carbs}    unit="غ" chip="bg-lolis-yellow-light text-amber-700" />
                  <NutriBadge label="دهون"   value={product.nutrition.fat}      unit="غ" chip="bg-blue-50 text-blue-600" />
                </div>
              </motion.div>
            )}

            {/* Allergy */}
            {product.allergyNotes && (
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
                className="bg-lolis-yellow-light border border-yellow-300 rounded-3xl p-5 flex items-start gap-4">
                <AlertTriangle size={22} className="flex-shrink-0 text-amber-600" strokeWidth={2} />
                <div>
                  <div className="font-black text-amber-700 mb-1 lolis-body">ملاحظات حساسية</div>
                  <div className="text-amber-600 text-sm font-medium leading-relaxed lolis-body">{product.allergyNotes}</div>
                </div>
              </motion.div>
            )}
          </div>

          {/* ── Right: order panel ─────────────── */}
          <div className="lg:col-span-2">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
              className="bg-white rounded-4xl border border-lolis-border p-6 shadow-sm sticky top-24 space-y-5">

              {/* Price */}
              <div className="pb-5 border-b border-lolis-border">
                <div className="text-xs text-lolis-gray font-medium mb-2 lolis-body">السعر</div>
                {offer ? (
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-lolis-gray line-through font-medium text-sm lolis-body">{formatCurrency(product.directPrice)}</span>
                      <span className="lolis-badge-offer">{offer.discountType === 'percentage' ? `${offer.discountValue}% خصم` : 'عرض'}</span>
                    </div>
                    <div className="text-3xl font-black text-lolis-pink lolis-body">{formatCurrency(finalPrice)}</div>
                  </div>
                ) : (
                  <div className="text-3xl font-black text-lolis-pink lolis-body">{formatCurrency(product.directPrice)}</div>
                )}

                {/* Availability */}
                <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold lolis-body ${
                  product.availableQuantity > 0
                    ? 'bg-lolis-mint-light text-lolis-mint-dark'
                    : 'bg-red-50 text-red-500'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${product.availableQuantity > 0 ? 'bg-lolis-mint animate-pulse' : 'bg-red-400'}`} />
                  {product.availableQuantity > 0 ? `متاح — ${product.availableQuantity} وحدة` : 'نفدت الكمية'}
                </div>
              </div>

              {product.availableQuantity > 0 ? (
                <>
                  {/* Qty selector */}
                  <div>
                    <div className="text-xs text-lolis-gray font-medium mb-2 lolis-body">الكمية</div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setQty(q => Math.max(1, q - 1))}
                        className="w-10 h-10 rounded-full bg-lolis-pink-light text-lolis-pink flex items-center justify-center hover:bg-lolis-pink hover:text-white transition-all">
                        <Minus size={16} strokeWidth={2.5} />
                      </button>
                      <span className="text-2xl font-black text-lolis-dark w-8 text-center lolis-body">{qty}</span>
                      <button onClick={() => setQty(q => Math.min(product.availableQuantity, q + 1))}
                        className="w-10 h-10 rounded-full bg-lolis-pink-light text-lolis-pink flex items-center justify-center hover:bg-lolis-pink hover:text-white transition-all">
                        <Plus size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="bg-lolis-bg rounded-2xl p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-lolis-gray lolis-body">الإجمالي</span>
                      <span className="text-xl font-black text-lolis-pink lolis-body">{formatCurrency(total)}</span>
                    </div>
                  </div>

                  {/* WebAR try-on — renders nothing unless this product
                      has a ready 3D model uploaded from the dashboard. */}
                  <VirtualTryOnButton
                    product={product}
                    presetConfig={product.virtualTryOn || undefined}
                    storeConfig={storeVirtualTryOnConfig}
                    formatPrice={formatCurrency}
                    onAddToCart={orderOnWhatsApp}
                    className="mb-3 justify-center"
                  />

                  {/* CTA buttons */}
                  <div className="space-y-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={orderOnWhatsApp}
                      className={`lolis-btn lolis-btn-lg lolis-btn-wa w-full ${ordered ? 'opacity-90' : ''}`}>
                      {ordered
                        ? <><CheckCircle2 size={17} /> تم الإرسال</>
                        : <><WhatsAppIcon size={17} /> اطلب عبر واتساب</>}
                    </motion.button>
                    <Link to="/menu" className="lolis-btn lolis-btn-sm lolis-btn-outline-pink w-full">
                      العودة للمنيو
                    </Link>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <UtensilsCrossed size={36} strokeWidth={1.5} className="mx-auto mb-3 text-lolis-gray-2" />
                  <div className="font-black text-lolis-gray lolis-body">نفدت الكمية</div>
                  <div className="text-xs text-lolis-gray-2 mt-1 lolis-body">تابعونا لمعرفة موعد التوفر</div>
                  <Link to="/menu" className="mt-4 lolis-btn lolis-btn-sm lolis-btn-pink inline-flex">
                    شوف أصناف أخرى
                  </Link>
                </div>
              )}

              {/* Share */}
              <div className="pt-4 border-t border-lolis-border">
                <div className="text-xs text-lolis-gray-2 font-medium text-center lolis-body flex items-center justify-center gap-1.5">
                  <Share2 size={13} /> شاركي هذا الصنف مع صديقاتك
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
