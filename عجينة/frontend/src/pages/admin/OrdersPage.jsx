import { useEffect, useState } from 'react'
import { Eye, CalendarRange } from 'lucide-react'
import { ordersAPI, settingsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate, getStatusText, getStatusColor } from '../../utils/formatters'
import toast from 'react-hot-toast'
import OrderDetailsModal from './OrderDetailsModal'
import { useAuth } from '../../hooks/useAuth'

const STATUSES = ['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']

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

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [from, setFrom] = useState(syriaDayKey())
  const [to, setTo] = useState(syriaDayKey())
  const [statusFilter, setStatusFilter] = useState('all')
  const { user } = useAuth()
  const canEdit = ['admin', 'supervisor'].includes(user?.role)

  const load = () => {
    setLoading(true)
    ordersAPI.getAll({
      ...(from ? { startDate: from } : {}),
      ...(to ? { endDate: to } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      limit: 500,
    }).then(r => setOrders(r.data.orders || [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [from, to, statusFilter])

  /* The partner's flat cut, shown here as well as on the receipt so the
     figure is never something anyone has to work out by hand. */
  const [investor, setInvestor] = useState(null)
  useEffect(() => {
    settingsAPI.getInvestor().then(r => setInvestor(r.data.investor)).catch(() => {})
  }, [])

  const totalAmount = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.totalPrice || 0), 0)
  const investorCut = investor ? Math.round(totalAmount * Number(investor.percent || 0) / 100) : 0

  const updateStatus = async (id, status) => {
    try {
      await ordersAPI.updateStatus(id, status)
      toast.success('تم تحديث الحالة')
      load()
    } catch (e) { toast.error(e.message) }
  }

  const openWhatsApp = (order) => {
    const msg = `مرحباً ${order.customerName}!\nطلبك: ${order.productNameSnapshot} × ${order.quantity}\nالمجموع: ${order.totalPrice?.toLocaleString()} ل.س\nشكراً لطلبك من عجينة وطحينة 💕`
    window.open(`https://wa.me/${order.phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const columns = [
    { key: 'customerName', label: 'العميل', render: (v, r) => (
      <div>
        <div className="font-black text-brand-dark">{v}</div>
        <div className="text-xs text-brand-gray" dir="ltr">{r.phone}</div>
      </div>
    )},
    { key: 'productNameSnapshot', label: 'المنتج' },
    { key: 'quantity', label: 'الكمية' },
    { key: 'totalPrice', label: 'المبلغ', render: v => <span className="font-black text-fuchsia">{formatCurrency(v)}</span> },
    { key: 'deliveryMethod', label: 'الاستلام', render: v => v === 'pickup' ? '🏪 من المحل' : '🛵 توصيل' },
    { key: 'status', label: 'الحالة', render: (v, r) => (
      <select value={v} onChange={e => updateStatus(r._id, e.target.value)}
        className={`text-xs px-2 py-1.5 rounded-lg font-bold border-0 cursor-pointer ${getStatusColor(v)}`}>
        {STATUSES.map(s => <option key={s} value={s}>{getStatusText(s)}</option>)}
      </select>
    )},
    ...(investor && investor.enabled !== false && Number(investor.percent) > 0
      ? [{
          /* Its own key: two columns sharing one would collide in the table. */
          key: 'investorShare',
          label: `نسبة ${investor.name}`,
          render: (_v, row) => (
            <span className="font-black text-amber-600">
              {formatCurrency(Math.round((row.totalPrice || 0) * Number(investor.percent) / 100))}
            </span>
          ),
        }]
      : []),
    { key: 'createdAt', label: 'التاريخ', render: v => formatDate(v) },
    { key: '_id', label: 'إجراءات', render: (v, r) => (
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setSelectedOrder(r)}
          className="text-xs bg-brand-bg text-brand-dark px-3 py-1.5 rounded-lg font-black hover:bg-brand-border transition-colors flex items-center gap-1.5">
          <Eye size={13}/> {canEdit && r.status !== 'cancelled' ? 'عرض / تعديل' : 'التفاصيل'}
        </button>
        <button onClick={() => openWhatsApp(r)} className="text-xs bg-[#25D366]/10 text-[#25D366] px-3 py-1.5 rounded-lg font-bold hover:bg-[#25D366]/20 transition-colors">
          💬 تواصل
        </button>
      </div>
    )},
  ]

  const newCount = orders.filter(o => o.status === 'new').length

  return (
    <div>
      <PageHeader title="الطلبات 📋" subtitle="طلبات العملاء عبر الموقع والواتساب"
        actions={newCount > 0 && <div className="bg-red-500 text-white px-3 py-1.5 rounded-xl font-black text-sm">{newCount} طلب جديد!</div>}
      />


      <DateFilterBar
        from={from} to={to} setFrom={setFrom} setTo={setTo}
        status={statusFilter} setStatus={setStatusFilter}
        summary={<>{orders.length} طلب</>}
      />

      {investor && investor.enabled !== false && Number(investor.percent) > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {[
            { label: 'إجمالي الطلبات', value: formatCurrency(totalAmount), color: '#2E7A4A' },
            { label: `نسبة ${investor.name} (${investor.percent}%)`, value: formatCurrency(investorCut), color: '#B8860B' },
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
        <DataTable columns={columns} data={orders} loading={loading} searchable searchPlaceholder="ابحث في الطلبات..."
          emptyIcon="📋" emptyTitle="لا توجد طلبات ضمن الفترة المحددة" />
      </div>

      <OrderDetailsModal
        open={!!selectedOrder}
        order={selectedOrder}
        kind="site"
        canEdit={canEdit}
        onClose={() => setSelectedOrder(null)}
        onSaved={() => load()}
      />
    </div>
  )
}
