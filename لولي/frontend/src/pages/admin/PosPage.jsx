import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt, Search, Plus, Minus, Trash2, ShoppingBag, Printer,
  ChefHat, CheckCircle2, Truck, XCircle, Clock, QrCode, Package,
  Store, Bike, Wallet, RefreshCw, ChevronLeft, TrendingUp,
  CalendarClock, Zap, Radar, Eye,
} from 'lucide-react'
import { internalOrdersAPI, productsAPI, printerAPI } from '../../services/api'
import { formatCurrency, isImageUrl, formatShopDateTime, formatShopTime } from '../../utils/formatters'
import { renderCashierTicket, renderKitchenTicket, renderDailyReport } from '../../utils/ticketRenderer'
import { printToStation, getPrinterSettings } from '../../utils/printTicket'
import PageHeader   from '../../components/common/PageHeader'
import Button       from '../../components/common/Button'
import Modal        from '../../components/common/Modal'
import LoadingState from '../../components/common/LoadingState'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import ShiftPanel from '../../components/pos/ShiftPanel'
import OrderDetailsModal from './OrderDetailsModal'

const STATUS_META = {
  new:       { label: 'جديد',        color: '#4A6AB8', bg: 'rgba(74,106,184,0.12)', Icon: Receipt },
  preparing: { label: 'قيد التجهيز', color: '#E09810', bg: 'rgba(246,185,26,0.15)', Icon: ChefHat },
  ready:     { label: 'تم التجهيز',  color: '#2E7A4A', bg: 'rgba(46,122,74,0.12)',  Icon: CheckCircle2 },
  delivered: { label: 'تم التسليم',  color: '#7A6855', bg: 'rgba(107,90,74,0.12)',  Icon: Truck },
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

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const hhmm = iso => iso ? formatShopTime(iso) : '—'

/* ══════════════════════════════════════════════════════════ */
export default function PosPage() {
  const [tab, setTab] = useState('new')          // 'new' | 'log'

  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [query,    setQuery]    = useState('')

  const [cart,     setCart]     = useState([])
  const [meta,     setMeta]     = useState({
    customerName: '', customerPhone: '', orderType: 'takeaway',
    paymentMethod: 'cash', discount: 0, notes: '',
    fulfillmentType: 'asap', scheduledFor: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const [orders, setOrders] = useState([])
  const [stats,  setStats]  = useState(null)
  const [ticket, setTicket] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [testingPrinter, setTestingPrinter] = useState(false)
  const [shiftTick, setShiftTick] = useState(0)

  const testPrinter = async () => {
    setTestingPrinter(true)
    try {
      const r = await printerAPI.test('cashier')
      r.data.open ? toast.success(r.data.message) : toast.error(r.data.message)
    } catch (e) { toast.error(e.message || 'تعذّر اختبار الطابعة') }
    finally { setTestingPrinter(false) }
  }

  const loadProducts = useCallback(async () => {
    try {
      const res = await productsAPI.getAll()
      setProducts(res.data.products || [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  const loadOrders = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([
        internalOrdersAPI.getAll({ date: todayKey() }),
        internalOrdersAPI.todayStats(),
      ])
      setOrders(o.data.orders || [])
      setStats(s.data.stats)
      setShiftTick(t => t + 1)
    } catch (e) { toast.error(e.message) }
  }, [])

  useEffect(() => { loadProducts(); loadOrders() }, [loadProducts, loadOrders])

  /* ── cart ──
     A tap always adds the plain item — no popup in the way. Any modifiers
     the product offers are picked afterwards, inline, right on that cart
     row (see the checkboxes under each line below). Two rows of the same
     product can end up with different modifiers ticked, so they'd ring up
     at different prices and can't share one row — `lineKey` keys each row
     by product + the exact set of modifiers currently chosen for it. */
  const addToCart = product => {
    if (product.availableQuantity <= 0) return toast.error(`"${product.name}" غير متوفر حالياً`)
    const lineKey = `${product._id}__`

    setCart(c => {
      const found = c.find(i => i.lineKey === lineKey)
      if (found) {
        if (found.quantity >= product.availableQuantity) {
          toast.error(`المتاح ${product.availableQuantity} فقط`)
          return c
        }
        return c.map(i => i.lineKey === lineKey ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...c, {
        lineKey, productId: product._id, name: product.name,
        basePrice: product.directPrice || 0, unitPrice: product.directPrice || 0,
        quantity: 1, max: product.availableQuantity, modifiers: [],
        availableModifiers: (product.modifiers || []).filter(m => m.isActive),
      }]
    })
  }

  /* Toggling a modifier on a cart row recomputes that row's price from its
     base and re-keys it — if that new combination matches a row that's
     already there (picked separately, or reached via a different toggle
     order), the two merge instead of sitting side by side. */
  const toggleCartModifier = (lineKey, modifier) => setCart(c => {
    const line = c.find(i => i.lineKey === lineKey)
    if (!line) return c

    const isSelected = line.modifiers.some(m => m.id === modifier._id)
    const nextModifiers = isSelected
      ? line.modifiers.filter(m => m.id !== modifier._id)
      : [...line.modifiers, { id: modifier._id, name: modifier.name, priceDelta: modifier.priceDelta || 0 }]

    const nextLineKey = `${line.productId}__${nextModifiers.map(m => m.id).sort().join(',')}`
    const nextUnitPrice = Math.max(0, line.basePrice + nextModifiers.reduce((s, m) => s + m.priceDelta, 0))

    const existingTarget = c.find(i => i !== line && i.lineKey === nextLineKey)
    if (existingTarget) {
      return c
        .filter(i => i !== line)
        .map(i => i === existingTarget ? { ...i, quantity: i.quantity + line.quantity } : i)
    }
    return c.map(i => i === line ? { ...line, modifiers: nextModifiers, lineKey: nextLineKey, unitPrice: nextUnitPrice } : i)
  })

  const changeQty = (lineKey, delta) => setCart(c => c.flatMap(i => {
    if (i.lineKey !== lineKey) return [i]
    const next = i.quantity + delta
    if (next < 1) return []
    if (next > i.max) { toast.error(`المتاح ${i.max} فقط`); return [i] }
    return [{ ...i, quantity: next }]
  }))

  const removeItem = lineKey => setCart(c => c.filter(i => i.lineKey !== lineKey))
  const clearCart  = () => { setCart([]); setMeta(m => ({ ...m, discount: 0, notes: '' })) }

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0), [cart])
  const netTotal = Math.max(subtotal - (Number(meta.discount) || 0), 0)
  const consumptionTaxAmount = Math.round(netTotal * 0.05 * 100) / 100
  const localAdminAmount = Math.round(consumptionTaxAmount * 0.05 * 100) / 100
  const total = Math.round((netTotal + consumptionTaxAmount + localAdminAmount) * 100) / 100

  const investorDay = useMemo(() => {
    const active = orders.filter(o => o.status !== 'cancelled')
    const internal = active.filter(o => o.orderType !== 'delivery')
    const external = active.filter(o => o.orderType === 'delivery')
    const baseOf = o => Number(o.netAmount ?? Math.max((Number(o.total) || 0) - (Number(o.invoiceTaxAmount) || 0), 0))
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
        items: cart.map(({ productId, quantity, modifiers }) => ({
          productId, quantity, modifierIds: modifiers.map(m => m.id),
        })),
        ...meta,
        discount: Number(meta.discount) || 0,
        scheduledFor: meta.fulfillmentType === 'scheduled' ? meta.scheduledFor : null,
      })
      toast.success(res.data.message)
      setTicket(res.data.order)
      /* Auto-print per the dashboard setting: receipt only, or receipt then kitchen. */
      getPrinterSettings().then(s => {
        if (s.autoPrint === 'cashier') runPrint('cashier', ['cashier'], res.data.order)
        else if (s.autoPrint === 'both') runPrint('both', ['cashier', 'kitchen'], res.data.order)
      }).catch(() => {})
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

  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  /* End-of-day printout: every order of today with الأميركان's share. */
  const [printingDay, setPrintingDay] = useState(false)
  const printDailyReport = async () => {
    setPrintingDay(true)
    try {
      const r = await internalOrdersAPI.dailyReport(todayKey())
      const raster = await renderDailyReport(r.data)
      toast.success(await printToStation('cashier', raster))
    } catch (e) {
      toast.error(e.message || 'تعذّرت طباعة طلبات اليوم')
    } finally { setPrintingDay(false) }
  }

  const removeOrder = async order => {
    if (!confirm(`حذف الطلب ${order.orderNumber} نهائياً؟ سترجع الكميات للمخزون ويُعكس المبلغ من الكاش.`)) return
    try {
      const res = await internalOrdersAPI.remove(order._id)
      toast.success(res.data.message)
      loadOrders(); loadProducts()
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

  /* Two tickets per order: the cashier's receipt (prices, total, QR) and a
     kitchen ticket (big item names + quantities + notes, no prices). Both go
     through the browser print dialog, so each can be sent to whichever
     printer is chosen there — with a single printer, both simply come out of
     it one after the other. Sized for 80mm thermal paper. */
  const printHtml = (title, body) => new Promise(resolve => {
    const w = window.open('', '_blank', 'width=380,height=640')
    if (!w) { toast.error('المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة'); return resolve() }
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
      <title>${title}</title>
      <style>
        @page { size: 80mm auto; margin: 3mm }
        * { box-sizing: border-box }
        body { width: 74mm; margin: 0 auto; font-family: Tajawal, Arial, sans-serif; color: #000 }
        .c { text-align: center }
        table { width: 100%; border-collapse: collapse; margin: 8px 0 }
        td { padding: 4px 0; font-size: 13px; vertical-align: top }
        img { width: 120px; height: 120px }
        h2 { margin: 4px 0 }
        .k-head { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px }
        .k-title { font-size: 20px; font-weight: 900 }
        .k-num { font-size: 26px; font-weight: 900; direction: ltr }
        .k-meta { font-size: 13px; font-weight: 700 }
        .k-item td { font-size: 17px; font-weight: 800; padding: 6px 0; border-bottom: 1px dashed #999 }
        .k-qty { width: 48px; text-align: center; font-size: 20px !important }
        .k-notes { margin-top: 8px; padding: 6px; border: 2px solid #000; font-size: 15px; font-weight: 800 }
      </style></head><body>${body}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close(); resolve() }, 350)
  })

  const ORDER_TYPE_LABEL = Object.fromEntries(ORDER_TYPES.map(t => [t.key, t.label]))

  const kitchenTicketHtml = t => {
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const time = formatShopTime(t.createdAt)
    const when = t.fulfillmentType === 'scheduled' && t.scheduledFor
      ? `موعد التسليم: ${formatShopDateTime(t.scheduledFor)}`
      : 'فوري'
    return `
      <div class="k-head">
        <div class="k-title">🍳 طلب مطبخ</div>
        <div class="k-num">${esc(t.orderNumber)}</div>
        <div class="k-meta">${esc(ORDER_TYPE_LABEL[t.orderType] || '')} · ${time}</div>
        <div class="k-meta">${esc(when)}</div>
        ${t.customerName ? `<div class="k-meta">الزبون: ${esc(t.customerName)}</div>` : ''}
      </div>
      <table><tbody>
        ${t.items.map(it => {
          const modNames = (it.modifiers || []).map(m => m.name).join('، ')
          return `<tr class="k-item"><td class="k-qty">${it.quantity}×</td><td>${esc(it.name)}${modNames ? `<br><small>⤷ ${esc(modNames)}</small>` : ''}</td></tr>`
        }).join('')}
      </tbody></table>
      ${t.notes ? `<div class="k-notes">ملاحظات: ${esc(t.notes)}</div>` : ''}`
  }

  /* Browser-dialog fallback — for when no network printer is configured. */
  const browserPrintCashier = () => {
    const node = document.getElementById('pos-ticket')
    if (node) return printHtml(ticket.orderNumber, node.innerHTML)
  }
  const browserPrintKitchen = () => printHtml(`مطبخ ${ticket.orderNumber}`, kitchenTicketHtml(ticket))

  /* Direct printing: the ticket is rendered to an image here and sent to the
     station's network printer (IP from Settings) — no dialog, no driver. */
  const [printing, setPrinting] = useState(null) // 'cashier' | 'kitchen' | 'both' | null
  const sendToPrinter = async (station, order) => {
    const raster = station === 'kitchen' ? await renderKitchenTicket(order) : await renderCashierTicket(order)
    toast.success(await printToStation(station, raster))
  }
  const runPrint = async (key, stations, order = ticket) => {
    setPrinting(key)
    try {
      for (const [i, s] of stations.entries()) {
        if (i > 0) await new Promise(r => setTimeout(r, 1200)) // let the printer finish the previous ticket
        await sendToPrinter(s, order)
      }
    } catch (e) {
      toast.error(e.message || 'تعذّرت الطباعة')
    } finally { setPrinting(null) }
  }
  const printCashier = () => runPrint('cashier', ['cashier'])
  const printKitchen = () => runPrint('kitchen', ['kitchen'])
  const printBoth    = () => runPrint('both', ['cashier', 'kitchen'])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? products.filter(p => p.name?.toLowerCase().includes(q)) : products
  }, [products, query])

  return (
    <div>
      <PageHeader
        title="طلب داخلي"
        subtitle="سجّل طلبات الكاشير — تُخصم من المخزون وتتولّد بأرقام وباركود"
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
            { Icon: Receipt,      label: 'طلبات اليوم',   value: stats.count,                   color: '#C18A4A' },
            { Icon: Wallet,       label: 'مبيعات اليوم',  value: formatCurrency(stats.revenue), color: '#2E7A4A' },
            { Icon: TrendingUp,   label: 'ربح اليوم',     value: formatCurrency(stats.profit),  color: '#4A7A2E' },
            { Icon: ChefHat,      label: 'قيد التجهيز',   value: stats.preparing,               color: '#E09810' },
            { Icon: CheckCircle2, label: 'جاهز للتسليم',  value: stats.ready,                   color: '#4A6AB8' },
            ...(stats.unpaid > 0
              ? [{ Icon: Clock, label: 'آجل (غير محصّل)', value: formatCurrency(stats.unpaid), color: '#C05050' }]
              : [{ Icon: Truck, label: 'تم التسليم',      value: stats.delivered,               color: '#7A6855' }]),
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

            {loading ? <LoadingState /> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filtered.map(p => {
                  const out = p.availableQuantity <= 0
                  return (
                    <button key={p._id} onClick={() => addToCart(p)} disabled={out}
                      className={`bg-white rounded-2xl p-4 shadow-card text-right transition-all ${
                        out ? 'opacity-45 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-lg'
                      }`}>
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-2"
                        style={{ background: 'rgba(169,103,52,0.1)' }}>
                        {isImageUrl(p.image)
                          ? <img src={p.image} alt="" className="w-full h-full object-cover rounded-xl" />
                          : <Package size={19} style={{ color: '#C18A4A' }} />}
                      </div>
                      <div className="font-black text-brand-dark text-sm leading-tight line-clamp-2 mb-1">{p.name}</div>
                      <div className="font-black text-fuchsia text-sm">{formatCurrency(p.directPrice)}</div>
                      <div className={`text-xs font-bold mt-0.5 ${out ? 'text-red-500' : 'text-brand-gray-light'}`}>
                        {out ? 'غير متوفر' : `متاح ${p.availableQuantity}`}
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
                    <motion.div key={item.lineKey} layout
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="p-2.5 rounded-xl bg-brand-bg">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-brand-dark text-sm truncate">{item.name}</div>
                          {item.modifiers.length > 0 && (
                            <div className="text-[11px] text-fuchsia font-bold truncate">
                              {item.modifiers.map(m => m.name).join('، ')}
                            </div>
                          )}
                          <div className="text-xs text-brand-gray font-bold">{formatCurrency(item.unitPrice)}</div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => changeQty(item.lineKey, -1)}
                            className="w-6 h-6 rounded-lg bg-white flex items-center justify-center hover:bg-brand-border transition-colors">
                            <Minus size={12} />
                          </button>
                          <span className="w-7 text-center font-black text-brand-dark text-sm">{item.quantity}</span>
                          <button onClick={() => changeQty(item.lineKey, 1)}
                            className="w-6 h-6 rounded-lg bg-white flex items-center justify-center hover:bg-brand-border transition-colors">
                            <Plus size={12} />
                          </button>
                        </div>
                        <button onClick={() => removeItem(item.lineKey)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Modifiers for this line — picked right here, no popup. */}
                      {item.availableModifiers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-brand-border">
                          {item.availableModifiers.map(m => {
                            const checked = item.modifiers.some(sel => sel.id === m._id)
                            return (
                              <button key={m._id} onClick={() => toggleCartModifier(item.lineKey, m)}
                                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                                  checked ? 'bg-fuchsia text-white border-fuchsia' : 'bg-white text-brand-gray border-brand-border hover:border-fuchsia'
                                }`}>
                                {m.name} {m.priceDelta !== 0 && `(${m.priceDelta > 0 ? '+' : ''}${formatCurrency(m.priceDelta)})`}
                              </button>
                            )
                          })}
                        </div>
                      )}
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
                {/* One tap for the usual "for tomorrow" — then adjust the time. */}
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {[['اليوم', 0], ['بكرا', 1], ['بعد بكرا', 2]].map(([label, days]) => {
                    const pad = n => String(n).padStart(2, '0')
                    const time = meta.scheduledFor?.slice(11, 16) || '13:00'
                    const d = new Date(); d.setDate(d.getDate() + days)
                    const value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}`
                    const active = meta.scheduledFor?.slice(0, 10) === value.slice(0, 10)
                    return (
                      <button key={label} type="button" onClick={() => setMeta(m => ({ ...m, scheduledFor: value }))}
                        className={`py-2 rounded-xl text-xs font-black transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-brand-bg text-brand-gray hover:text-brand-dark'}`}>
                        {label}
                      </button>
                    )
                  })}
                </div>
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
                placeholder="اسم الزبون (اختياري)" className="px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
              <input value={meta.customerPhone} onChange={e => setMeta(m => ({ ...m, customerPhone: e.target.value }))}
                placeholder="الهاتف (اختياري)" dir="rtl" className="px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
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
              <div className="flex justify-between items-center text-sm">
                <span className="text-brand-gray font-bold">الخصم</span>
                <input type="number" min="0" value={meta.discount}
                  onChange={e => setMeta(m => ({ ...m, discount: e.target.value }))}
                  className="w-24 px-2 py-1 border-2 border-brand-border rounded-lg text-left font-black text-sm focus:border-fuchsia focus:outline-none" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-gray font-bold">قيمة المأكولات والمشروبات</span>
                <span className="font-black text-brand-dark">{formatCurrency(netTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-gray font-bold">إنفاق استهلاكي (5%)</span>
                <span className="font-black text-brand-dark">{formatCurrency(consumptionTaxAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-gray font-bold">إدارة محلية (5%)</span>
                <span className="font-black text-brand-dark">{formatCurrency(localAdminAmount)}</span>
              </div>
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
          {/* Floating end-of-day print button */}
          <button type="button" onClick={printDailyReport} disabled={printingDay}
            className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-5 py-3.5 rounded-2xl font-black text-sm text-white shadow-2xl transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #2b1a10, #6A4422)' }}>
            <Printer size={18} /> {printingDay ? 'جاري الطباعة…' : 'طباعة طلبات اليوم'}
          </button>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl shadow-card p-4 border border-brand-border">
              <div className="text-xs font-black text-brand-gray">الداخلي — 20%</div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div><div className="text-xl font-black text-brand-dark">{formatCurrency(investorDay.internal.base)}</div><div className="text-xs text-brand-gray">{investorDay.internal.count} طلب</div></div>
                <div className="text-left"><div className="text-xs text-brand-gray font-bold">حصة الأميركان</div><div className="font-black text-fuchsia">{formatCurrency(investorDay.internal.share)}</div></div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-card p-4 border border-brand-border">
              <div className="text-xs font-black text-brand-gray">الخارجي / التوصيل — 15%</div>
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
                          {formatShopDateTime(o.scheduledFor)}
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
                      {it.name}{it.modifiers?.length > 0 ? ` (${it.modifiers.map(m => m.name).join('، ')})` : ''} × {it.quantity}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setTicket(o)}
                    className="text-xs bg-brand-bg text-brand-gray px-3 py-1.5 rounded-lg font-bold hover:bg-brand-offwhite transition-colors flex items-center gap-1">
                    <QrCode size={12} /> الفاتورة
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
                  {isAdmin && (
                    <button onClick={() => removeOrder(o)}
                      className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-600 transition-colors flex items-center gap-1">
                      <Trash2 size={12} /> حذف
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
            <div id="pos-ticket">
              <div className="c" style={{ textAlign: 'center' }}>
                <h2 style={{ margin: '4px 0' }}>لوليز</h2>
                <div style={{ fontSize: 12, color: '#7A6855' }}>فاتورة طلب داخلي</div>
                <div style={{ fontWeight: 800, marginTop: 6, direction: 'ltr' }}>{ticket.orderNumber}</div>
                <div style={{ fontSize: 12, color: '#7A6855' }}>
                  {formatShopDateTime(ticket.createdAt)}
                </div>
                {ticket.fulfillmentType === 'scheduled' && ticket.scheduledFor && (
                  <div style={{ fontWeight: 800, marginTop: 6, padding: '4px 0', borderTop: '1px dashed #999', borderBottom: '1px dashed #999' }}>
                    موعد التسليم: {formatShopDateTime(ticket.scheduledFor)}
                  </div>
                )}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0' }}>
                <tbody>
                  {ticket.items.map((it, i) => (
                    <tr key={i}>
                      <td style={{ padding: '4px 0', fontSize: 13 }}>
                        {it.name} × {it.quantity}
                        {it.modifiers?.length > 0 && (
                          <div style={{ fontSize: 11, color: '#7A6855' }}>{it.modifiers.map(m => m.name).join('، ')}</div>
                        )}
                      </td>
                      <td style={{ padding: '4px 0', fontSize: 13, textAlign: 'left' }}>{formatCurrency(it.lineTotal)}</td>
                    </tr>
                  ))}
                  {ticket.discount > 0 && (
                    <tr>
                      <td style={{ padding: '4px 0', fontSize: 13 }}>الخصم</td>
                      <td style={{ padding: '4px 0', fontSize: 13, textAlign: 'left' }}>−{formatCurrency(ticket.discount)}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: '4px 0', borderTop: '1px dashed #999', fontSize: 13 }}>قيمة المأكولات والمشروبات</td>
                    <td style={{ padding: '4px 0', borderTop: '1px dashed #999', fontSize: 13, textAlign: 'left' }}>{formatCurrency(ticket.netAmount ?? Math.max((ticket.subtotal || 0) - (ticket.discount || 0), 0))}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 0', fontSize: 13 }}>إنفاق استهلاكي (5%)</td>
                    <td style={{ padding: '4px 0', fontSize: 13, textAlign: 'left' }}>{formatCurrency(ticket.consumptionTaxAmount || 0)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 0', fontSize: 13 }}>إدارة محلية (5%)</td>
                    <td style={{ padding: '4px 0', fontSize: 13, textAlign: 'left' }}>{formatCurrency(ticket.localAdminAmount || 0)}</td>
                  </tr>
                  <tr className="tot">
                    <td style={{ padding: '6px 0', borderTop: '1px dashed #999', fontWeight: 800 }}>الإجمالي</td>
                    <td style={{ padding: '6px 0', borderTop: '1px dashed #999', fontWeight: 800, textAlign: 'left' }}>
                      {formatCurrency(ticket.total)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {ticket.notes && <div style={{ fontSize: 12, marginBottom: 8 }}>ملاحظات: {ticket.notes}</div>}

            </div>

            <div className="mt-5 space-y-2">
              <Button onClick={printBoth} loading={printing === 'both'} className="w-full" icon={<Printer size={15} />}>طباعة الفاتورتين</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={printCashier} loading={printing === 'cashier'} className="flex-1" icon={<Receipt size={15} />}>فاتورة الكاشير</Button>
                <Button variant="outline" onClick={printKitchen} loading={printing === 'kitchen'} className="flex-1" icon={<ChefHat size={15} />}>فاتورة المطبخ</Button>
              </div>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={browserPrintCashier} className="flex-1 text-brand-gray hover:text-fuchsia font-bold">طباعة الكاشير من المتصفح</button>
                <button type="button" onClick={browserPrintKitchen} className="flex-1 text-brand-gray hover:text-fuchsia font-bold">طباعة المطبخ من المتصفح</button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" loading={testingPrinter} onClick={testPrinter} className="flex-1" icon={<Radar size={15} />}>
                  اختبار الطابعة
                </Button>
                <Button variant="ghost" onClick={() => setTicket(null)} className="flex-1">إغلاق</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
