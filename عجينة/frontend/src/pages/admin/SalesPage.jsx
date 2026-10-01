import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { salesAPI, productsAPI, centersAPI, settingsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate, getChannelText, getStatusColor, getStatusText } from '../../utils/formatters'
import toast from 'react-hot-toast'

const CHANNELS = [
  { value: 'direct', label: 'مباشر' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'regular_center', label: 'فرع عادي' },
  { value: 'specialized_center', label: 'فرع متخصص' },
]

export default function SalesPage() {
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [centers, setCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ productId: '', quantity: 1, salesChannel: 'direct', centerId: '', paymentStatus: 'paid', customerName: '', customerPhone: '', notes: '' })

  const load = () => {
    setLoading(true)
    Promise.all([
      salesAPI.getAll().then(r => setSales(r.data.sales || [])),
      productsAPI.getAll({ status: 'available' }).then(r => setProducts(r.data.products || [])),
      centersAPI.getAll().then(r => setCenters(r.data.centers || [])),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  /* The partner's flat cut of the takings — the same figure the receipt and
     the end-of-day report print, so the three never disagree. */
  const [investor, setInvestor] = useState(null)
  useEffect(() => {
    settingsAPI.getInvestor().then(r => setInvestor(r.data.investor)).catch(() => {})
  }, [])

  const totalSales = sales.reduce((sum, row) => sum + (row.netAmount || 0), 0)
  const investorCut = investor ? Math.round(totalSales * Number(investor.percent || 0) / 100) : 0

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
    if (needsCenter && !form.centerId) return toast.error('حدد فرع البيع')
    setSaving(true)
    try {
      await salesAPI.create({ ...form, quantity: Number(form.quantity) })
      toast.success('تم تسجيل البيع بنجاح 💰')
      setModal(false)
      load()
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setSaving(false) }
  }

  const columns = [
    { key: 'productNameSnapshot', label: 'المنتج', render: v => <span className="font-black text-brand-dark">{v}</span> },
    { key: 'quantity', label: 'الكمية' },
    { key: 'netAmount', label: 'الصافي', render: v => <span className="font-black text-fuchsia">{formatCurrency(v)}</span> },
    { key: 'profit', label: 'الربح', render: v => <span className={`font-black ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(v)}</span> },
    { key: 'salesChannel', label: 'القناة', render: v => getChannelText(v) },
    { key: 'centerNameSnapshot', label: 'الفرع', render: v => v || '—' },
    { key: 'paymentStatus', label: 'الدفع', render: v => <span className={`text-xs px-2 py-1 rounded-lg font-bold ${getStatusColor(v)}`}>{getStatusText(v)}</span> },
    ...(investor && investor.enabled !== false && Number(investor.percent) > 0
      ? [{
          /* Its own key: two columns sharing one would collide in the table. */
          key: 'investorShare',
          label: `نسبة ${investor.name}`,
          render: (_v, row) => (
            <span className="font-black text-amber-600">
              {formatCurrency(Math.round((row.netAmount || 0) * Number(investor.percent) / 100))}
            </span>
          ),
        }]
      : []),
    { key: 'saleDate', label: 'التاريخ', render: v => formatDate(v) },
  ]

  return (
    <div>
      <PageHeader
        title="المبيعات 💰"
        subtitle="تسجيل ومتابعة عمليات البيع"
        actions={<Button onClick={() => { setForm({ productId: products[0]?._id || '', quantity: 1, salesChannel: 'direct', centerId: '', paymentStatus: 'paid', customerName: '', customerPhone: '', notes: '' }); setModal(true) }}>+ تسجيل بيع</Button>}
      />


      {investor && investor.enabled !== false && Number(investor.percent) > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {[
            { label: 'إجمالي المبيعات', value: formatCurrency(totalSales), color: '#2E7A4A' },
            { label: `نسبة ${investor.name} (${investor.percent}%)`, value: formatCurrency(investorCut), color: '#B8860B' },
            { label: 'الباقي للمحل', value: formatCurrency(totalSales - investorCut), color: '#A96734' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-2xl p-4 shadow-card">
              <div className="text-xs text-brand-gray font-bold">{card.label}</div>
              <div className="font-black text-lg" style={{ color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card p-4">
        <DataTable columns={columns} data={sales} loading={loading}
          searchable searchPlaceholder="ابحث في المبيعات..."
          emptyIcon="💰" emptyTitle="لا توجد مبيعات" />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="تسجيل بيع جديد 💰">
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
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">فرع البيع *</label>
              <select value={form.centerId} onChange={e => set('centerId', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                <option value="">اختر فرعاً</option>
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
