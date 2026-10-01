import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Banknote, Receipt, Trash2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { salesAPI, productsAPI, centersAPI, internalOrdersAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, getChannelText, getStatusColor, getStatusText, formatShopDateTime } from '../../utils/formatters'
import toast from 'react-hot-toast'

const CHANNELS = [
  { value: 'direct', label: 'مباشر' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'regular_center', label: 'مركز عادي' },
  { value: 'specialized_center', label: 'مركز متخصص' },
]

const todayKey = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

export default function SalesPage() {
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [centers, setCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('today') // 'today' | 'all'
  const [posOrders, setPosOrders] = useState([])
  const { user } = useAuth()
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ productId: '', quantity: 1, salesChannel: 'direct', centerId: '', paymentStatus: 'paid', customerName: '', customerPhone: '', notes: '' })

  const load = () => {
    setLoading(true)
    Promise.all([
      salesAPI.getAll({ limit: 500 }).then(r => setSales(r.data.sales || [])),
      internalOrdersAPI.getAll({ ...(range === 'today' ? { date: todayKey() } : {}), limit: 500 }).then(r => setPosOrders(r.data.orders || [])),
      productsAPI.getAll({ status: 'available' }).then(r => setProducts(r.data.products || [])),
      centersAPI.getAll().then(r => setCenters(r.data.centers || [])),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [range])

  const selectedProduct = products.find(p => p._id === form.productId)
  const needsCenter = ['regular_center', 'specialized_center'].includes(form.salesChannel)

  const getUnitPrice = () => {
    if (!selectedProduct) return 0
    if (form.salesChannel === 'regular_center') return selectedProduct.regularCenterPrice
    return selectedProduct.directPrice
  }

  const unitPrice = getUnitPrice()
  const total = unitPrice * form.quantity

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.productId) return toast.error('حدد المنتج')
    if (needsCenter && !form.centerId) return toast.error('حدد مركز البيع')
    setSaving(true)
    try {
      await salesAPI.create({ ...form, quantity: Number(form.quantity) })
      toast.success('تم تسجيل البيع بنجاح')
      setModal(false)
      load()
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setSaving(false) }
  }

  /* One list for every sale: counter (POS) orders and manually recorded sales
     side by side, newest first. Cancelled POS orders are left out. */
  const isAdmin = user?.role === 'admin'
  const isToday = d => new Date(d).toDateString() === new Date().toDateString()
  const rows = [
    ...posOrders.filter(o => o.status !== 'cancelled').map(o => ({
      _id: 'pos-' + o._id, raw: o, kind: 'pos',
      items: (o.items || []).map(i => i.name + ' × ' + i.quantity),
      amount: o.total, profit: o.profit,
      source: 'الكاشير · ' + ({ takeaway: 'سفري', dine_in: 'بالمحل', delivery: 'توصيل' }[o.orderType] || ''),
      payment: { cash: 'نقداً', card: 'بطاقة', unpaid: 'آجل' }[o.paymentMethod] || o.paymentMethod,
      ref: o.orderNumber, date: o.createdAt,
    })),
    ...sales.filter(s => range === 'all' || isToday(s.saleDate)).map(s => ({
      _id: 'sale-' + s._id, raw: s, kind: 'sale',
      items: [s.productNameSnapshot + ' × ' + s.quantity],
      amount: s.netAmount, profit: s.profit,
      source: getChannelText(s.salesChannel) + (s.centerNameSnapshot ? ' · ' + s.centerNameSnapshot : ''),
      payment: getStatusText(s.paymentStatus), paymentCls: getStatusColor(s.paymentStatus),
      ref: '—', date: s.saleDate,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date))
  const totalAmount = rows.reduce((s, r) => s + (r.amount || 0), 0)

  const removePos = async o => {
    if (!confirm('حذف الطلب ' + o.orderNumber + ' نهائياً؟ سترجع الكميات للمخزون ويُعكس المبلغ من الكاش.')) return
    try { const r = await internalOrdersAPI.remove(o._id); toast.success(r.data.message); load() }
    catch (e) { toast.error(e.message) }
  }

  const columns = [
    { key: 'items', label: 'الأصناف', render: v => <div className="space-y-0.5 min-w-[140px]">{v.map((t, i) => <div key={i} className="text-xs font-black text-brand-dark">{t}</div>)}</div> },
    { key: 'amount', label: 'المبلغ', render: v => <span className="font-black text-fuchsia">{formatCurrency(v)}</span> },
    { key: 'profit', label: 'الربح', render: v => <span className={'font-black ' + ((v || 0) >= 0 ? 'text-green-600' : 'text-red-500')}>{formatCurrency(v || 0)}</span> },
    { key: 'source', label: 'المصدر', render: (v, r) => <span className="text-xs font-bold flex items-center gap-1">{r.kind === 'pos' ? <Receipt size={12} /> : <Banknote size={12} />} {v}</span> },
    { key: 'payment', label: 'الدفع', render: (v, r) => <span className={'text-xs px-2 py-1 rounded-lg font-bold ' + (r.paymentCls || 'bg-brand-bg')}>{v}</span> },
    { key: 'ref', label: 'رقم الطلب', render: v => <span className="text-xs font-bold" dir="ltr">{v}</span> },
    { key: 'date', label: 'التاريخ', render: v => formatShopDateTime(v) },
    { key: '_id', label: '', render: (v, r) => isAdmin && r.kind === 'pos' ? (
      <button onClick={() => removePos(r.raw)} className="text-xs bg-red-50 text-red-500 px-2.5 py-1.5 rounded-lg font-bold hover:bg-red-100 flex items-center gap-1"><Trash2 size={12} /> حذف</button>
    ) : null },
  ]

  return (
    <div>
      <PageHeader
        title="المبيعات"
        subtitle="تسجيل ومتابعة عمليات البيع"
        actions={<Button onClick={() => { setForm({ productId: products[0]?._id || '', quantity: 1, salesChannel: 'direct', centerId: '', paymentStatus: 'paid', customerName: '', customerPhone: '', notes: '' }); setModal(true) }}>+ تسجيل بيع</Button>}
      />

      <div className="bg-white rounded-2xl shadow-card p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex gap-1.5">
            {[['today', 'اليوم'], ['all', 'كل الأيام']].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setRange(key)}
                className={'px-4 py-2.5 rounded-xl font-black text-sm transition-colors ' + (range === key ? 'bg-fuchsia text-white' : 'bg-brand-bg text-brand-gray hover:text-brand-dark')}>
                {label}
              </button>
            ))}
          </div>
          <div className="text-sm font-black text-brand-dark">
            {rows.length} عملية بيع · <span className="text-fuchsia">{formatCurrency(totalAmount)}</span>
          </div>
        </div>
        <DataTable columns={columns} data={rows} loading={loading}
          searchable searchPlaceholder="ابحث في المبيعات..."
          emptyIcon={Banknote} emptyTitle={range === 'today' ? 'لا توجد مبيعات اليوم' : 'لا توجد مبيعات'} />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={<span className="flex items-center gap-2"><Banknote size={18} /> تسجيل بيع جديد</span>}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">المنتج *</label>
            <select value={form.productId} onChange={e => set('productId', e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
              <option value="">اختر منتجاً</option>
              {products.map(p => <option key={p._id} value={p._id}>{p.image} {p.name} — متاح: {p.availableQuantity}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">الكمية</label>
              <input type="number" min="1" max={selectedProduct?.availableQuantity || 999} value={form.quantity} onChange={e => set('quantity', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">قناة البيع</label>
              <select value={form.salesChannel} onChange={e => set('salesChannel', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {needsCenter && (
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">مركز البيع *</label>
              <select value={form.centerId} onChange={e => set('centerId', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                <option value="">اختر مركزاً</option>
                {centers.filter(c => c.isActive).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">اسم العميل</label>
              <input value={form.customerName} onChange={e => set('customerName', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">حالة الدفع</label>
              <select value={form.paymentStatus} onChange={e => set('paymentStatus', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                <option value="paid">مدفوع</option>
                <option value="unpaid">غير مدفوع</option>
                <option value="partially_paid">جزئي</option>
              </select>
            </div>
          </div>

          {selectedProduct && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-fuchsia-bg rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-brand-gray font-bold">سعر الوحدة</div>
                <div className="font-black text-brand-dark">{formatCurrency(unitPrice)}</div>
              </div>
              <div className="text-2xl">×</div>
              <div>
                <div className="text-xs text-brand-gray font-bold">الكمية</div>
                <div className="font-black text-brand-dark">{form.quantity}</div>
              </div>
              <div className="text-2xl">=</div>
              <div>
                <div className="text-xs text-brand-gray font-bold">الإجمالي</div>
                <div className="font-black text-fuchsia text-lg">{formatCurrency(total)}</div>
              </div>
            </motion.div>
          )}

          <div className="flex gap-3">
            <Button onClick={save} loading={saving} className="flex-1">تسجيل البيع</Button>
            <Button variant="outline" onClick={() => setModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
