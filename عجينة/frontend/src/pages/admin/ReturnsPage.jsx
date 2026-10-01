import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Undo2, Search, Minus, Plus, RotateCcw, Wallet, PackageCheck,
  RefreshCw, Receipt, AlertCircle, Package,
} from 'lucide-react'
import { returnsAPI, settingsAPI } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import PageHeader   from '../../components/common/PageHeader'
import Button       from '../../components/common/Button'
import LoadingState from '../../components/common/LoadingState'
import toast from 'react-hot-toast'

const todayKey = () => {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const hhmm = iso => new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

const REFUND_LABEL = { cash: 'نقداً', card: 'بطاقة', none: 'بدون إعادة مبلغ (آجل)' }

export default function ReturnsPage() {
  const [date, setDate]       = useState(todayKey())
  const [records, setRecords] = useState([])
  const [totals, setTotals]   = useState({ count: 0, refunded: 0, items: 0 })
  const [loading, setLoading] = useState(true)

  /* ── The order being returned against ── */
  const [query, setQuery]   = useState('')
  const [finding, setFinding] = useState(false)
  const [order, setOrder]   = useState(null)
  const [qty, setQty]       = useState({})          // productId → quantity to return
  const [restock, setRestock] = useState(true)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await returnsAPI.getAll({ date })
      setRecords(res.data.returns || [])
      setTotals(res.data.totals || { count: 0, refunded: 0, items: 0 })
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [date])

  useEffect(() => { load() }, [load])

  /* After midnight the shop may still be on yesterday's working day — ask the
     server which day is running rather than trusting the calendar. */
  useEffect(() => {
    settingsAPI.getBusinessHours()
      .then(r => { if (r.data.hours?.currentDay) setDate(r.data.hours.currentDay) })
      .catch(() => {})
  }, [])

  const findOrder = async e => {
    e?.preventDefault()
    const key = query.trim()
    if (!key) return toast.error('أدخل رقم الطلب')
    setFinding(true)
    try {
      const res = await returnsAPI.findOrder(key)
      const found = res.data.order
      setOrder(found)
      setQty({})
      setReason('')
      setRestock(true)
      if (!found.items.some(i => i.returnable > 0)) {
        toast('كل أصناف هذا الطلب مُرجَعة مسبقاً', { icon: '⚠️' })
      }
    } catch (err) {
      setOrder(null)
      toast.error(err.message || 'الطلب غير موجود')
    } finally { setFinding(false) }
  }

  const changeQty = (item, delta) => setQty(q => {
    const next = Math.min(Math.max((q[item.productId] || 0) + delta, 0), item.returnable)
    return { ...q, [item.productId]: next }
  })

  const refundAmount = useMemo(() => {
    if (!order) return 0
    return order.items.reduce((s, i) => s + (qty[i.productId] || 0) * i.refundUnitPrice, 0)
  }, [order, qty])

  const pickedCount = useMemo(
    () => Object.values(qty).reduce((s, n) => s + n, 0),
    [qty]
  )

  const submit = async () => {
    if (!order) return
    if (!pickedCount) return toast.error('حدّد الكمية المُرجَعة')
    setSaving(true)
    try {
      const res = await returnsAPI.create({
        orderId: order._id,
        items: Object.entries(qty)
          .filter(([, quantity]) => quantity > 0)
          .map(([productId, quantity]) => ({ productId, quantity })),
        restock,
        reason,
      })
      toast.success(res.data.message)
      setOrder(null); setQty({}); setQuery(''); setReason('')
      load()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div>
      <PageHeader
        title="المرتجع"
        subtitle="إرجاع طلب أو جزء منه — يُعاد المبلغ للزبون وترجع الكمية للمخزون لتُباع من جديد"
        actions={
          <Button size="sm" variant="ghost" onClick={load} icon={<RefreshCw size={14} />}>تحديث</Button>
        }
      />

      {/* ── Day counters ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        {[
          { Icon: Undo2,  label: 'عدد المرتجعات', value: totals.count,                    color: '#C05050' },
          { Icon: Wallet, label: 'المبلغ المُعاد', value: formatCurrency(totals.refunded), color: '#B8860B' },
          { Icon: Package, label: 'قطع مُرجَعة',   value: totals.items,                    color: '#6B5A4A' },
        ].map(({ Icon, label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}1F` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-brand-gray font-bold">{label}</div>
              <div className="font-black text-brand-dark truncate">{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── New return ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-white rounded-2xl shadow-card p-5">
          <h3 className="font-black text-brand-dark mb-4 flex items-center gap-2">
            <RotateCcw size={17} className="text-fuchsia" /> تسجيل مرتجع
          </h3>

          <form onSubmit={findOrder} className="flex gap-2 mb-5">
            <div className="relative flex-1">
              <Search size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-gray-light" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="رقم الطلب — مثال ORD-20260920-0007"
                dir="ltr"
                className="w-full pr-11 pl-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
            <Button type="submit" loading={finding}>بحث</Button>
          </form>

          {!order ? (
            <div className="py-10 text-center">
              <Receipt size={32} className="mx-auto mb-2 text-brand-gray-light" />
              <div className="font-black text-brand-gray text-sm">ابحث عن الطلب الذي يريد الزبون إرجاعه</div>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-brand-bg mb-4">
                <div>
                  <div className="font-black text-brand-dark" dir="ltr">{order.orderNumber}</div>
                  <div className="text-xs text-brand-gray font-bold">
                    {new Date(order.createdAt).toLocaleString('ar-EG')}
                    {order.customerName ? ` · ${order.customerName}` : ''}
                  </div>
                </div>
                <div className="text-left">
                  <div className="font-black text-fuchsia">{formatCurrency(order.total)}</div>
                  <div className="text-xs text-brand-gray font-bold">
                    {REFUND_LABEL[order.paymentMethod] || order.paymentMethod}
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {order.items.map(item => {
                  const picked = qty[item.productId] || 0
                  const spent  = item.returnable === 0
                  return (
                    <div key={item.productId}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-colors ${
                        picked ? 'border-fuchsia bg-fuchsia-bg' : 'border-brand-border'
                      } ${spent ? 'opacity-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-brand-dark text-sm truncate">{item.name}</div>
                        <div className="text-xs text-brand-gray font-bold">
                          {formatCurrency(item.refundUnitPrice)} للقطعة · مُباع {item.quantity}
                          {item.returned > 0 && ` · مُرجَع ${item.returned}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" onClick={() => changeQty(item, -1)} disabled={spent}
                          className="w-7 h-7 rounded-lg bg-white border border-brand-border flex items-center justify-center hover:bg-brand-bg disabled:opacity-40">
                          <Minus size={13} />
                        </button>
                        <span className="w-8 text-center font-black text-brand-dark">{picked}</span>
                        <button type="button" onClick={() => changeQty(item, 1)} disabled={spent}
                          className="w-7 h-7 rounded-lg bg-white border border-brand-border flex items-center justify-center hover:bg-brand-bg disabled:opacity-40">
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Can it go back on the shelf? */}
              <button type="button" onClick={() => setRestock(r => !r)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 mb-3 text-right transition-colors ${
                  restock ? 'border-green-300 bg-green-50' : 'border-brand-border'
                }`}>
                <PackageCheck size={18} className={restock ? 'text-green-600' : 'text-brand-gray-light'} />
                <div className="flex-1">
                  <div className="font-black text-sm text-brand-dark">إرجاع الكمية للمخزون</div>
                  <div className="text-xs font-bold text-brand-gray">
                    {restock ? 'الصنف صالح ويمكن بيعه من جديد' : 'الصنف غير صالح — لن يعود للمخزون'}
                  </div>
                </div>
                <div className={`w-11 h-6 rounded-full p-0.5 transition-colors ${restock ? 'bg-green-500' : 'bg-brand-border'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${restock ? '-translate-x-5' : ''}`} />
                </div>
              </button>

              <input value={reason} onChange={e => setReason(e.target.value)}
                placeholder="سبب الإرجاع (اختياري)"
                className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm mb-4" />

              {order.paymentMethod === 'unpaid' && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 mb-4">
                  <AlertCircle size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs font-bold text-amber-800">
                    الطلب آجل ولم يُدفع — المرتجع يلغي المستحق ولا يُخرج مبلغاً من الصندوق
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between py-3 border-t border-brand-border mb-3">
                <span className="font-black text-brand-dark">المبلغ المُعاد</span>
                <span className="font-black text-fuchsia text-lg">{formatCurrency(refundAmount)}</span>
              </div>

              <div className="flex gap-2">
                <Button onClick={submit} loading={saving} disabled={!pickedCount} className="flex-1">
                  تأكيد المرتجع
                </Button>
                <Button variant="ghost" onClick={() => { setOrder(null); setQty({}) }}>إلغاء</Button>
              </div>
            </div>
          )}
        </motion.div>

        {/* ── The day's returns ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="bg-white rounded-2xl shadow-card p-5 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-brand-dark flex items-center gap-2">
              <Undo2 size={17} className="text-fuchsia" /> سجل المرتجعات
            </h3>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-2 py-1.5 border-2 border-brand-border rounded-lg font-bold text-xs focus:border-fuchsia focus:outline-none" />
          </div>

          {loading ? <LoadingState /> : !records.length ? (
            <div className="py-10 text-center">
              <Undo2 size={30} className="mx-auto mb-2 text-brand-gray-light" />
              <div className="text-sm font-bold text-brand-gray">لا توجد مرتجعات بهذا اليوم</div>
            </div>
          ) : (
            <div className="space-y-3 max-h-[560px] overflow-y-auto">
              {records.map(r => (
                <div key={r._id} className="p-3 rounded-xl bg-brand-bg">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <div className="font-black text-brand-dark text-sm" dir="ltr">{r.returnNumber}</div>
                      <div className="text-xs text-brand-gray font-bold" dir="ltr">{r.orderNumber}</div>
                    </div>
                    <div className="text-left">
                      <div className="font-black text-red-500 text-sm">−{formatCurrency(r.refundAmount)}</div>
                      <div className="text-xs text-brand-gray font-bold">{hhmm(r.createdAt)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {r.items.map((it, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-white text-brand-gray">
                        {it.name} × {it.quantity}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] font-bold text-brand-gray-light">
                    {r.restocked ? 'رجعت للمخزون' : 'لم ترجع للمخزون'} · {REFUND_LABEL[r.refundMethod] || ''}
                    {r.createdByName ? ` · ${r.createdByName}` : ''}
                  </div>
                  {r.reason && <div className="text-[11px] font-bold text-brand-gray mt-1">السبب: {r.reason}</div>}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
