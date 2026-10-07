import { useEffect, useState } from 'react'
import { ClipboardList, Trash2, Receipt, Globe, Eye, CalendarRange } from 'lucide-react'
import WhatsAppIcon from '../../components/common/WhatsAppIcon'
import { ordersAPI, internalOrdersAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate, getStatusText, getStatusColor, formatShopTime, formatShopDateTime } from '../../utils/formatters'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import OrderDetailsModal from './OrderDetailsModal'

const STATUSES = ['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']

/* Counter (POS) orders — they live in their own collection, so they used to
   be invisible here and only showed in the POS screen's own log. */
const POS_STATUSES = {
  new:       { label: 'جديد',        cls: 'bg-blue-50 text-blue-600' },
  preparing: { label: 'قيد التجهيز', cls: 'bg-amber-50 text-amber-700' },
  ready:     { label: 'تم التجهيز',  cls: 'bg-green-50 text-green-700' },
  delivered: { label: 'تم التسليم',  cls: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'ملغى',        cls: 'bg-red-50 text-red-500' },
}
const ORDER_TYPE = { takeaway: 'سفري', dine_in: 'بالمحل', delivery: 'توصيل' }
const PAYMENT = { cash: 'نقداً', card: 'بطاقة', unpaid: 'آجل' }
const syriaDayKey = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Damascus', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = type => parts.find(p => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function DateFilterBar({ from, to, setFrom, setTo, status, setStatus, statuses, summary }) {
  const today = syriaDayKey()
  const yesterday = syriaDayKey(-1)
  const preset = (label, value) => (
    <button key={label} type="button"
      onClick={() => { setFrom(value); setTo(value) }}
      className={`px-3 py-2 rounded-xl text-xs font-black transition-colors ${
        from === value && to === value ? 'bg-fuchsia text-white' : 'bg-brand-bg text-brand-gray hover:text-brand-dark'
      }`}>
      {label}
    </button>
  )
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-3 mb-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-[11px] font-black text-brand-gray mb-1.5 flex items-center gap-1"><CalendarRange size={13}/> الفترة</div>
          <div className="flex gap-1.5">
            {preset('اليوم', today)}
            {preset('أمس', yesterday)}
            <button type="button" onClick={() => { setFrom(''); setTo('') }}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-colors ${!from && !to ? 'bg-fuchsia text-white' : 'bg-brand-bg text-brand-gray hover:text-brand-dark'}`}>
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
            {statuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {summary&&<div className="mr-auto text-sm font-black text-brand-dark pb-2">{summary}</div>}
      </div>
    </div>
  )
}

export function CashierOrders({ isAdmin, canEdit }) {
  const [from, setFrom] = useState(syriaDayKey())
  const [to, setTo] = useState(syriaDayKey())
  const [statusFilter, setStatusFilter] = useState('all')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)

  const load = () => {
    setLoading(true)
    internalOrdersAPI.getAll({
      ...(from ? { startDate: from } : {}),
      ...(to ? { endDate: to } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      limit: 500,
    })
      .then(r => setOrders(r.data.orders || []))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [from, to, statusFilter])

  const setStatus = async (o, status) => {
    try { const r = await internalOrdersAPI.setStatus(o._id, status); toast.success(r.data.message); load() }
    catch (e) { toast.error(e.message) }
  }
  const remove = async o => {
    if (!confirm(`حذف الطلب ${o.orderNumber} نهائياً؟ سترجع الكميات للمخزون ويُعكس المبلغ من الكاش.`)) return
    try { const r = await internalOrdersAPI.remove(o._id); toast.success(r.data.message); load() }
    catch (e) { toast.error(e.message) }
  }

  const live = orders.filter(o => o.status !== 'cancelled')
  const total = live.reduce((s, o) => s + (o.total || 0), 0)

  const columns = [
    { key: 'orderNumber', label: 'رقم الطلب', render: v => <span className="font-black text-brand-dark" dir="ltr">{v}</span> },
    { key: 'items', label: 'الأصناف', render: items => (
      <div className="space-y-0.5 min-w-[150px]">
        {(items || []).map((it, i) => <div key={i} className="text-xs font-bold text-brand-dark">{it.name} × {it.quantity}</div>)}
      </div>
    )},
    { key: 'total', label: 'المبلغ', render: v => <span className="font-black text-fuchsia">{formatCurrency(v)}</span> },
    { key: 'orderType', label: 'النوع', render: (v, r) => (
      <div className="text-xs font-bold">
        <div>{ORDER_TYPE[v] || v} · {PAYMENT[r.paymentMethod] || r.paymentMethod}</div>
        {r.customerName && <div className="text-brand-gray">{r.customerName}</div>}
      </div>
    )},
    { key: 'status', label: 'الحالة', render: (v, r) => (
      <select value={v} onChange={e => setStatus(r, e.target.value)}
        className={`text-xs px-2 py-1.5 rounded-lg font-bold border-0 cursor-pointer ${POS_STATUSES[v]?.cls || ''}`}>
        {Object.entries(POS_STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
      </select>
    )},
    { key: 'createdAt', label: 'التاريخ والوقت', render: v => formatShopDateTime(v) },
    { key: '_id', label: 'إجراءات', render: (v, r) => (
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setSelectedOrder(r)}
          className="text-xs bg-brand-bg text-brand-dark px-3 py-1.5 rounded-lg font-black hover:bg-brand-border transition-colors flex items-center gap-1.5">
          <Eye size={13}/> {canEdit && r.status !== 'cancelled' ? 'عرض / تعديل' : 'التفاصيل'}
        </button>
        {isAdmin && (
          <button onClick={() => remove(r)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center gap-1.5">
            <Trash2 size={13}/> حذف
          </button>
        )}
      </div>
    ) },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <DateFilterBar
        from={from} to={to} setFrom={setFrom} setTo={setTo}
        status={statusFilter} setStatus={setStatusFilter}
        statuses={Object.entries(POS_STATUSES).map(([key,value])=>[key,value.label])}
        summary={<>{live.length} طلب · <span className="text-fuchsia">{formatCurrency(total)}</span></>}
      />
      <DataTable columns={columns} data={orders} loading={loading} searchable searchPlaceholder="ابحث برقم الطلب..."
        emptyIcon={Receipt} emptyTitle="لا توجد طلبات كاشير ضمن الفترة المحددة" />

      <OrderDetailsModal
        open={!!selectedOrder}
        order={selectedOrder}
        kind="cashier"
        canEdit={canEdit}
        onClose={() => setSelectedOrder(null)}
        onSaved={() => load()}
      />
    </div>
  )
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('cashier')
  const [selectedSiteOrder, setSelectedSiteOrder] = useState(null)
  const [siteFrom, setSiteFrom] = useState(syriaDayKey())
  const [siteTo, setSiteTo] = useState(syriaDayKey())
  const [siteStatus, setSiteStatus] = useState('all')

  const load = () => {
    setLoading(true)
    ordersAPI.getAll({
      ...(siteFrom ? { startDate: siteFrom } : {}),
      ...(siteTo ? { endDate: siteTo } : {}),
      ...(siteStatus !== 'all' ? { status: siteStatus } : {}),
      limit: 500,
    }).then(r => setOrders(r.data.orders || [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [siteFrom, siteTo, siteStatus])

  const updateStatus = async (id, status) => {
    try {
      await ordersAPI.updateStatus(id, status)
      toast.success('تم تحديث الحالة')
      load()
    } catch (e) { toast.error(e.message) }
  }

  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canEdit = ['admin', 'supervisor'].includes(user?.role)

  const removeOrder = async (order) => {
    if (!confirm(`حذف طلب ${order.customerName} نهائياً؟`)) return
    try {
      await ordersAPI.remove(order._id)
      toast.success('تم حذف الطلب')
      load()
    } catch (e) { toast.error(e.message) }
  }

  const openWhatsApp = (order) => {
    const msg = `مرحباً ${order.customerName}!\nطلبك: ${order.productNameSnapshot} × ${order.quantity}\nالمجموع: ${order.totalAmount?.toLocaleString()} ل.س\nشكراً لطلبك من لوليز`
    window.open(`https://wa.me/${order.customerPhone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const columns = [
    { key: 'customerName', label: 'العميل', render: (v, r) => (
      <div>
        <div className="font-black text-brand-dark">{v}</div>
        <div className="text-xs text-brand-gray">{r.customerPhone}</div>
      </div>
    )},
    { key: 'productNameSnapshot', label: 'المنتج' },
    { key: 'quantity', label: 'الكمية' },
    { key: 'totalAmount', label: 'المبلغ', render: v => <span className="font-black text-fuchsia">{formatCurrency(v)}</span> },
    { key: 'channel', label: 'القناة', render: v => v === 'whatsapp' ? <span className="flex items-center gap-1.5"><WhatsAppIcon size={14} className="text-[#25D366]" /> واتساب</span> : v },
    { key: 'status', label: 'الحالة', render: (v, r) => (
      <select value={v} onChange={e => updateStatus(r._id, e.target.value)}
        className={`text-xs px-2 py-1.5 rounded-lg font-bold border-0 cursor-pointer ${getStatusColor(v)}`}>
        {STATUSES.map(s => <option key={s} value={s}>{getStatusText(s)}</option>)}
      </select>
    )},
    { key: 'createdAt', label: 'التاريخ', render: v => formatDate(v) },
    { key: '_id', label: 'إجراءات', render: (v, r) => (
      <div className="flex items-center gap-2">
        <button onClick={() => setSelectedSiteOrder(r)}
          className="text-xs bg-brand-bg text-brand-dark px-3 py-1.5 rounded-lg font-black hover:bg-brand-border transition-colors flex items-center gap-1.5">
          <Eye size={13}/> {canEdit && r.status !== 'cancelled' ? 'عرض / تعديل' : 'التفاصيل'}
        </button>
        <button onClick={() => openWhatsApp(r)} className="text-xs bg-[#25D366]/10 text-[#25D366] px-3 py-1.5 rounded-lg font-bold hover:bg-[#25D366]/20 transition-colors flex items-center gap-1.5">
          <WhatsAppIcon size={13} /> تواصل
        </button>
        {isAdmin && (
          <button onClick={() => removeOrder(r)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center gap-1.5">
            <Trash2 size={13} /> حذف
          </button>
        )}
      </div>
    )},
  ]

  const newCount = orders.filter(o => o.status === 'new').length

  return (
    <div>
      <PageHeader title="الطلبات" subtitle="طلبات الكاشير وطلبات الموقع والواتساب"
        actions={tab === 'site' && newCount > 0 && <div className="bg-red-500 text-white px-3 py-1.5 rounded-xl font-black text-sm">{newCount} طلب جديد!</div>}
      />

      <div className="flex gap-2 mb-4">
        {[['cashier', 'طلبات الكاشير', Receipt], ['site', 'طلبات الموقع', Globe]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 transition-colors ${
              tab === key ? 'bg-fuchsia text-white shadow-md' : 'bg-white text-brand-gray hover:text-brand-dark'
            }`}>
            <Icon size={15} /> {label}
            {key === 'site' && newCount > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5">{newCount}</span>}
          </button>
        ))}
      </div>

      {tab === 'cashier' ? <CashierOrders isAdmin={isAdmin} canEdit={canEdit} /> : (
        <div className="bg-white rounded-2xl shadow-card p-4">
          <DateFilterBar
            from={siteFrom} to={siteTo} setFrom={setSiteFrom} setTo={setSiteTo}
            status={siteStatus} setStatus={setSiteStatus}
            statuses={STATUSES.map(s=>[s,getStatusText(s)])}
            summary={<>{orders.length} طلب</>}
          />
          <DataTable columns={columns} data={orders} loading={loading} searchable searchPlaceholder="ابحث في الطلبات..."
            emptyIcon={ClipboardList} emptyTitle="لا توجد طلبات ضمن الفترة المحددة" />
        </div>
      )}

      <OrderDetailsModal
        open={!!selectedSiteOrder}
        order={selectedSiteOrder}
        kind="site"
        canEdit={canEdit}
        onClose={() => setSelectedSiteOrder(null)}
        onSaved={() => load()}
      />
    </div>
  )
}
