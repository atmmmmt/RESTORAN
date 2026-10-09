import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt, Search, Plus, Minus, Trash2, ShoppingBag, Printer,
  ChefHat, CheckCircle2, Truck, XCircle, Clock, Package,
  Store, Bike, Wallet, RefreshCw, ChevronLeft, ChevronRight, TrendingUp,
  CalendarClock, Zap, LayoutGrid, FileText, Percent, Eye,
} from 'lucide-react'
import { internalOrdersAPI, productsAPI, categoriesAPI, shiftsAPI } from '../../services/api'
import { formatCurrency, isImageUrl } from '../../utils/formatters'
import PageHeader   from '../../components/common/PageHeader'
import Button       from '../../components/common/Button'
import Modal        from '../../components/common/Modal'
import LoadingState from '../../components/common/LoadingState'
import toast from 'react-hot-toast'
import {
  getPrinterSettings, printThermalReceipt, printThermalDailyReport, printKitchenTicket, discountLabel,
} from '../../services/thermalPrinter'
import ShiftPanel from '../../components/pos/ShiftPanel'
import OrderDetailsModal from './OrderDetailsModal'

const STATUS_META = {
  new:       { label: 'جديد',        color: '#4A6AB8', bg: 'rgba(74,106,184,0.12)', Icon: Receipt },
  preparing: { label: 'قيد التجهيز', color: '#B8860B', bg: 'rgba(212,160,23,0.15)', Icon: ChefHat },
  ready:     { label: 'تم التجهيز',  color: '#2E7A4A', bg: 'rgba(46,122,74,0.12)',  Icon: CheckCircle2 },
  delivered: { label: 'تم التسليم',  color: '#6B5A4A', bg: 'rgba(107,90,74,0.12)',  Icon: Truck },
  cancelled: { label: 'ملغى',        color: '#C05050', bg: 'rgba(192,80,80,0.12)',  Icon: XCircle },
}

/* The order a ticket normally walks through. */
const NEXT_STATUS = { new: 'preparing', preparing: 'ready', ready: 'delivered' }

const ORDER_TYPES = [
  { key: 'takeaway', label: 'سفري',   Icon: ShoppingBag },
  { key: 'dine_in',  label: 'بالمحل', Icon: Store },
  { key: 'delivery', label: 'توصيل',  Icon: Bike },
]

const PAYMENTS = [
  { key: 'cash',   label: 'نقداً' },
  { key: 'card',   label: 'بطاقة' },
  { key: 'unpaid', label: 'آجل' },
]

/* Quick picks for a percentage discount — the usual delivery-company cuts. */
const PERCENT_PRESETS = [10, 15, 20, 25]

const hhmm = iso => iso ? new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'
const syriaDayKey = (offsetDays = 0) =>
  new Date(Date.now() + (3 * 60 * 60 * 1000) + (offsetDays * 24 * 60 * 60 * 1000))
    .toISOString().slice(0, 10)

