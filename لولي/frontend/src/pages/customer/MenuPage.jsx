import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { UtensilsCrossed, Search, LayoutGrid, X, ShoppingCart, Check } from 'lucide-react'
import { productsAPI } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import { useCart } from '../../context/CartContext'
import toast from 'react-hot-toast'

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.38 } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }

/* ── Product Card ─────────────────────── */
function ProductCard({ p }) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)
  const soldOut = !(p.availableQuantity > 0)

  const handleAdd = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (soldOut) return
    addItem(p, 1)
    toast.success(`أُضيف ${p.name} إلى السلة`)
    setAdded(true)
    setTimeout(() => setAdded(false), 1400)
  }

  return (
    <motion.div variants={fadeUp} layout>
      <Link to={`/menu/${p._id}`} className="group block h-full">
        <div className="lolis-card h-full flex flex-col bg-white">
          {/* Image area */}
          <div className={`relative overflow-hidden rounded-t-3xl ${p.image?.startsWith('http') ? 'h-44' : 'bg-lolis-pink-light flex items-center justify-center py-8'}`}>
            {p.image?.startsWith('http') ? (
              <motion.img
                src={p.image} alt={p.name}
                className="w-full h-full object-cover"
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 280 }}
              />
            ) : (
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 280 }}
                className="text-lolis-pink/40 select-none">
                <UtensilsCrossed size={44} strokeWidth={1.5} />
              </motion.div>
            )}

            <div className="absolute top-3 right-3 flex flex-col gap-1.5">
              {p.activeOffer && <span className="lolis-badge-offer">خصم</span>}
              <span className={p.availableQuantity > 0 ? 'lolis-badge-available' : 'lolis-badge-soldout'}>
                {p.availableQuantity > 0 ? `${p.availableQuantity} متاح` : 'نفدت'}
              </span>
            </div>

            {p.category && (
              <div className="absolute bottom-3 left-3">
                <span className="lolis-chip lolis-chip-pink text-[10px]">{p.category}</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-5 flex flex-col flex-1">
            <h3 className="font-black text-lolis-dark text-base mb-1.5 line-clamp-1 group-hover:text-lolis-pink transition-colors lolis-body">
              {p.name}
            </h3>
            {p.description && (
              <p className="text-lolis-gray text-xs font-medium line-clamp-2 leading-relaxed mb-3 lolis-body">
                {p.description}
              </p>
            )}

            {/* Nutrition chips */}
            {p.nutrition?.calories > 0 && (
              <div className="flex gap-1.5 mb-3 flex-wrap">
                <span className="lolis-chip lolis-chip-pink text-[10px]">{Math.round(p.nutrition.calories)} سعر</span>
                {p.nutrition.protein > 0 && (
                  <span className="lolis-chip lolis-chip-mint text-[10px]">{Math.round(p.nutrition.protein)}غ بروتين</span>
                )}
              </div>
            )}

            {/* Price + CTA */}
            <div className="mt-auto pt-3 border-t border-lolis-border">
              {p.activeOffer ? (
                <div className="mb-2">
                  <span className="text-xs text-lolis-gray-2 line-through lolis-body">{formatCurrency(p.directPrice)}</span>
                  <span className="text-lg font-black text-lolis-pink mr-2 lolis-body">{formatCurrency(p.discountedPrice)}</span>
                </div>
              ) : (
                <div className="text-lg font-black text-lolis-pink mb-2 lolis-body">{formatCurrency(p.directPrice)}</div>
              )}
              <button
                type="button"
                onClick={handleAdd}
                disabled={soldOut}
                className={`lolis-btn lolis-btn-sm w-full ${added ? 'lolis-btn-mint' : 'lolis-btn-pink'} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {added ? <>أُضيفت <Check size={14} /></> : soldOut ? 'نفدت الكمية' : <>أضف للسلة <ShoppingCart size={14} /></>}
              </button>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

/* ── Skeleton ─────────────────────────── */
function SkeletonCard() {
  return (
    <div className="lolis-card bg-white animate-pulse">
      <div className="h-44 lolis-shimmer" />
      <div className="p-5 space-y-3">
        <div className="h-4 lolis-shimmer rounded-xl" />
        <div className="h-3 lolis-shimmer rounded-xl w-3/4" />
        <div className="h-10 lolis-shimmer rounded-full mt-4" />
      </div>
    </div>
  )
}

/* ── Main Page ────────────────────────── */
export default function MenuPage() {
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [activeCat,setActiveCat]= useState('الكل')
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    productsAPI.getPublic().then(r => setProducts(r.data.products || [])).finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() =>
    ['الكل', ...new Set(products.map(p => p.category).filter(Boolean))],
    [products]
  )

  const filtered = useMemo(() => {
    let list = activeCat === 'الكل' ? products : products.filter(p => p.category === activeCat)
    if (search.trim()) list = list.filter(p => p.name.includes(search) || p.description?.includes(search))
    return list
  }, [products, activeCat, search])

  return (
    <div className="min-h-screen bg-lolis-bg">

      {/* ── Page Header ─────────────────── */}
      <div className="bg-lolis-pink">
        <div className="container-custom py-10 lg:py-14">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="lolis-heading text-4xl lg:text-5xl text-white mb-2 flex items-center gap-3">
              <UtensilsCrossed size={34} strokeWidth={1.75} /> منيونا الشهي
            </h1>
            <p className="text-white/80 font-medium lolis-body">
              {products.length > 0 ? `${products.length} صنف طازج — مُحضَّر يومياً بحب` : 'نجهّز لكِ أشهى الوجبات'}
            </p>
          </motion.div>
        </div>
        <div className="relative h-10 overflow-hidden">
          <svg viewBox="0 0 1440 40" fill="none" className="absolute bottom-0 w-full">
            <path d="M0 40L60 33C120 27 240 13 360 10C480 7 600 13 720 17C840 20 960 20 1080 17C1200 13 1320 7 1380 3L1440 0V40H0Z" fill="#F6EFE6" />
          </svg>
        </div>
      </div>

      <div className="container-custom py-8 lg:py-12">
        {/* ── Search ──────────────────── */}
        <div className="relative max-w-sm mb-8">
          <Search size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-lolis-gray-2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحثي عن وجبة..."
            className="lolis-input pr-10"
          />
        </div>

        <div className="flex gap-8">
          {/* ── Desktop Sidebar ──────── */}
          <aside className="hidden lg:block w-48 flex-shrink-0">
            <div className="bg-white rounded-3xl p-5 sticky top-24 shadow-sm border border-lolis-border">
              <h3 className="font-black text-lolis-dark text-sm mb-4 flex items-center gap-2 lolis-body">
                <LayoutGrid size={16} /> التصنيفات
              </h3>
              <div className="space-y-1">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setActiveCat(cat)}
                    className={`w-full text-right px-4 py-2.5 rounded-full font-bold text-sm transition-all lolis-body ${
                      activeCat === cat
                        ? 'bg-lolis-pink text-white'
                        : 'text-lolis-gray hover:bg-lolis-pink-light hover:text-lolis-pink'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* ── Main Content ─────────── */}
          <div className="flex-1 min-w-0">
            {/* Mobile category pills */}
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-6 -mx-1 px-1">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCat(cat)}
                  className={`flex-shrink-0 lolis-btn lolis-btn-sm ${
                    activeCat === cat ? 'lolis-btn-pink' : 'bg-white text-lolis-gray border border-lolis-border hover:border-lolis-pink/40'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Results meta */}
            {!loading && (
              <div className="flex items-center justify-between mb-6">
                <p className="text-lolis-gray text-sm font-medium lolis-body">
                  {filtered.length > 0 ? `${filtered.length} نتيجة` : 'لا نتائج'}
                  {search && ` لـ "${search}"`}
                </p>
                {activeCat !== 'الكل' && (
                  <button onClick={() => setActiveCat('الكل')}
                    className="text-xs lolis-btn lolis-btn-sm lolis-btn-outline-pink">
                    <X size={13} /> مسح الفلتر
                  </button>
                )}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-20">
                <UtensilsCrossed size={48} strokeWidth={1.5} className="mx-auto mb-4 text-lolis-gray-2" />
                <div className="font-black text-lolis-gray text-xl lolis-body">لا توجد وجبات هنا</div>
                <div className="text-lolis-gray-2 text-sm font-medium mt-2 lolis-body">جرّبي تصنيفاً آخر</div>
                <button onClick={() => { setActiveCat('الكل'); setSearch('') }}
                  className="mt-5 lolis-btn lolis-btn-md lolis-btn-pink">
                  عرض الكل
                </button>
              </motion.div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div key={activeCat + search}
                  variants={stagger} initial="hidden" animate="show"
                  className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filtered.map(p => <ProductCard key={p._id} p={p} />)}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
