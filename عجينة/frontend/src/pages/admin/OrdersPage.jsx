import { useEffect, useState } from 'react'
import { ordersAPI, settingsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate, getStatusText, getStatusColor } from '../../utils/formatters'
import toast from 'react-hot-toast'

const STATUSES = ['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    ordersAPI.getAll().then(r => setOrders(r.data.orders || [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

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
    { key: '_id', label: 'واتساب', render: (v, r) => (
      <button onClick={() => openWhatsApp(r)} className="text-xs bg-[#25D366]/10 text-[#25D366] px-3 py-1.5 rounded-lg font-bold hover:bg-[#25D366]/20 transition-colors">
        💬 تواصل
      </button>
    )},
  ]

  const newCount = orders.filter(o => o.status === 'new').length

  return (
    <div>
      <PageHeader title="الطلبات 📋" subtitle="طلبات العملاء عبر الموقع والواتساب"
        actions={newCount > 0 && <div className="bg-red-500 text-white px-3 py-1.5 rounded-xl font-black text-sm">{newCount} طلب جديد!</div>}
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
          emptyIcon="📋" emptyTitle="لا توجد طلبات" />
      </div>
    </div>
  )
}