/* ══════════════════════════════════════════════════════════ */
export default function PosPage() {
  const [tab, setTab] = useState('new')          // 'new' | 'log'

  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [query,    setQuery]    = useState('')

  /* The counter picks a section first and its items second — the same way
     the menu board reads, and far fewer buttons on screen at once. */
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)

  const [cart,     setCart]     = useState([])
  const [meta,     setMeta]     = useState({
    customerName: '', customerPhone: '', orderType: 'takeaway',
    paymentMethod: 'cash', discount: 0, notes: '',
    discountType: 'amount', discountPercent: 0, discountReason: '',
    fulfillmentType: 'asap', scheduledFor: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const [orders, setOrders] = useState([])
  const [stats,  setStats]  = useState(null)
  const [ticket, setTicket] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
  /* Bumped after every sale so the shift panel re-reads its live figures. */
  const [shiftTick, setShiftTick] = useState(0)

  const loadProducts = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        productsAPI.getAll(),
        /* A missing categories call must not empty the till: the page falls
           back to the categories named on the products themselves. */
        categoriesAPI.getAll().catch(() => ({ data: { categories: [] } })),
      ])
      setProducts(p.data.products || [])
      setCategories(c.data.categories || [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  const loadOrders = useCallback(async () => {
    try {
      /* 'today' is the working day on the shop's opening hours — the server
         decides it, so a night past midnight stays on one log. */
      const [o, s] = await Promise.all([
        internalOrdersAPI.getAll({ date: 'today' }),
        internalOrdersAPI.todayStats(),
      ])
      setOrders(o.data.orders || [])
      setStats(s.data.stats)
    } catch (e) { toast.error(e.message) }
    setShiftTick(t => t + 1)
  }, [])

  useEffect(() => { loadProducts(); loadOrders() }, [loadProducts, loadOrders])

  /* ── cart ── */
  const addToCart = product => {
    setCart(c => {
      const found = c.find(i => i.productId === product._id)
      if (found) {
        return c.map(i => i.productId === product._id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...c, {
        productId: product._id,
        name: product.name,
        unitPrice: Number(product.directPrice) || 0,
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

  const removeItem = productId => setCart(c => c.filter(i => i.productId !== productId))
  const clearCart  = () => {
    setCart([])
    setMeta(m => ({ ...m, discount: 0, discountPercent: 0, discountReason: '', notes: '' }))
  }

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0), [cart])
  /* Same arithmetic the server does, so the screen and the ticket agree. */
  const discountAmount = meta.discountType === 'percent'
    ? Math.round(subtotal * Math.min(Math.max(Number(meta.discountPercent) || 0, 0), 100) / 100)
    : Math.max(Number(meta.discount) || 0, 0)
  const netTotal = Math.max(subtotal - discountAmount, 0)
  const consumptionTaxAmount = Math.round(netTotal * 0.05 * 100) / 100
  const localAdminAmount = Math.round(consumptionTaxAmount * 0.05 * 100) / 100
  const total = Math.round((netTotal + consumptionTaxAmount + localAdminAmount) * 100) / 100

  const investorDay = useMemo(() => {
    const active = orders.filter(o => o.status !== 'cancelled')
    const internal = active.filter(o => o.orderType === 'dine_in')
    const external = active.filter(o => o.orderType === 'takeaway' || o.orderType === 'delivery')
    const baseOf = o => Number(o.total || 0)
    const sum = list => list.reduce((s, o) => s + baseOf(o), 0)
    const internalBase = sum(internal)
    const externalBase = sum(external)
    return {
      internal: { count: internal.length, base: internalBase, share: Math.round(internalBase * 0.20) },
      external: { count: external.length, base: externalBase, share: Math.round(externalBase * 0.15) },
    }
  }, [orders])

  const submit = async () => {
    if (!cart.length) return toast.error('السلة فارغة')
    if (meta.fulfillmentType === 'scheduled') {
      if (!meta.scheduledFor) return toast.error('اختر موعد الطلب')
      if (new Date(meta.scheduledFor).getTime() < Date.now() - 60000) {
        return toast.error('الموعد في الماضي — اختر وقتاً قادماً')
      }
    }

    setSubmitting(true)
    try {
      const res = await internalOrdersAPI.create({
        items: cart.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })),
        ...meta,
        discount: discountAmount,
        discountPercent: Number(meta.discountPercent) || 0,
        scheduledFor: meta.fulfillmentType === 'scheduled' ? meta.scheduledFor : null,
      })
      toast.success(res.data.message)
      /* Parked offline: there is no saved order to show or print yet. */
      if (res.data.queuedOffline) {
        clearCart()
        return
      }
      setTicket(res.data.order)
      const printer = getPrinterSettings()
      if (printer.enabled) {
        printThermalReceipt(res.data.order)
          .then(result => internalOrdersAPI.printResult(res.data.order._id, { success: true, printerId: result.printerId }))
          .then(() => toast.success('تم إرسال الفاتورة للطابعة'))
          .catch(error => {
            internalOrdersAPI.printResult(res.data.order._id, { success: false }).catch(() => {})
            toast.error(`تم حفظ الطلب، لكن الطابعة غير متاحة: ${error.message}`)
          })
      }
      /* The kitchen's copy goes on its own errand. It is deliberately not
         chained to the receipt: a jam at one printer must not swallow the
         other's ticket, and neither can undo a sale that is already saved. */
      if (printer.kitchen?.enabled) {
        printKitchenTicket(res.data.order)
          .catch(error => toast.error(`تعذّرت طباعة تذكرة المطبخ: ${error.message}`))
      }
      clearCart()
      setMeta(m => ({ ...m, customerName: '', customerPhone: '', fulfillmentType: 'asap', scheduledFor: '' }))
      loadProducts()
      loadOrders()
    } catch (e) { toast.error(e.message) } finally { setSubmitting(false) }
  }

  const advance = async order => {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    try {
      const res = await internalOrdersAPI.setStatus(order._id, next)
      toast.success(res.data.message)
      loadOrders()
    } catch (e) { toast.error(e.message) }
  }

  const cancel = async order => {
    if (!confirm(`إلغاء الطلب ${order.orderNumber}؟ سترجع الكميات للمخزون.`)) return
    try {
      const res = await internalOrdersAPI.setStatus(order._id, 'cancelled')
      toast.success(res.data.message)
      loadOrders(); loadProducts()
    } catch (e) { toast.error(e.message) }
  }

  /* End-of-day printout: every order of today with the investor's share. */
  const [printingDay, setPrintingDay] = useState(false)
  const [reportDate, setReportDate] = useState(syriaDayKey())
  const printDailyReport = async () => {
    setPrintingDay(true)
    try {
      const r = await internalOrdersAPI.dailyReport(reportDate)
      await printThermalDailyReport(r.data)
      toast.success(`تمت طباعة كل طلبات ${reportDate} من 00:00 حتى 23:59`)
    } catch (e) {
      toast.error(e.message || 'تعذّرت طباعة طلبات اليوم')
    } finally { setPrintingDay(false) }
  }

  const printTicket = async () => {
    const printer = getPrinterSettings()
    if (printer.enabled) {
      try {
        const result = await printThermalReceipt(ticket, { duplicate: (ticket.printCount || 0) > 0 })
        await internalOrdersAPI.printResult(ticket._id, { success: true, printerId: result.printerId })
        setTicket(current => ({ ...current, printCount: (current.printCount || 0) + 1, printStatus: 'printed' }))
        toast.success('تم إرسال الفاتورة للطابعة الحرارية')
      } catch (error) {
        await internalOrdersAPI.printResult(ticket._id, { success: false }).catch(() => {})
        toast.error(`تعذرت الطباعة الحرارية: ${error.message}`)
      }
      return
    }
    const node = document.getElementById('pos-ticket')
    if (!node) return
    const w = window.open('', '_blank', 'width=380,height=640')
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
      <title>${ticket.orderNumber}</title>
      <style>
        @page { margin: 6mm }
        body { font-family: Cairo, Tajawal, Arial, sans-serif; padding: 8px; color: #1b1512 }
        .c { text-align: center }
        .logo { width: 88px; height: auto; margin: 0 auto 6px; display: block }
        .rule { border: 0; border-top: 2px solid #1b1512; margin: 8px 0 }
        .dash { border: 0; border-top: 1px dashed #8a7a6d; margin: 8px 0 }
        .box { border: 1.5px solid #1b1512; border-radius: 6px; padding: 8px; margin: 8px 0 }
        table { width: 100%; border-collapse: collapse; margin: 8px 0 }
        td { padding: 4px 0; font-size: 13px }
        .bar { background: #1b1512; color: #fff; border-radius: 6px; padding: 8px 10px;
               display: flex; justify-content: space-between; font-weight: 800; font-size: 16px }
        h2 { margin: 2px 0; font-size: 20px; letter-spacing: .5px }
      </style></head><body>${node.innerHTML}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 350)
  }

  const normalizeCategoryName = value => String(value || 'غير مصنّف').trim().replace(/\s+/g, ' ')

  /* Sections to show on the first screen: the ones with a row of their own,
     plus any name that only exists on the products (nothing is hidden just
     because the category list is out of step with the menu). */
  const sections = useMemo(() => {
    const counts = new Map()
    for (const p of products) {
      const name = normalizeCategoryName(p.category)
      counts.set(name, (counts.get(name) || 0) + 1)
    }
    const known = categories
      .map(c => ({ ...c, normalizedName: normalizeCategoryName(c.name) }))
      .filter(c => counts.has(c.normalizedName))
      .map(c => ({ name: c.normalizedName, image: c.image, count: counts.get(c.normalizedName) }))
    const knownNames = new Set(known.map(c => c.name))
    const extra = [...counts.keys()]
      .filter(name => !knownNames.has(name))
      .map(name => ({ name, image: '', count: counts.get(name) }))
    return [...known, ...extra]
  }, [products, categories])

  /* Searching looks across the whole menu; otherwise you see the section
     you opened. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) return products.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      normalizeCategoryName(p.category).toLowerCase().includes(q)
    )
    if (!activeCategory) return []
    return products.filter(p => normalizeCategoryName(p.category) === activeCategory)
  }, [products, query, activeCategory])

  return (
    <div>
      <PageHeader
        title="طلب داخلي"
        subtitle="سجّل طلبات الكاشير بسرعة — كل المنتجات متاحة دائماً ويتولّد لكل طلب رقم وباركود"
        actions={
          <div className="flex gap-2">
            <Link to="/admin/kitchen">
              <Button size="sm" variant="outline" icon={<ChefHat size={14} />}>شاشة المطبخ</Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={() => { loadProducts(); loadOrders() }} icon={<RefreshCw size={14} />}>
              تحديث
            </Button>
          </div>
        }
      />

      <ShiftPanel tick={shiftTick} onChanged={loadOrders} />

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
          {[
            { Icon: Receipt,      label: 'طلبات اليوم',   value: stats.count,                   color: '#A96734' },
            { Icon: Wallet,       label: 'مبيعات اليوم',  value: formatCurrency(stats.revenue), color: '#2E7A4A' },
            ...(stats.profit !== undefined
              ? [{ Icon: TrendingUp, label: 'ربح اليوم', value: formatCurrency(stats.profit), color: '#4A7A2E' }]
              : []),
            { Icon: ChefHat,      label: 'قيد التجهيز',   value: stats.preparing,               color: '#B8860B' },
            { Icon: CheckCircle2, label: 'جاهز للتسليم',  value: stats.ready,                   color: '#4A6AB8' },
            ...(stats.unpaid > 0
              ? [{ Icon: Clock, label: 'آجل (غير محصّل)', value: formatCurrency(stats.unpaid), color: '#C05050' }]
              : [{ Icon: Truck, label: 'تم التسليم',      value: stats.delivered,               color: '#6B5A4A' }]),
          ].map(({ Icon, label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl p-4 shadow-card flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}1F` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-brand-gray font-bold">{label}</div>
                <div className="font-black text-brand-dark truncate">{value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-5">
        {[['new', 'طلب جديد', Receipt], ['log', 'سجل اليوم', Clock]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${
              tab === key ? 'bg-fuchsia text-white shadow-md' : 'bg-white text-brand-gray hover:text-brand-dark shadow-card'
            }`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ══ NEW ORDER ══ */}
      {tab === 'new' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Products */}
          <div className="lg:col-span-2">
            <div className="relative mb-4">
              <Search size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-gray-light" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن صنف…"
                className="w-full pr-11 pl-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white" />
            </div>

            {/* Where you are: sections, or the section you opened. */}
            {!query.trim() && activeCategory && (
              <button onClick={() => setActiveCategory(null)}
                className="flex items-center gap-1.5 mb-3 px-3 py-2 rounded-xl bg-white shadow-card text-sm font-black text-brand-dark hover:text-fuchsia transition-colors">
                <ChevronRight size={15} /> كل التصنيفات
                <span className="text-brand-gray-light font-bold">/ {activeCategory}</span>
              </button>
            )}

            {loading ? <LoadingState /> : (!query.trim() && !activeCategory) ? (
              /* ── Step one: pick a section ── */
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {sections.map(section => (
                  <button key={section.name} onClick={() => setActiveCategory(section.name)}
                    className="bg-white rounded-2xl p-4 shadow-card text-right transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-2 overflow-hidden"
                      style={{ background: 'rgba(169,103,52,0.1)' }}>
                      {isImageUrl(section.image)
                        ? <img src={section.image} alt="" className="w-full h-full object-cover" />
                        : <LayoutGrid size={20} style={{ color: '#A96734' }} />}
                    </div>
                    <div className="font-black text-brand-dark text-sm leading-tight line-clamp-2">{section.name}</div>
                    <div className="text-xs text-brand-gray-light font-bold mt-0.5">{section.count} صنف</div>
                  </button>
                ))}
                {!sections.length && (
                  <div className="col-span-full bg-white rounded-2xl p-10 text-center shadow-card">
                    <LayoutGrid size={32} className="mx-auto mb-2 text-brand-gray-light" />
                    <div className="font-black text-brand-gray">لا توجد تصنيفات بعد</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filtered.map(p => {
                  return (
                    <button key={p._id} onClick={() => addToCart(p)}
                      className="bg-white rounded-2xl p-4 shadow-card text-right transition-all hover:-translate-y-0.5 hover:shadow-lg">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-2"
                        style={{ background: 'rgba(169,103,52,0.1)' }}>
                        {isImageUrl(p.image)
                          ? <img src={p.image} alt="" className="w-full h-full object-cover rounded-xl" />
                          : <Package size={19} style={{ color: '#A96734' }} />}
                      </div>
                      <div className="font-black text-brand-dark text-sm leading-tight line-clamp-2 mb-1">{p.name}</div>
                      <div className="font-black text-fuchsia text-sm">{formatCurrency(p.directPrice)}</div>
                      <div className="text-xs font-bold mt-0.5 text-green-600">
                        متوفر دائماً
                      </div>
                    </button>
                  )
                })}
                {!filtered.length && (
                  <div className="col-span-full bg-white rounded-2xl p-10 text-center shadow-card">
                    <Package size={32} className="mx-auto mb-2 text-brand-gray-light" />
                    <div className="font-black text-brand-gray">لا توجد أصناف مطابقة</div>
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
                        <div className="text-xs text-brand-gray font-bold">{formatCurrency(item.unitPrice)}</div>
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

            {/* Order type */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {ORDER_TYPES.map(({ key, label, Icon }) => (
                <button key={key} onClick={() => setMeta(m => ({ ...m, orderType: key }))}
                  className={`py-2 rounded-xl text-xs font-black transition-all flex flex-col items-center gap-1 ${
                    meta.orderType === key ? 'bg-fuchsia text-white' : 'bg-brand-bg text-brand-gray hover:text-brand-dark'
                  }`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {/* When is it wanted? */}
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <button onClick={() => setMeta(m => ({ ...m, fulfillmentType: 'asap', scheduledFor: '' }))}
                className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  meta.fulfillmentType === 'asap' ? 'bg-green-600 text-white' : 'bg-brand-bg text-brand-gray hover:text-brand-dark'
                }`}>
                <Zap size={13} /> فوراً
              </button>
              <button
                onClick={() => setMeta(m => ({
                  ...m,
                  fulfillmentType: 'scheduled',
                  // Default to an hour out — the common case, and never in the past.
                  scheduledFor: m.scheduledFor || (() => {
                    const d = new Date(Date.now() + 60 * 60 * 1000)
                    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
                    const p = n => String(n).padStart(2, '0')
                    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
                  })(),
                }))}
                className={`py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  meta.fulfillmentType === 'scheduled' ? 'bg-blue-600 text-white' : 'bg-brand-bg text-brand-gray hover:text-brand-dark'
                }`}>
                <CalendarClock size={13} /> موعد محدد
              </button>
            </div>

            {meta.fulfillmentType === 'scheduled' && (
              <div className="mb-3">
                <input type="datetime-local" value={meta.scheduledFor}
                  onChange={e => setMeta(m => ({ ...m, scheduledFor: e.target.value }))}
                  className="w-full px-3 py-2.5 border-2 rounded-xl focus:outline-none font-bold text-sm"
                  style={{ borderColor: '#5B8DEF' }} />
                <p className="text-[11px] text-brand-gray-light mt-1 font-medium">
                  يظهر بشاشة المطبخ قبل الموعد بـ 90 دقيقة
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {PAYMENTS.map(({ key, label }) => (
                <button key={key} onClick={() => setMeta(m => ({ ...m, paymentMethod: key }))}
                  className={`py-2 rounded-xl text-xs font-black transition-all ${
                    meta.paymentMethod === key ? 'bg-brand-dark text-white' : 'bg-brand-bg text-brand-gray hover:text-brand-dark'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <input value={meta.customerName} onChange={e => setMeta(m => ({ ...m, customerName: e.target.value }))}
                placeholder="اسم الزبون" className="px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
              <input value={meta.customerPhone} onChange={e => setMeta(m => ({ ...m, customerPhone: e.target.value }))}
                placeholder="الهاتف" dir="ltr" className="px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
            </div>

            <input value={meta.notes} onChange={e => setMeta(m => ({ ...m, notes: e.target.value }))}
              placeholder="ملاحظات على الطلب"
              className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm mb-3" />

            {/* Totals */}
            <div className="space-y-2 py-3 border-t border-brand-border">
              <div className="flex justify-between text-sm">
                <span className="text-brand-gray font-bold">المجموع</span>
                <span className="font-black text-brand-dark">{formatCurrency(subtotal)}</span>
              </div>
              {/* Discount: a flat amount, or a percentage of the order (a
                  delivery company's agreed cut, for instance). */}
              <div className="flex justify-between items-center text-sm gap-2">
                <span className="text-brand-gray font-bold">الخصم</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex rounded-lg bg-brand-bg p-0.5">
                    {[['amount', 'ل.س'], ['percent', '%']].map(([key, label]) => (
                      <button key={key} type="button"
                        onClick={() => setMeta(m => ({ ...m, discountType: key, discount: 0, discountPercent: 0 }))}
                        className={`px-2.5 py-1 rounded-md text-xs font-black transition-colors ${
                          meta.discountType === key ? 'bg-brand-dark text-white' : 'text-brand-gray hover:text-brand-dark'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {meta.discountType === 'percent' ? (
                    <div className="relative">
                      <input type="number" min="0" max="100" step="0.5" value={meta.discountPercent}
                        onChange={e => setMeta(m => ({ ...m, discountPercent: e.target.value }))}
                        className="w-20 pl-6 pr-2 py-1 border-2 border-brand-border rounded-lg text-left font-black text-sm focus:border-fuchsia focus:outline-none" />
                      <Percent size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-brand-gray" />
                    </div>
                  ) : (
                    <input type="number" min="0" value={meta.discount}
                      onChange={e => setMeta(m => ({ ...m, discount: e.target.value }))}
                      className="w-24 px-2 py-1 border-2 border-brand-border rounded-lg text-left font-black text-sm focus:border-fuchsia focus:outline-none" />
                  )}
                </div>
              </div>
              {meta.discountType === 'percent' && (
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {PERCENT_PRESETS.map(pct => (
                    <button key={pct} type="button" onClick={() => setMeta(m => ({ ...m, discountPercent: pct }))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors ${
                        Number(meta.discountPercent) === pct ? 'bg-fuchsia text-white' : 'bg-brand-bg text-brand-gray hover:text-brand-dark'
                      }`}>
                      {pct}%
                    </button>
                  ))}
                </div>
              )}
              {discountAmount > 0 && (
                <>
                  <input value={meta.discountReason} maxLength={80}
                    onChange={e => setMeta(m => ({ ...m, discountReason: e.target.value }))}
                    placeholder="سبب الخصم (مثلاً: اسم شركة التوصيل)"
                    className="w-full px-3 py-2 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-xs" />
                  <div className="flex justify-between text-sm">
                    <span className="text-brand-gray font-bold">قيمة الخصم</span>
                    <span className="font-black text-red-500">− {formatCurrency(Math.min(discountAmount, subtotal))}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm"><span className="text-brand-gray font-bold">قيمة المأكولات والمشروبات</span><span className="font-black text-brand-dark">{formatCurrency(netTotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-brand-gray font-bold">إنفاق استهلاكي (5%)</span><span className="font-black text-brand-dark">{formatCurrency(consumptionTaxAmount)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-brand-gray font-bold">إدارة محلية (5%)</span><span className="font-black text-brand-dark">{formatCurrency(localAdminAmount)}</span></div>
              <div className="flex justify-between pt-2 border-t border-brand-border">
                <span className="font-black text-brand-dark">الإجمالي</span>
                <span className="font-black text-fuchsia text-lg">{formatCurrency(total)}</span>
              </div>
            </div>

            <Button onClick={submit} loading={submitting} disabled={!cart.length} className="w-full mt-3">
              تأكيد الطلب
            </Button>
          </div>
        </div>
      )}

      {/* ══ LOG ══ */}
      {tab === 'log' && (
        <div className="space-y-3 pb-24">
          <div className="bg-white rounded-2xl shadow-card p-4 border border-brand-border">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="text-xs font-black text-brand-gray mb-1.5">تاريخ تقرير الطلبات</div>
                <input
                  type="date"
                  value={reportDate}
                  onChange={e => setReportDate(e.target.value)}
                  className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold text-sm focus:border-fuchsia focus:outline-none"
                />
              </div>
              <button type="button" onClick={() => setReportDate(syriaDayKey())}
                className="px-3 py-2 rounded-xl text-xs font-black bg-brand-bg text-brand-gray hover:text-brand-dark">
                اليوم
              </button>
              <button type="button" onClick={() => setReportDate(syriaDayKey(-1))}
                className="px-3 py-2 rounded-xl text-xs font-black bg-brand-bg text-brand-gray hover:text-brand-dark">
                أمس
              </button>
              <Button onClick={printDailyReport} loading={printingDay} icon={<Printer size={16} />}>
                طباعة كل طلبات التاريخ
              </Button>
              <div className="text-xs font-bold text-brand-gray">
                يشمل 00:00–23:59 حتى الطلبات التي تمت قبل فتح الوردية.
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl shadow-card p-4 border border-brand-border">
              <div className="text-xs font-black text-brand-gray">Total بالمحل — شامل الضريبة · 20%</div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div><div className="text-xl font-black text-brand-dark">{formatCurrency(investorDay.internal.base)}</div><div className="text-xs text-brand-gray">{investorDay.internal.count} طلب</div></div>
                <div className="text-left"><div className="text-xs text-brand-gray font-bold">حصة الأميركان</div><div className="font-black text-fuchsia">{formatCurrency(investorDay.internal.share)}</div></div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-card p-4 border border-brand-border">
              <div className="text-xs font-black text-brand-gray">Total سفري / توصيل — شامل الضريبة · 15%</div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div><div className="text-xl font-black text-brand-dark">{formatCurrency(investorDay.external.base)}</div><div className="text-xs text-brand-gray">{investorDay.external.count} طلب</div></div>
                <div className="text-left"><div className="text-xs text-brand-gray font-bold">حصة الأميركان</div><div className="font-black text-fuchsia">{formatCurrency(investorDay.external.share)}</div></div>
              </div>
            </div>
          </div>

          {!orders.length ? (
            <div className="bg-white rounded-2xl p-12 text-center shadow-card">
              <Receipt size={34} className="mx-auto mb-3 text-brand-gray-light" />
              <div className="font-black text-brand-gray">لا توجد طلبات اليوم</div>
            </div>
          ) : orders.map(o => {
            const meta2 = STATUS_META[o.status]
            const next  = NEXT_STATUS[o.status]
            return (
              <div key={o._id} className="bg-white rounded-2xl shadow-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-brand-dark" dir="ltr">{o.orderNumber}</span>
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-black"
                        style={{ background: meta2.bg, color: meta2.color }}>
                        <meta2.Icon size={11} /> {meta2.label}
                      </span>
                      {o.fulfillmentType === 'scheduled' && o.scheduledFor && (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-black"
                          style={{ background: 'rgba(91,141,239,0.14)', color: '#3B6BC9' }}>
                          <CalendarClock size={11} />
                          {new Date(o.scheduledFor).toLocaleString('ar-EG', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-brand-gray font-medium">
                      {hhmm(o.createdAt)} · {o.createdByName || '—'}
                      {o.customerName && ` · ${o.customerName}`}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-black text-fuchsia text-lg">{formatCurrency(o.total)}</div>
                    <div className="text-xs text-brand-gray font-bold">{o.items.length} صنف</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {o.items.map((it, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-lg font-bold bg-brand-bg text-brand-gray">
                      {it.name} × {it.quantity}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setTicket(o)}
                    className="text-xs bg-brand-bg text-brand-gray px-3 py-1.5 rounded-lg font-bold hover:bg-brand-offwhite transition-colors flex items-center gap-1">
                    <FileText size={12} /> الفاتورة
                  </button>
                  <button onClick={() => setSelectedOrder(o)}
                    className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-black hover:bg-blue-100 transition-colors flex items-center gap-1">
                    <Eye size={12} /> عرض / تعديل
                  </button>
                  {next && (
                    <button onClick={() => advance(o)}
                      className="text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors flex items-center gap-1">
                      {STATUS_META[next].label} <ChevronLeft size={12} />
                    </button>
                  )}
                  {o.status !== 'cancelled' && o.status !== 'delivered' && (
                    <button onClick={() => cancel(o)}
                      className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center gap-1">
                      <XCircle size={12} /> إلغاء
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Ticket ── */}
      <OrderDetailsModal
        open={!!selectedOrder}
        order={selectedOrder}
        kind="cashier"
        canEdit={true}
        onClose={() => setSelectedOrder(null)}
        onSaved={() => loadOrders()}
      />

      <Modal open={!!ticket} onClose={() => setTicket(null)} title={`فاتورة ${ticket?.orderNumber || ''}`} size="sm">
        {ticket && (
          <div>
            {/* The same layout the thermal printer draws, so what is on
                screen is what comes out of the printer. */}
            <div id="pos-ticket" style={{ color: '#1b1512' }}>
              <div className="c" style={{ textAlign: 'center' }}>
                <img className="logo" src="/logo.png" alt=""
                  style={{ width: 88, height: 'auto', margin: '0 auto 6px', display: 'block' }} />
                <h2 style={{ margin: '2px 0', fontSize: 20, letterSpacing: '.5px' }}>عجينة وطحينة</h2>
              </div>

              <hr className="rule" style={{ border: 0, borderTop: '2px solid #1b1512', margin: '8px 0' }} />

              <div className="box c" style={{
                border: '1.5px solid #1b1512', borderRadius: 6, padding: 8,
                margin: '8px 0', textAlign: 'center',
              }}>
                <div style={{ fontWeight: 800, fontSize: 16, direction: 'ltr' }}>{ticket.orderNumber}</div>
                <div style={{ fontSize: 12, color: '#6B5A4A', marginTop: 2 }}>
                  {new Date(ticket.createdAt).toLocaleString('ar-EG')}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, marginTop: 2 }}>
                  {ORDER_TYPES.find(t => t.key === ticket.orderType)?.label || ''}
                  {' · '}
                  {PAYMENTS.find(pm => pm.key === ticket.paymentMethod)?.label || ''}
                </div>
              </div>

              {ticket.customerName && (
                <div style={{ fontSize: 13, fontWeight: 800 }}>الزبون: {ticket.customerName}</div>
              )}
              {ticket.fulfillmentType === 'scheduled' && ticket.scheduledFor && (
                <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>
                  موعد التسليم: {new Date(ticket.scheduledFor).toLocaleString('ar-EG', {
                    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              )}

              <hr className="dash" style={{ border: 0, borderTop: '1px dashed #8a7a6d', margin: '8px 0' }} />

              <table style={{ width: '100%', borderCollapse: 'collapse', margin: '8px 0' }}>
                <tbody>
                  {ticket.items.map((it, i) => (
                    <tr key={i}>
                      <td style={{ padding: '4px 0', fontSize: 13, fontWeight: 700 }}>{it.name} × {it.quantity}</td>
                      <td style={{ padding: '4px 0', fontSize: 13, textAlign: 'left' }}>{formatCurrency(it.lineTotal)}</td>
                    </tr>
                  ))}
                  {ticket.discount > 0 && (
                    <>
                      <tr>
                        <td style={{ padding: '4px 0', fontSize: 13 }}>المجموع</td>
                        <td style={{ padding: '4px 0', fontSize: 13, textAlign: 'left' }}>{formatCurrency(ticket.subtotal)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', fontSize: 13 }}>{discountLabel(ticket)}</td>
                        <td style={{ padding: '4px 0', fontSize: 13, textAlign: 'left' }}>−{formatCurrency(ticket.discount)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>

              <div style={{ borderTop: '1px dashed #8a7a6d', paddingTop: 6, marginTop: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>قيمة المأكولات والمشروبات</span><strong>{formatCurrency(ticket.netAmount ?? Math.max((ticket.subtotal || 0) - (ticket.discount || 0), 0))}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span>إنفاق استهلاكي (5%)</span><strong>{formatCurrency(ticket.consumptionTaxAmount || 0)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>إدارة محلية (5%)</span><strong>{formatCurrency(ticket.localAdminAmount || 0)}</strong>
                </div>
              </div>

              <div className="bar" style={{
                background: '#1b1512', color: '#fff', borderRadius: 6, padding: '8px 10px',
                display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16,
              }}>
                <span>الإجمالي</span>
                <span>{formatCurrency(ticket.total)}</span>
              </div>

              {ticket.createdByName && (
                <div style={{ fontSize: 12, color: '#6B5A4A', marginTop: 6 }}>الكاشير: {ticket.createdByName}</div>
              )}

              {ticket.notes && (
                <div className="box" style={{
                  border: '1.5px solid #1b1512', borderRadius: 6, padding: 8, margin: '8px 0', fontSize: 12,
                }}>
                  <span style={{ fontWeight: 800 }}>ملاحظات: </span>
                  <span>{ticket.notes}</span>
                </div>
              )}

              <hr className="rule" style={{ border: 0, borderTop: '2px solid #1b1512', margin: '8px 0' }} />
              <div className="c" style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>شكراً لزيارتكم</div>
                <div style={{ fontSize: 12, color: '#6B5A4A', fontWeight: 700 }}>منكبر بمحبتكم</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>✦ ✦ ✦</div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <Button onClick={printTicket} className="flex-1" icon={<Printer size={15} />}>طباعة</Button>
              <Button variant="ghost" onClick={() => setTicket(null)}>إغلاق</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
