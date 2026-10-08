import { useEffect, useMemo, useState } from 'react'
import { Eye, CalendarRange } from 'lucide-react'
import { ordersAPI, internalOrdersAPI, settingsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate, getStatusText, getStatusColor } from '../../utils/formatters'
import toast from 'react-hot-toast'
import OrderDetailsModal from './OrderDetailsModal'
import { useAuth } from '../../hooks/useAuth'

const SITE_STATUSES = ['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']
const INTERNAL_STATUSES = ['new', 'preparing', 'ready', 'delivered', 'cancelled']
const TYPE_LABEL = {
  dine_in: 'بالمحل',
  takeaway: 'سفري',
  delivery: 'توصيل',
}

const syriaDayKey = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Damascus', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = type => parts.find(p => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function DateFilterBar({ from, to, setFrom, setTo, status, setStatus, source, setSource, summary }) {
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
        <div className="text-[11px] font-black text-brand-gray mb-1.5 flex items-center gap-1">
          <CalendarRange size={13}/> الفترة
        </div>
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
        <label className="text-[11px] font-black text-brand-gray block mb-1">المصدر</label>
        <select value={source} onChange={e=>setSource(e.target.value)}
          className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold text-sm bg-white focus:border-fuchsia focus:outline-none">
          <option value="all">كل الطلبات</option>
          <option value="cashier">طلبات الكاشير</option>
          <option value="site">طلبات الموقع</option>
        </select>
      </div>

      <div>
        <label className="text-[11px] font-black text-brand-gray block mb-1">الحالة</label>
        <select value={status} onChange={e=>setStatus(e.target.value)}
          className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold text-sm bg-white focus:border-fuchsia focus:outline-none">
          <option value="all">كل الحالات</option>
          {SITE_STATUSES.map(s=><option key={s} value={s}>{getStatusText(s)}</option>)}
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
  const [sourceFilter, setSourceFilter] = useState('all')
  const { user } = useAuth()
  const canEdit = ['admin', 'supervisor'].includes(user?.role)

  const load = async () => {
    setLoading(true)
    try {
      const dateParams = {
        ...(from ? { startDate: from } : {}),
        ...(to ? { endDate: to } : {}),
        limit: 500,
      }

      const [siteRes, cashierRes] = await Promise.all([
        ordersAPI.getAll(dateParams),
        internalOrdersAPI.getAll(dateParams),
      ])

      const siteOrders = (siteRes.data.orders || []).map(order => ({
        ...order,
        _source: 'site',
        _displayNumber: 'موقع',
        _displayCustomer: order.customerName || '—',
        _displayPhone: order.phone || '',
        _displayProducts: order.productNameSnapshot || '—',
        _displayQuantity: Number(order.quantity || 0),
        _displayTotal: Number(order.totalPrice || 0),
        _displayType: order.deliveryMethod === 'pickup' ? 'استلام من المحل' : 'توصيل',
      }))

      const cashierOrders = (cashierRes.data.orders || []).map(order => ({
        ...order,
        _source: 'cashier',
        _displayNumber: order.orderNumber || 'طلب',
        _displayCustomer: order.customerName || order.orderNumber || 'كاشير',
        _displayPhone: order.customerPhone || '',
        _displayProducts: (order.items || []).map(item => item.name).filter(Boolean).join('، ') || '—',
        _displayQuantity: (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        _displayTotal: Number(order.total || 0),
        _displayType: TYPE_LABEL[order.orderType] || order.orderType || 'داخلي',
      }))

      setOrders(
        [...siteOrders, ...cashierOrders]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      )
    } catch (e) {
      toast.error(e.message || 'تعذّر تحميل الطلبات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [from, to])

  const [investor, setInvestor] = useState(null)
  useEffect(() => {
    settingsAPI.getInvestor().then(r => setInvestor(r.data.investor)).catch(() => {})
  }, [])

  const visibleOrders = useMemo(() => orders.filter(order => {
    if (sourceFilter !== 'all' && order._source !== sourceFilter) return false
    if (statusFilter !== 'all' && order.status !== statusFilter) return false
    return true
  }), [orders, sourceFilter, statusFilter])

  const rateOf = order => {
    if (!investor || investor.enabled === false) return 0
    if (order._source === 'site') return Number(investor.percent || investor.deliveryPercent || 0)
    if (order.orderType === 'dine_in') return Number(investor.dineInPercent ?? investor.internalPercent ?? 20)
    return Number(investor.takeawayPercent ?? investor.deliveryPercent ?? investor.percent ?? 15)
  }

  const totalAmount = visibleOrders
    .filter(order => order.status !== 'cancelled')
    .reduce((sum, order) => sum + Number(order._displayTotal || 0), 0)

  const investorCut = visibleOrders
    .filter(order => order.status !== 'cancelled')
    .reduce((sum, order) => {
      const base = Number(order.netAmount ?? Math.max(
        Number(order._displayTotal || 0) - Number(order.invoiceTaxAmount || 0),
        0
      ))
      return sum + Math.round(base * rateOf(order) / 100)
    }, 0)

  const updateStatus = async (order, status) => {
    try {
      if (order._source === 'cashier') {
        if (!INTERNAL_STATUSES.includes(status)) return
        await internalOrdersAPI.setStatus(order._id, status)
      } else {
        await ordersAPI.updateStatus(order._id, status)
      }
      toast.success('تم تحديث الحالة')
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const openWhatsApp = order => {
    const phone = order._displayPhone
    if (!phone) return toast.error('لا يوجد رقم هاتف لهذا الطلب')
    const msg = `مرحباً ${order._displayCustomer}!\nطلبك: ${order._displayProducts}\nالمجموع: ${Number(order._displayTotal || 0).toLocaleString()} ل.س\nشكراً لطلبك من عجينة وطحينة 💕`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const columns = [
    {
      key: '_source',
      label: 'المصدر',
      render: value => value === 'cashier'
        ? <span className="text-[11px] px-2 py-1 rounded-lg bg-amber-100 text-amber-700 font-black">كاشير</span>
        : <span className="text-[11px] px-2 py-1 rounded-lg bg-blue-100 text-blue-700 font-black">موقع</span>,
    },
    {
      key: '_displayCustomer',
      label: 'الطلب / العميل',
      render: (value, row) => (
        <div>
          <div className="font-black text-brand-dark">{value}</div>
          {row._source === 'cashier' && (
            <div className="text-xs text-brand-gray">{row.orderNumber}</div>
          )}
          {row._displayPhone && (
            <div className="text-xs text-brand-gray" dir="ltr">{row._displayPhone}</div>
          )}
        </div>
      ),
    },
    { key: '_displayProducts', label: 'الأصناف' },
    { key: '_displayQuantity', label: 'الكمية' },
    {
      key: '_displayTotal',
      label: 'المبلغ',
      render: value => <span className="font-black text-fuchsia">{formatCurrency(value)}</span>,
    },
    { key: '_displayType', label: 'النوع' },
    {
      key: 'status',
      label: 'الحالة',
      render: (value, row) => (
        <select
          value={value}
          onChange={e => updateStatus(row, e.target.value)}
          className={`text-xs px-2 py-1.5 rounded-lg font-bold border-0 cursor-pointer ${getStatusColor(value)}`}
        >
          {(row._source === 'cashier' ? INTERNAL_STATUSES : SITE_STATUSES)
            .map(status => <option key={status} value={status}>{getStatusText(status)}</option>)}
        </select>
      ),
    },
    ...(investor && investor.enabled !== false
      ? [{
          key: 'investorShare',
          label: `نسبة ${investor.name || 'الأميركان'}`,
          render: (_value, row) => {
            const base = Number(row.netAmount ?? Math.max(
              Number(row._displayTotal || 0) - Number(row.invoiceTaxAmount || 0),
              0
            ))
            return (
              <span className="font-black text-amber-600">
                {formatCurrency(Math.round(base * rateOf(row) / 100))}
              </span>
            )
          },
        }]
      : []),
    { key: 'createdAt', label: 'التاريخ', render: value => formatDate(value) },
    {
      key: '_id',
      label: 'إجراءات',
      render: (_value, row) => (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedOrder(row)}
            className="text-xs bg-brand-bg text-brand-dark px-3 py-1.5 rounded-lg font-black hover:bg-brand-border transition-colors flex items-center gap-1.5"
          >
            <Eye size={13}/> {canEdit && row.status !== 'cancelled' ? 'عرض / تعديل' : 'التفاصيل'}
          </button>
          {row._displayPhone && (
            <button
              onClick={() => openWhatsApp(row)}
              className="text-xs bg-[#25D366]/10 text-[#25D366] px-3 py-1.5 rounded-lg font-bold hover:bg-[#25D366]/20 transition-colors"
            >
              💬 تواصل
            </button>
          )}
        </div>
      ),
    },
  ]

  const newCount = visibleOrders.filter(order => order.status === 'new').length
  const siteCount = visibleOrders.filter(order => order._source === 'site').length
  const cashierCount = visibleOrders.filter(order => order._source === 'cashier').length

  return (
    <div>
      <PageHeader
        title="الطلبات 📋"
        subtitle="كل طلبات الفرع: الكاشير + الموقع والواتساب"
        actions={newCount > 0 && (
          <div className="bg-red-500 text-white px-3 py-1.5 rounded-xl font-black text-sm">
            {newCount} طلب جديد!
          </div>
        )}
      />

      <DateFilterBar
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        status={statusFilter}
        setStatus={setStatusFilter}
        source={sourceFilter}
        setSource={setSourceFilter}
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
