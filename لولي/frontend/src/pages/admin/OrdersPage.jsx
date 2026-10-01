import { useEffect, useState } from 'react'
import { ClipboardList, Trash2, Receipt, Globe } from 'lucide-react'
import WhatsAppIcon from '../../components/common/WhatsAppIcon'
import { ordersAPI, internalOrdersAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate, getStatusText, getStatusColor, formatShopTime, formatShopDateTime } from '../../utils/formatters'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'

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
const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CashierOrders({ isAdmin }) {
  const [date, setDate] = useState(todayKey())
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    internalOrdersAPI.getAll({ ...(date ? { date } : {}), limit: 500 }) // no date → all days
      .then(r => setOrders(r.data.orders || []))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [date])

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
    { key: 'createdAt', label: date ? 'الوقت' : 'التاريخ والوقت', render: v => date ? formatShopTime(v) : formatShopDateTime(v) },
    { key: '_id', label: 'إجراءات', render: (v, r) => isAdmin ? (
      <button onClick={() => remove(r)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center gap-1.5">
        <Trash2 size={13} /> حذف
      </button>
    ) : '—' },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1.5">
          {[['اليوم', todayKey()], ['كل الأيام', '']].map(([label, val]) => (
            <button key={label} type="button" onClick={() => setDate(val)}
              className={`px-3 py-2.5 rounded-xl font-black text-sm transition-colors ${date === val ? 'bg-fuchsia text-white' : 'bg-brand-bg text-brand-gray hover:text-brand-dark'}`}>
              {label}
            </button>
          ))}
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold text-sm focus:border-fuchsia focus:outline-none" />
        <div className="text-sm font-black text-brand-dark">
          {live.length} طلب · <span className="text-fuchsia">{formatCurrency(total)}</span>
        </div>
      </div>
      <DataTable columns={columns} data={orders} loading={loading} searchable searchPlaceholder="ابحث برقم الطلب..."
        emptyIcon={Receipt} emptyTitle={date ? 'لا توجد طلبات كاشير بهاليوم' : 'لا توجد طلبات كاشير'} />
    </div>
  )
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('cashier')

  const load = () => {
    setLoading(true)
    ordersAPI.getAll().then(r => setOrders(r.data.orders || [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const updateStatus = async (id, status) => {
    try {
      await ordersAPI.updateStatus(id, status)
      toast.success('تم تحديث الحالة')
      load()
    } catch (e) { toast.error(e.message) }
  }

  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

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

      {tab === 'cashier' ? <CashierOrders isAdmin={isAdmin} /> : (
        <div className="bg-white rounded-2xl shadow-card p-4">
          <DataTable columns={columns} data={orders} loading={loading} searchable searchPlaceholder="ابحث في الطلبات..."
            emptyIcon={ClipboardList} emptyTitle="لا توجد طلبات" />
        </div>
      )}
    </div>
  )
}
