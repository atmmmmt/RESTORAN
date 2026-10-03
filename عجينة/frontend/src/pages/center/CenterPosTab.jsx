import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Minus, Trash2, ShoppingBag, Package, EyeOff, Eye, Receipt, Clock, Wallet, TrendingUp, ChefHat, CheckCircle2, Truck, Store, Bike } from 'lucide-react'
import { centerPortalAPI } from '../../services/api'
import Button from '../../components/common/Button'
import PageHeader from '../../components/common/PageHeader'
import CenterShiftPanel from './CenterShiftPanel'
import toast from 'react-hot-toast'

const fmt = (n) => `${Number(n || 0).toLocaleString('ar-SY')} ل.س`

const isImageUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v)

const ORDER_TYPES = [
  { key: 'takeaway', label: 'سفري', Icon: ShoppingBag },
  { key: 'dine_in', label: 'بالمحل', Icon: Store },
  { key: 'delivery', label: 'توصيل', Icon: Bike },
]
const PAYMENTS = [
  { key: 'cash', label: 'نقداً' },
  { key: 'card', label: 'بطاقة' },
  { key: 'unpaid', label: 'آجل' },
]

/**
 * Branch cashier screen — sells from the full restaurant menu (same catalog
 * customers see), not from center.inventory (which only tracks raw-supply
 * deliveries, a completely separate system). A branch can hide items it's
 * sold out of for the day via the "unavailable today" toggle, scoped only
 * to this branch.
 */
