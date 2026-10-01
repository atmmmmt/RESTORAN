import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight, Check, ChevronLeft, Minus, Plus, Search,
  ShoppingBag, Sparkles, UtensilsCrossed, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { productsAPI, categoriesAPI } from '../../services/api'
import { formatCurrency, isImageUrl } from '../../utils/formatters'
import { swr } from '../../utils/cache'

const CART_KEY = 'ajineh_menu_cart'
/* Category pictures and ordering live in the database and are edited at
   /admin/categories. They used to be a map right here, which meant a new
   section on the menu silently rendered with no picture at all until someone
   redeployed the storefront. */

function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') }
  catch { return [] }
}

function MenuImage({ src, alt, className = '' }) {
  const [failed, setFailed] = useState(false)
  return failed || !isImageUrl(src)
    ? <div className={`bg-gradient-to-br from-[#E7D2B7] to-[#F6EDDF] flex items-center justify-center ${className}`}><UtensilsCrossed aria-hidden size={30} className="text-[#A96734]" /></div>
    : <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />
}

function CategoryCard({ name, image, count, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="group relative min-h-[178px] overflow-hidden rounded-[28px] text-right shadow-[0_10px_34px_rgba(53,32,23,.12)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#A96734]/30 active:scale-[.98] transition-transform">
      <MenuImage src={image} alt={`قسم ${name}`} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#24150F]/95 via-[#352017]/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black leading-tight">{name}</h2>
            <p className="mt-1 text-xs font-semibold text-white/75">{count} صنف</p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/16 backdrop-blur-md border border-white/20">
            <ChevronLeft size={20} aria-hidden />
          </span>
        </div>
      </div>
    </button>
  )
}

