import { useEffect, useMemo, useState } from 'react'
import { Eye, CalendarRange } from 'lucide-react'
import { internalOrdersAPI, ordersAPI, settingsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate, getStatusText, getStatusColor } from '../../utils/formatters'
import toast from 'react-hot-toast'
import OrderDetailsModal from './OrderDetailsModal'
import { useAuth } from '../../hooks/useAuth'

const STATUSES = ['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']
const INTERNAL_STATUSES = ['new', 'preparing', 'ready', 'delivered', 'cancelled']
const ORDER_TYPE_LABEL = {
  dine_in: '🍽️ بالمحل',
  takeaway: '🥡 سفري',
  delivery: '🛵 توصيل',
}
const PAYMENT_LABEL = { cash: 'نقداً', card: 'بطاقة', unpaid: 'آجل' }

const syriaDayKey = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Damascus', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = type => parts.find(p => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function DateFilterBar({ from, to, setFrom, setTo, status, setStatus, summary }) {
  const today = syriaDayKey()
  const yesterday = syriaDayKey(-1)
  const preset = (label, value) => (
    <button key={label} type="button" onClick={() => { setFrom(value); setTo(value) }}
      className={`px-3 py-2 rounded-xl text-xs font-black transition-colors ${from===value&&to===value?'bg-fuchsia text-white':'bg-brand-bg text-brand-gray hover:text-brand-dark'}`}>
      {label}
    </button>
  )
  return <div className="rounded-2xl border border-brand-border bg-white p-3 mb-4">
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <div className="text-[11px] font-black text-brand-gray mb-1.5 flex items-center gap-1"><CalendarRange size={13}/> الفترة</div>
        <div className="flex gap-1.5">
          {preset('اليوم',today)}
          {preset('أمس',yesterday)}
          <button type="button" onClick={()=>{setFrom('');setTo('')}}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-colors ${!from&&!to?'bg-fuchsia text-white':'bg-brand-bg text-brand-gray hover:text-brand-dark'}`}>
            كل الأيام
          </button>
        </div>
      </div>
      <div>
        <label className="text-[11px] font-black text-brand-gray block mb-1">من تاريخ</label>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
          className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold text-sm focus:border-fuchsia focus:outline-none"/>
      </div>
      <div>
        <label className="text-[11px] font-black text-brand-gray block mb-1">إلى تاريخ</label>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)}
          className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold text-sm focus:border-fuchsia focus:outline-none"/>
      </div>
      <div>
        <label className="text-[11px] font-black text-brand-gray block mb-1">الحالة</label>
        <select value={status} onChange={e=>setStatus(e.target.value)}
          className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold text-sm bg-white focus:border-fuchsia focus:outline-none">
          <option value="all">كل الحالات</option>
          {STATUSES.map(s=><option key={s} value={s}>{getStatusText(s)}</option>)}
        </select>
      </div>
      {summary&&<div className="mr-auto text-sm font-black text-brand-dark pb-2">{summary}</div>}
    </div>
  </div>
}

const normalizeSiteOrder = order => ({
  ...order,
  _source: 'site',
  _sourceLabel: 'موقع / واتساب',
  _displayProduct: order.productNameSnapshot || '—',
  _displayQuantity: Number(order.quantity || 0),
  _displayAmount: Number(order.totalPrice || 0),
  _displayDelivery: order.deliveryMethod === 'pickup' ? '🏪 استلام من المحل' : '🛵 توصيل',
  _displayCustomer: order.customerName || '—',
  _displayPhone: order.phone || '',
})

const normalizeInternalOrder = order => ({
  ...order,
  _source: 'cashier',
  _sourceLabel: 'كاشير',
  _displayProduct: (order.items || []).map(item => `${item.name} × ${item.quantity}`).join(' · ') || '—',
  _displayQuantity: (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  _displayAmount: Number(order.total || 0),
  _displayDelivery: ORDER_TYPE_LABEL[order.orderType] || order.orderType || '—',
  _displayCustomer: order.customerName || 'طلب داخلي',
  _displayPhone: order.customerPhone || '',
})

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [from, setFrom] = useState(syriaDayKey())
  const [to, setTo] = useState(syriaDayKey())
  const [statusFilter, setStatusFilter] = useState('all')
  const { user } = useAuth()
  const canEdit = ['admin', 'supervisor'].includes(user?.role)

  const load = async () => {
    setLoading(true)
    try {
      const params = {
        ...(from ? { startDate: from } : {}),
        ...(to ? { endDate: to } : {}),
        limit: 500,
      }

      const [siteResult, internalResult] = await Promise.allSettled([
        ordersAPI.getAll(params),
        internalOrdersAPI.getAll(params),
      ])

      const site = siteResult.status === 'fulfilled'
        ? (siteResult.value.data.orders || []).map(normalizeSiteOrder)
        : []
      const internal = internalResult.status === 'fulfilled'
        ? (internalResult.value.data.orders || []).map(normalizeInternalOrder)
        : []

      if (siteResult.status === 'rejected') toast.error('تعذّر تحميل طلبات الموقع')
      if (internalResult.status === 'rejected') toast.error('تعذّر تحميل الطلبات الداخلية')

      setOrders([...site, ...internal].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [from, to])

  const visibleOrders = useMemo(
    () => statusFilter === 'all' ? orders : orders.filter(order => order.status === statusFilter),
    [orders, statusFilter]
  )

  const [investor, setInvestor] = useState(null)
  useEffect(() => {
    settingsAPI.getInvestor().then(r => setInvestor(r.data.investor)).catch(() => {})
  }, [])

  const activeOrders = visibleOrders.filter(o => o.status !== 'cancelled')
  const totalAmount = activeOrders.reduce((sum, o) => sum + Number(o._displayAmount || 0), 0)
  const investorCut = investor
    ? activeOrders.reduce((sum, order) => {
        const base = Number(order.netAmount ?? Math.max(
          Number(order._displayAmount || 0) - Number(order.invoiceTaxAmount || 0),
          0
        ))
        const percent = order._source === 'cashier'
          ? Number(order.investorPercent ?? (order.orderType === 'dine_in'
            ? (investor.dineInPercent ?? 20)
            : (investor.takeawayPercent ?? investor.percent ?? 15)))
          : Number(investor.percent || 0)
        return sum + Math.round(base * percent / 100)
      }, 0)
    : 0

  const updateStatus = async (row, status) => {
    try {
      if (row._source === 'cashier') {
        if (!INTERNAL_STATUSES.includes(status)) return toast.error('هذه الحالة غير متاحة للطلب الداخلي')
        await internalOrdersAPI.setStatus(row._id, status)
      } else {
        await ordersAPI.updateStatus(row._id, status)
      }
      toast.success('تم تحديث الحالة')
      load()
    } catch (e) { toast.error(e.message) }
  }

  const openWhatsApp = order => {
    const phone = order._displayPhone
    if (!phone) return toast.error('لا يوجد رقم هاتف لهذا الطلب')
    const msg = `مرحباً ${order._displayCustomer}!\nطلبك: ${order._displayProduct}\nالمجموع: ${Number(order._displayAmount || 0).toLocaleString()} ل.س\nشكراً لطلبك من عجينة وطحينة 💕`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const columns = [
    { key: '_sourceLabel', label: 'المصدر', render: (v, r) => (
      <span className={`text-[11px] px-2 py-1 rounded-lg font-black ${
        r._source === 'cashier' ? 'bg-amber-50 text-amber-700' : 'bg-fuchsia-lighter text-fuchsia'
      }`}>{v}</span>
    )},
    { key: '_displayCustomer', label: 'العميل', render: (v, r) => (
      <div>
        <div className="font-black text-brand-dark">{v}</div>
        {r._displayPhone && <div className="text-xs text-brand-gray" dir="ltr">{r._displayPhone}</div>}
        {r._source === 'cashier' && r.orderNumber && (
          <div className="text-[11px] text-brand-gray font-bold">#{r.orderNumber}</div>
        )}
      </div>
    )},
    { key: '_displayProduct', label: 'الأصناف', render: v => (
      <div className="max-w-[280px] text-sm font-bold text-brand-dark line-clamp-2">{v}</div>
    )},
    { key: '_displayQuantity', label: 'الكمية' },
    { key: '_displayAmount', label: 'المبلغ', render: v => <span className="font-black text-fuchsia">{formatCurrency(v)}</span> },
    { key: '_displayDelivery', label: 'الاستلام' },
    { key: 'paymentMethod', label: 'الدفع', render: (v, r) => (
      <span className="text-xs font-bold text-brand-gray">
        {r._source === 'cashier' ? (PAYMENT_LABEL[v] || v || '—') : '—'}
      </span>
    )},
    { key: 'status', label: 'الحالة', render: (v, r) => (
      <select value={v} onChange={e => updateStatus(r, e.target.value)}
        className={`text-xs px-2 py-1.5 rounded-lg font-bold border-0 cursor-pointer ${getStatusColor(v)}`}>
        {(r._source === 'cashier' ? INTERNAL_STATUSES : STATUSES).map(s => (
          <option key={s} value={s}>{getStatusText(s)}</option>
        ))}
      </select>
    )},
    ...(investor && investor.enabled !== false
      ? [{
          key: '_investorShare',
          label: `نسبة ${investor.name || 'الأميركان'}`,
          render: (_v, row) => {
            if (row.status === 'cancelled') return <span className="text-brand-gray">—</span>
            const base = Number(row.netAmount ?? Math.max(
              Number(row._displayAmount || 0) - Number(row.invoiceTaxAmount || 0),
              0
            ))
            const pct = row._source === 'cashier'
              ? Number(row.investorPercent ?? (row.orderType === 'dine_in'
                ? (investor.dineInPercent ?? 20)
                : (investor.takeawayPercent ?? investor.percent ?? 15)))
              : Number(investor.percent || 0)
            return <span className="font-black text-amber-600">{formatCurrency(Math.round(base * pct / 100))}</span>
          },
        }]
      : []),
    { key: 'createdAt', label: 'التاريخ', render: v => formatDate(v) },
    { key: '_id', label: 'إجراءات', render: (_v, r) => (
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setSelectedOrder(r)}
          className="text-xs bg-brand-bg text-brand-dark px-3 py-1.5 rounded-lg font-black hover:bg-brand-border transition-colors flex items-center gap-1.5">
          <Eye size={13}/> {canEdit && r.status !== 'cancelled' ? 'عرض / تعديل' : 'التفاصيل'}
        </button>
        {r._displayPhone && (
          <button onClick={() => openWhatsApp(r)}
            className="text-xs bg-[#25D366]/10 text-[#25D366] px-3 py-1.5 rounded-lg font-bold hover:bg-[#25D366]/20 transition-colors">
            💬 تواصل
          </button>
        )}
      </div>
    )},
  ]

  const newCount = visibleOrders.filter(o => o.status === 'new').length
  const siteCount = visibleOrders.filter(o => o._source === 'site').length
  const cashierCount = visibleOrders.filter(o => o._source === 'cashier').length

  return (
    <div>
      <PageHeader title="الطلبات 📋" subtitle="كل طلبات الفرع: الكاشير + الموقع + الواتساب"
        actions={newCount > 0 && <div className="bg-red-500 text-white px-3 py-1.5 rounded-xl font-black text-sm">{newCount} طلب جديد!</div>}
      />

      <DateFilterBar
        from={from} to={to} setFrom={setFrom} setTo={setTo}
        status={statusFilter} setStatus={setStatusFilter}
        summary={<>{visibleOrders.length} طلب · {cashierCount} كاشير · {siteCount} موقع</>}
      />

      {investor && investor.enabled !== false && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {[
            { label: 'إجمالي الطلبات', value: formatCurrency(totalAmount), color: '#2E7A4A' },
            { label: `نسبة ${investor.name || 'الأميركان'}`, value: formatCurrency(investorCut), color: '#B8860B' },
            { label: 'الباقي للمحل', value: formatCurrency(totalAmount - investorCut), color: '#A96734' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-2xl p-4 shadow-card">
              <div className="text-xs text-brand-gray font-bold">{card.label}</div>
              <div className="font-black text-lg" style={{ color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card p-4">
        <DataTable
          columns={columns}
          data={visibleOrders}
          loading={loading}
          searchable
          searchPlaceholder="ابحث في كل الطلبات..."
          emptyIcon="📋"
          emptyTitle="لا توجد طلبات ضمن الفترة المحددة"
        />
      </div>

      <OrderDetailsModal
        open={!!selectedOrder}
        order={selectedOrder}
        kind={selectedOrder?._source === 'cashier' ? 'cashier' : 'site'}
        canEdit={canEdit}
        onClose={() => setSelectedOrder(null)}
        onSaved={() => load()}
      />
    </div>
  )
}