export default function CenterPosTab({ onSale }) {
  const [tab, setTab] = useState('new')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [hiddenProducts, setHiddenProducts] = useState([])
  const [hiddenLoading, setHiddenLoading] = useState(false)
  const [category, setCategory] = useState(null)
  const [shiftTick, setShiftTick] = useState(0)
  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState(null)
  const [meta, setMeta] = useState({
    orderType: 'takeaway',
    paymentMethod: 'cash',
    customerName: '',
    customerPhone: '',
    discountType: 'amount',
    discount: 0,
    discountPercent: 0,
    discountReason: '',
  })

  const loadProducts = () => {
    setLoading(true)
    centerPortalAPI.getProducts()
      .then(r => setProducts(r.data.products || []))
      .catch(e => toast.error(e.message || 'تعذر تحميل المنتجات'))
      .finally(() => setLoading(false))
  }

  const loadPosData = async () => {
    try {
      const [o, s] = await Promise.all([
        centerPortalAPI.getPosOrders({ date: 'today' }),
        centerPortalAPI.getPosStats(),
      ])
      setOrders(o.data.orders || [])
      setStats(s.data.stats || null)
    } catch (e) {
      toast.error(e.message || 'تعذر تحميل سجل الكاشير')
    }
  }

  useEffect(() => { loadProducts(); loadPosData() }, [])

  const loadHidden = () => {
    setHiddenLoading(true)
    centerPortalAPI.getUnavailableProducts()
      .then(r => setHiddenProducts(r.data.products || []))
      .catch(e => toast.error(e.message || 'تعذر تحميل القائمة'))
      .finally(() => setHiddenLoading(false))
  }

  const toggleShowHidden = () => {
    setShowHidden(v => !v)
    if (!showHidden) loadHidden()
  }

  const markUnavailable = async (product) => {
    try {
      const res = await centerPortalAPI.toggleProductAvailability(product._id)
      if (res.data.unavailable) {
        setProducts(p => p.filter(x => x._id !== product._id))
        setCart(c => c.filter(i => i.productId !== product._id))
        toast.success('تم إخفاء الصنف من كاشيرك اليوم')
      }
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    }
  }

  const restoreAvailable = async (product) => {
    try {
      const res = await centerPortalAPI.toggleProductAvailability(product._id)
      if (!res.data.unavailable) {
        setHiddenProducts(h => h.filter(x => x._id !== product._id))
        loadProducts()
        toast.success('تم إرجاع الصنف متوفراً')
      }
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    }
  }

  const categories = useMemo(() => {
    const names = new Set()
    products.forEach(p => { if (p.category) names.add(p.category) })
    return [...names].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = products
    if (category) list = list.filter(p => p.category === category)
    if (q) list = list.filter(p => p.name?.toLowerCase().includes(q))
    return list
  }, [products, query, category])

  const addToCart = (product) => {
    setCart(c => {
      const found = c.find(i => i.productId === product._id)
      if (found) {
        return c.map(i => i.productId === product._id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...c, {
        productId: product._id,
        name: product.name,
        unitPrice: product.directPrice || 0,
        quantity: 1,
      }]
    })
  }

  const changeQty = (productId, delta) => setCart(c => c.flatMap(i => {
    if (i.productId !== productId) return [i]
    const next = i.quantity + delta
    if (next < 1) return []
    return [{ ...i, quantity: next }]
  }))

  const removeItem = (productId) => setCart(c => c.filter(i => i.productId !== productId))
  const clearCart = () => { setCart([]); setNotes('') }

  const totalQty = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart])
  const subtotal = useMemo(() => cart.reduce((s, i) => s + (i.unitPrice || 0) * i.quantity, 0), [cart])
  const discountAmount = meta.discountType === 'percent'
    ? Math.round(subtotal * Math.min(Math.max(Number(meta.discountPercent) || 0, 0), 100) / 100)
    : Math.min(Math.max(Number(meta.discount) || 0, 0), subtotal)
  const total = Math.max(subtotal - discountAmount, 0)

  const submit = async () => {
    if (!cart.length) return toast.error('السلة فارغة')
    setSubmitting(true)
    try {
      const res = await centerPortalAPI.recordSale({
        items: cart.map(({ productId, quantity }) => ({ productId, quantity })),
        notes,
        ...meta,
        discount: discountAmount,
        discountPercent: Number(meta.discountPercent) || 0,
      })
      toast.success(res.data.message || 'تم تسجيل البيع')
      if (res.data.totalAmount) {
        toast.success(`الإجمالي: ${fmt(res.data.totalAmount)}`, { duration: 4000 })
      }
      clearCart()
      setMeta(m => ({ ...m, customerName: '', customerPhone: '', discount: 0, discountPercent: 0, discountReason: '' }))
      setShiftTick(t => t + 1)
      await loadPosData()
      onSale?.()
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="الكاشير"
        subtitle="نفس تشغيل الكاشير الإداري — الوردية، البيع، والتصفير ضمن فرعك فقط"
      />

      <CenterShiftPanel tick={shiftTick} onChanged={() => { setShiftTick(t => t + 1); loadPosData() }} />

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
          {[
            { Icon: Receipt, label: 'طلبات اليوم', value: stats.count || 0, color: '#A96734' },
            { Icon: Wallet, label: 'مبيعات اليوم', value: fmt(stats.revenue || 0), color: '#2E7A4A' },
            { Icon: TrendingUp, label: 'ربح اليوم', value: fmt(stats.profit || 0), color: '#4A7A2E' },
            { Icon: ChefHat, label: 'قيد التجهيز', value: stats.preparing || 0, color: '#B8860B' },
            { Icon: CheckCircle2, label: 'جاهز', value: stats.ready || 0, color: '#4A6AB8' },
            { Icon: stats.unpaid > 0 ? Clock : Truck, label: stats.unpaid > 0 ? 'آجل' : 'تم التسليم', value: stats.unpaid > 0 ? fmt(stats.unpaid) : (stats.delivered || 0), color: '#6B5A4A' },
          ].map(({ Icon, label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl p-4 shadow-card flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}1F` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div className="min-w-0"><div className="text-xs text-brand-gray font-bold">{label}</div><div className="font-black text-brand-dark truncate">{value}</div></div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-5">
        {[['new','طلب جديد',Receipt],['log','سجل اليوم',Clock]].map(([key,label,Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${tab===key?'bg-fuchsia text-white shadow-md':'bg-white text-brand-gray shadow-card'}`}>
            <Icon size={15}/>{label}
          </button>
        ))}
      </div>

      {tab === 'new' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Products */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-gray-light" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن صنف…"
                className="w-full pr-11 pl-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white" />
            </div>
            <button onClick={toggleShowHidden}
              className={`flex items-center gap-1.5 px-3 py-3 rounded-xl border-2 font-bold text-xs whitespace-nowrap transition-colors ${
                showHidden ? 'border-fuchsia text-fuchsia bg-fuchsia/5' : 'border-brand-border text-brand-gray bg-white'
              }`}>
              {showHidden ? <Eye size={15} /> : <EyeOff size={15} />}
              الأصناف المخفية
            </button>
          </div>

          {!showHidden && categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setCategory(null)}
                className={`px-3.5 py-2 rounded-xl font-black text-xs transition-colors ${
                  !category ? 'bg-fuchsia text-white' : 'bg-white text-brand-gray border-2 border-brand-border'
                }`}>
                كل التصنيفات
              </button>
              {categories.map(name => (
                <button key={name} onClick={() => setCategory(name)}
                  className={`px-3.5 py-2 rounded-xl font-black text-xs transition-colors ${
                    category === name ? 'bg-fuchsia text-white' : 'bg-white text-brand-gray border-2 border-brand-border'
                  }`}>
                  {name}
                </button>
              ))}
            </div>
          )}

          {showHidden ? (
            <div className="bg-white rounded-2xl shadow-card p-4">
              <h3 className="font-black text-brand-dark text-sm mb-3">الأصناف المخفية اليوم</h3>
              {hiddenLoading ? (
                <div className="text-center py-8 text-brand-gray-light font-bold">جاري التحميل…</div>
              ) : !hiddenProducts.length ? (
                <div className="text-center py-8 text-brand-gray-light font-bold">لا يوجد أصناف مخفية</div>
              ) : (
                <div className="space-y-2">
                  {hiddenProducts.map(p => (
                    <div key={p._id} className="flex items-center justify-between p-3 rounded-xl bg-brand-bg">
                      <span className="font-bold text-brand-dark text-sm">{p.name}</span>
                      <button onClick={() => restoreAvailable(p)}
                        className="text-xs font-bold text-fuchsia hover:text-fuchsia/70 flex items-center gap-1">
                        <Eye size={13} /> إرجاعه متوفر
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map(product => (
                <div key={product._id}
                  className="bg-white rounded-2xl p-4 shadow-card text-right transition-all hover:-translate-y-0.5 hover:shadow-lg relative group">
                  <button onClick={() => markUnavailable(product)} title="غير متوفر اليوم"
                    className="absolute top-2 left-2 w-6 h-6 rounded-lg bg-white/90 border border-brand-border flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-300 z-10">
                    <EyeOff size={12} />
                  </button>
                  <button onClick={() => addToCart(product)} className="w-full text-right">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-2 overflow-hidden"
                      style={{ background: 'rgba(139,69,19,0.1)' }}>
                      {isImageUrl(product.image)
                        ? <img src={product.image} alt="" className="w-full h-full object-cover" />
                        : <Package size={19} style={{ color: '#8B4513' }} />}
                    </div>
                    <div className="font-black text-brand-dark text-sm leading-tight line-clamp-2 mb-1">
                      {product.name}
                    </div>
                    {product.directPrice > 0 && (
                      <div className="font-black text-fuchsia text-sm">{fmt(product.directPrice)}</div>
                    )}
                  </button>
                </div>
              ))}
              {!loading && !filtered.length && (
                <div className="col-span-full bg-white rounded-2xl p-10 text-center shadow-card">
                  <Package size={32} className="mx-auto mb-2 text-brand-gray-light" />
                  <div className="font-black text-brand-gray">
                    {products.length ? 'لا توجد أصناف مطابقة' : 'لا يوجد أصناف متاحة حالياً'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="bg-white rounded-2xl shadow-card p-5 h-fit lg:sticky lg:top-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-brand-dark flex items-center gap-2">
              <ShoppingBag size={17} className="text-fuchsia" /> السلة
              {cart.length > 0 && <span className="text-xs bg-fuchsia text-white px-2 py-0.5 rounded-lg">{cart.length}</span>}
            </h3>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-600 font-bold">تفريغ</button>
            )}
          </div>

          {!cart.length ? (
            <div className="py-10 text-center">
              <ShoppingBag size={30} className="mx-auto mb-2 text-brand-gray-light" />
              <div className="text-sm font-bold text-brand-gray">اضغط على الأصناف لإضافتها</div>
            </div>
          ) : (
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              <AnimatePresence initial={false}>
                {cart.map(item => (
                  <motion.div key={item.productId} layout
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-brand-bg">
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-brand-dark text-sm truncate">{item.name}</div>
                      {item.unitPrice > 0 && (
                        <div className="text-xs text-brand-gray font-bold">{fmt(item.unitPrice)}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => changeQty(item.productId, -1)}
                        className="w-6 h-6 rounded-lg bg-white flex items-center justify-center hover:bg-brand-border transition-colors">
                        <Minus size={12} />
                      </button>
                      <span className="w-7 text-center font-black text-brand-dark text-sm">{item.quantity}</span>
                      <button onClick={() => changeQty(item.productId, 1)}
                        className="w-6 h-6 rounded-lg bg-white flex items-center justify-center hover:bg-brand-border transition-colors">
                        <Plus size={12} />
                      </button>
                    </div>
                    <button onClick={() => removeItem(item.productId)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-3">
            {ORDER_TYPES.map(({key,label,Icon}) => (
              <button key={key} onClick={() => setMeta(m=>({...m,orderType:key}))}
                className={`rounded-xl py-2 text-xs font-black flex items-center justify-center gap-1 border-2 ${meta.orderType===key?'border-fuchsia bg-fuchsia/5 text-fuchsia':'border-brand-border text-brand-gray'}`}>
                <Icon size={13}/>{label}
              </button>
            ))}
          </div>

          <div className="mb-3">
            <div className="text-xs font-bold text-brand-gray mb-2">طريقة الدفع</div>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENTS.map(p => (
                <button key={p.key} onClick={() => setMeta(m=>({...m,paymentMethod:p.key}))}
                  className={`rounded-xl py-2 text-xs font-black border-2 ${meta.paymentMethod===p.key?'border-fuchsia bg-fuchsia/5 text-fuchsia':'border-brand-border text-brand-gray'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <input value={meta.customerName} onChange={e=>setMeta(m=>({...m,customerName:e.target.value}))} placeholder="اسم الزبون" className="px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold text-sm"/>
            <input value={meta.customerPhone} onChange={e=>setMeta(m=>({...m,customerPhone:e.target.value}))} placeholder="الهاتف" className="px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold text-sm"/>
          </div>

          <div className="mb-3 rounded-xl bg-brand-bg p-3">
            <div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-brand-gray">الخصم</span>
              <select value={meta.discountType} onChange={e=>setMeta(m=>({...m,discountType:e.target.value}))} className="text-xs font-bold bg-white border border-brand-border rounded-lg px-2 py-1">
                <option value="amount">مبلغ</option><option value="percent">نسبة %</option>
              </select>
            </div>
            <input type="number" min="0" value={meta.discountType==='percent'?meta.discountPercent:meta.discount}
              onChange={e=>setMeta(m=>({...m,[meta.discountType==='percent'?'discountPercent':'discount']:e.target.value}))}
              className="w-full px-3 py-2 border-2 border-brand-border rounded-xl font-bold text-sm bg-white"/>
          </div>

          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="ملاحظات على البيع (اختياري)"
            className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm mb-3" />

          <div className="space-y-2 py-3 border-t border-brand-border">
            <div className="flex justify-between text-sm">
              <span className="text-brand-gray font-bold">عدد القطع</span>
              <span className="font-black text-brand-dark">{totalQty}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-brand-gray font-bold">المجموع</span><span className="font-black">{fmt(subtotal)}</span></div>
            {discountAmount > 0 && <div className="flex justify-between text-sm text-red-500"><span className="font-bold">الخصم</span><span className="font-black">− {fmt(discountAmount)}</span></div>}
            <div className="flex justify-between pt-2 border-t border-brand-border">
              <span className="font-black text-brand-dark">الإجمالي</span>
              <span className="font-black text-fuchsia text-lg">{fmt(total)}</span>
            </div>
          </div>

          <Button onClick={submit} loading={submitting} disabled={!cart.length} className="w-full mt-3">
            تأكيد البيع
          </Button>
        </div>
      </div>}

      {tab === 'log' && (
        <div className="bg-white rounded-2xl shadow-card overflow-x-auto">
          {!orders.length ? <div className="p-10 text-center font-bold text-brand-gray">لا توجد طلبات اليوم</div> : (
            <table className="w-full min-w-[780px] text-sm">
              <thead><tr className="text-right text-xs text-brand-gray border-b border-brand-border">
                <th className="p-3">الطلب</th><th className="p-3">الوقت</th><th className="p-3">النوع</th><th className="p-3">الدفع</th><th className="p-3">الحالة</th><th className="p-3">الإجمالي</th>
              </tr></thead>
              <tbody>{orders.map(o => (
                <tr key={o._id} className="border-b border-brand-border/60">
                  <td className="p-3 font-black text-brand-dark">{o.orderNumber}</td>
                  <td className="p-3 font-bold text-brand-gray">{new Date(o.createdAt).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</td>
                  <td className="p-3 font-bold">{o.orderType==='dine_in'?'بالمحل':o.orderType==='delivery'?'توصيل':'سفري'}</td>
                  <td className="p-3 font-bold">{o.paymentMethod==='cash'?'نقداً':o.paymentMethod==='card'?'بطاقة':'آجل'}</td>
                  <td className="p-3 font-bold">{o.status==='new'?'جديد':o.status==='preparing'?'قيد التجهيز':o.status==='ready'?'جاهز':o.status==='delivered'?'تم التسليم':'ملغى'}</td>
                  <td className="p-3 font-black text-fuchsia">{fmt(o.total)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