function ProductRow({ product, quantity, onAdd, onDecrease }) {
  const price = product.discountedPrice ?? product.directPrice
  const available = product.availableQuantity > 0
  return (
    <article className="flex gap-3 rounded-[24px] bg-white p-3 shadow-[0_5px_24px_rgba(53,32,23,.07)] border border-[#E7D2B7]/60">
      <Link to={`/menu/${product._id}`} className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[19px] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#A96734]/30">
        <MenuImage src={product.image} alt={product.name} className="h-full w-full object-cover" />
        {product.activeOffer && <span className="absolute right-2 top-2 rounded-full bg-[#C98279] px-2 py-1 text-[10px] font-black text-white">عرض</span>}
      </Link>
      <div className="min-w-0 flex flex-1 flex-col py-0.5">
        <Link to={`/menu/${product._id}`} className="font-black text-[#27201C] leading-snug line-clamp-2 focus:outline-none focus-visible:underline">{product.name}</Link>
        <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[#6B5A4A]">{product.description || 'محضّر طازجًا عند الطلب.'}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            {product.activeOffer && <div className="text-[10px] font-bold text-[#A09080] line-through">{formatCurrency(product.directPrice)}</div>}
            <div className="text-base font-black tabular-nums text-[#8A472C]">{formatCurrency(price)}</div>
          </div>
          {quantity > 0 ? (
            <div className="flex h-12 items-center gap-1 rounded-2xl bg-[#352017] p-1 text-white" aria-label={`كمية ${product.name}`}>
              <button type="button" onClick={onDecrease} aria-label={`إنقاص ${product.name}`} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 active:bg-white/20"><Minus size={17} /></button>
              <span className="min-w-6 text-center font-black tabular-nums">{quantity}</span>
              <button type="button" onClick={onAdd} aria-label={`زيادة ${product.name}`} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 active:bg-white/20"><Plus size={17} /></button>
            </div>
          ) : (
            <button type="button" onClick={onAdd} disabled={!available}
              className="flex h-12 min-w-[92px] items-center justify-center gap-1.5 rounded-2xl bg-[#A96734] px-4 text-sm font-black text-white shadow-[0_5px_18px_rgba(169,103,52,.28)] active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[#D7C9B7] disabled:shadow-none">
              {available ? <><Plus size={17} /> أضف</> : 'غير متاح'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function CartSheet({ cart, onClose, onChange, onCheckout }) {
  const total = cart.reduce((sum, item) => sum + (item.discountedPrice ?? item.directPrice) * item.quantity, 0)
  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="سلة الطلب">
      <button aria-label="إغلاق السلة" onClick={onClose} className="absolute inset-0 bg-[#1B100B]/55 backdrop-blur-[2px]" />
      <section className="absolute inset-x-0 bottom-0 max-h-[86dvh] overflow-hidden rounded-t-[32px] bg-[#FBF7F0] shadow-2xl lg:left-1/2 lg:right-auto lg:w-[520px] lg:-translate-x-1/2">
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#D8C8B5]" />
        <div className="flex items-center justify-between px-5 pb-4 pt-3">
          <div><h2 className="text-xl font-black text-[#27201C]">سلة طلبك</h2><p className="text-xs font-semibold text-[#7A6855]">راجع الكمية قبل المتابعة</p></div>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#352017] shadow-sm"><X size={21} /></button>
        </div>
        <div className="max-h-[52dvh] space-y-2 overflow-y-auto px-4 pb-4">
          {cart.map(item => (
            <div key={item._id} className="flex items-center gap-3 rounded-2xl bg-white p-3 border border-[#E7D2B7]/60">
              <MenuImage src={item.image} alt="" className="h-14 w-14 rounded-xl object-cover" />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-black text-[#27201C]">{item.name}</div><div className="text-xs font-black text-[#A96734]">{formatCurrency((item.discountedPrice ?? item.directPrice) * item.quantity)}</div></div>
              <div className="flex items-center rounded-xl bg-[#F6EDDF] p-1">
                <button onClick={() => onChange(item, -1)} aria-label={`إنقاص ${item.name}`} className="flex h-10 w-10 items-center justify-center"><Minus size={16} /></button>
                <span className="w-6 text-center font-black">{item.quantity}</span>
                <button onClick={() => onChange(item, 1)} aria-label={`زيادة ${item.name}`} className="flex h-10 w-10 items-center justify-center"><Plus size={16} /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-[#E7D2B7] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
          <div className="mb-3 flex items-center justify-between"><span className="font-bold text-[#6B5A4A]">الإجمالي</span><span className="text-xl font-black tabular-nums text-[#8A472C]">{formatCurrency(total)}</span></div>
          <button onClick={onCheckout} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#352017] px-5 font-black text-white shadow-[0_8px_24px_rgba(53,32,23,.25)] active:scale-[.99]">متابعة الطلب <ArrowRight size={19} /></button>
        </div>
      </section>
    </div>
  )
}

export default function MenuPage() {
  const navigate = useNavigate()
  const topRef = useRef(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState(null)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState(readCart)
  const [cartOpen, setCartOpen] = useState(false)
  const [categories, setCategories] = useState([])

  useEffect(() => {
    swr('public_categories', () => categoriesAPI.getAll().then(r => r.data.categories || []), {
      ttl: 10 * 60 * 1000,
      onUpdate: setCategories,
    }).then(({ data }) => setCategories(data)).catch(() => { /* menu still groups by name */ })
  }, [])

  useEffect(() => {
    swr('public_products', () => productsAPI.getPublic().then(r => r.data.products || []), {
      ttl: 4 * 60 * 1000,
      onUpdate: setProducts,
    }).then(({ data }) => setProducts(data)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)) }, [cart])

  const grouped = useMemo(() => products.reduce((acc, product) => {
    if (!product.category) return acc
    ;(acc[product.category] ||= []).push(product)
    return acc
  }, {}), [products])

  /* Tiles in the admin's order, with anything unregistered appended rather
     than dropped — its products are real either way. */
  const categoryTiles = useMemo(() => {
    const byName = new Map(categories.map(c => [c.name, c]))
    const known = categories
      .filter(c => grouped[c.name]?.length)
      .map(c => ({ name: c.name, image: c.image, items: grouped[c.name] }))
    const extra = Object.keys(grouped)
      .filter(n => !byName.has(n))
      .map(n => ({ name: n, image: '', items: grouped[n] }))
    return [...known, ...extra]
  }, [categories, grouped])

  const visibleProducts = useMemo(() => {
    const base = category ? (grouped[category] || []) : products
    const term = search.trim()
    return term ? base.filter(p => `${p.name} ${p.description || ''}`.includes(term)) : base
  }, [category, grouped, products, search])

  const quantityOf = id => cart.find(i => i._id === id)?.quantity || 0
  const changeCart = (product, delta) => {
    setCart(current => {
      const existing = current.find(i => i._id === product._id)
      const nextQty = Math.max(0, Math.min(product.availableQuantity || 99, (existing?.quantity || 0) + delta))
      if (!nextQty) return current.filter(i => i._id !== product._id)
      return existing
        ? current.map(i => i._id === product._id ? { ...i, quantity: nextQty } : i)
        : [...current, { ...product, quantity: nextQty }]
    })
    if (delta > 0 && !quantityOf(product._id)) toast.success('أُضيف إلى السلة', { icon: <Check size={17} /> })
  }

  const chooseCategory = name => {
    setCategory(name)
    setSearch('')
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const cartTotal = cart.reduce((sum, item) => sum + (item.discountedPrice ?? item.directPrice) * item.quantity, 0)

  return (
    <main ref={topRef} className="min-h-dvh bg-[#FBF7F0] pb-32 text-[#27201C]">
      <header className="overflow-hidden bg-[#352017] text-white">
        <div className="container-custom relative py-8 lg:py-12">
          <div className="absolute -left-16 -top-20 h-52 w-52 rounded-full bg-[#C98279]/20 blur-3xl" />
          <div className="relative flex items-end justify-between gap-4">
            <div><div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-[#F2DCC5]"><Sparkles size={14} /> يُحضّر طازجًا</div><h1 className="text-3xl font-black lg:text-5xl">شو عبالك اليوم؟</h1><p className="mt-2 max-w-xl text-sm font-medium leading-6 text-white/70">اختار القسم، أضف اللي بتحبه للسلة، وكمّل طلبك بخطوات بسيطة.</p></div>
            <div className="hidden h-16 w-16 items-center justify-center rounded-3xl bg-white/10 lg:flex"><UtensilsCrossed size={30} /></div>
          </div>
        </div>
      </header>

      <div className="container-custom py-6 lg:py-8">
        {!category && !search ? (
          <>
            <div className="mb-5"><h2 className="text-xl font-black lg:text-2xl">اختار التصنيف</h2><p className="mt-1 text-sm font-medium text-[#7A6855]">كل شي مرتب لتوصل لطلبك بسرعة</p></div>
            {loading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{Array.from({length:8}).map((_,i)=><div key={i} className="h-[178px] animate-pulse rounded-[28px] bg-[#EADCCB]" />)}</div>
              : <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{categoryTiles.map(t => <CategoryCard key={t.name} name={t.name} image={t.image} count={t.items.length} onClick={() => chooseCategory(t.name)} />)}</div>}
          </>
        ) : (
          <>
            <div className="sticky top-[69px] z-30 -mx-4 mb-5 border-b border-[#E7D2B7]/70 bg-[#FBF7F0]/95 px-4 pb-4 pt-1 backdrop-blur-xl lg:top-[70px] lg:mx-0 lg:rounded-3xl lg:border lg:p-4">
              <div className="flex items-center gap-2">
                <button onClick={() => { setCategory(null); setSearch(''); window.scrollTo({top:0,behavior:'smooth'}) }} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm" aria-label="العودة للتصنيفات"><ArrowRight size={20} /></button>
                <label className="relative flex-1"><span className="sr-only">ابحث في المنيو</span><Search size={19} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8E7967]" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`ابحث${category ? ` ضمن ${category}` : ''}...`} className="h-12 w-full rounded-2xl border border-[#E7D2B7] bg-white pr-11 pl-4 text-base font-semibold outline-none focus:border-[#A96734] focus:ring-4 focus:ring-[#A96734]/10" /></label>
              </div>
              {category && <div className="mt-3 flex items-center justify-between"><div><h2 className="text-xl font-black">{category}</h2><p className="text-xs font-semibold text-[#7A6855]">{visibleProducts.length} صنف متاح</p></div><button onClick={()=>setCategory(null)} className="min-h-11 rounded-xl px-3 text-sm font-black text-[#A96734]">كل التصنيفات</button></div>}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleProducts.map(product => <ProductRow key={product._id} product={product} quantity={quantityOf(product._id)} onAdd={()=>changeCart(product,1)} onDecrease={()=>changeCart(product,-1)} />)}</div>
            {!visibleProducts.length && <div className="py-20 text-center"><Search className="mx-auto mb-3 text-[#B9A58E]" size={38} /><h3 className="font-black">ما لقينا نتيجة</h3><p className="mt-1 text-sm text-[#7A6855]">جرّب كلمة ثانية أو ارجع للتصنيفات</p></div>}
          </>
        )}
      </div>

      {cartCount > 0 && <div className="fixed inset-x-0 bottom-[82px] z-50 px-3 lg:bottom-5"><button onClick={()=>setCartOpen(true)} className="mx-auto flex min-h-16 w-full max-w-xl items-center gap-3 rounded-[22px] bg-[#352017] px-4 text-white shadow-[0_12px_36px_rgba(53,32,23,.35)] active:scale-[.99]"><span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12"><ShoppingBag size={21} /><span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C98279] px-1 text-[10px] font-black">{cartCount}</span></span><span className="flex-1 text-right"><span className="block text-sm font-black">عرض السلة</span><span className="block text-xs font-semibold text-white/65">جاهز تكمل طلبك؟</span></span><span className="text-left font-black tabular-nums">{formatCurrency(cartTotal)}</span><ChevronLeft size={19} /></button></div>}
      {cartOpen && <CartSheet cart={cart} onClose={()=>setCartOpen(false)} onChange={changeCart} onCheckout={()=>navigate('/order')} />}
    </main>
  )
}
