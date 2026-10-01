import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CookingPot, UtensilsCrossed } from 'lucide-react'
import { productionAPI, productsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate } from '../../utils/formatters'
import toast from 'react-hot-toast'

export default function ProductionPage() {
  const [batches, setBatches] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ productId: '', quantityProduced: 1, notes: '' })

  const load = () => {
    setLoading(true)
    Promise.all([
      productionAPI.getAll().then(r => setBatches(r.data.batches || r.data.productionBatches || [])),
      productsAPI.getAll().then(r => setProducts((r.data.products || []).filter(p => p.status !== 'hidden'))),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const selectedProduct = products.find(p => p._id === form.productId)

  const save = async () => {
    if (!form.productId || !form.quantityProduced) return toast.error('حدد المنتج والكمية')
    setSaving(true)
    try {
      await productionAPI.create({
        productId: form.productId,
        quantityProduced: Number(form.quantityProduced),
        notes: form.notes,
        productionDate: new Date(),
      })
      toast.success(`تم تسجيل إنتاج ${form.quantityProduced} وحدة بنجاح`)
      setModal(false)
      load()
    } catch (e) { toast.error(e.message || 'خطأ في الإنتاج — تحقق من المخزون') }
    finally { setSaving(false) }
  }

  const estimatedCost = selectedProduct ? (selectedProduct.calculatedCost || 0) * form.quantityProduced : 0

  const columns = [
    { key: 'productNameSnapshot', label: 'المنتج', render: v => <span className="font-black text-brand-dark">{v}</span> },
    { key: 'quantityProduced', label: 'الكمية', render: v => <span className="font-black text-fuchsia">{v} وحدة</span> },
    { key: 'totalCost', label: 'تكلفة الدفعة', render: v => formatCurrency(v) },
    { key: 'unitCostSnapshot', label: 'تكلفة الوحدة', render: v => formatCurrency(v) },
    { key: 'productionDate', label: 'التاريخ', render: v => formatDate(v) },
    { key: 'notes', label: 'ملاحظات', render: v => v || '—' },
  ]

  return (
    <div>
      <PageHeader
        title="دفعات الإنتاج"
        subtitle="تسجيل إنتاج الوجبات وتحديث المخزون"
        actions={<Button onClick={() => { setForm({ productId: products[0]?._id || '', quantityProduced: 1, notes: '' }); setModal(true) }}>+ دفعة إنتاج جديدة</Button>}
      />

      {/* Product stock cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {products.map((p, i) => (
          <motion.div key={p._id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-white rounded-2xl shadow-card p-4 text-center">
            <div className="h-8 flex items-center justify-center mb-1">
              {p.image?.startsWith('http')
                ? <img src={p.image} alt="" className="h-8 w-8 rounded-lg object-cover" />
                : <UtensilsCrossed size={20} className="text-brand-gray-light" />}
            </div>
            <div className="font-black text-brand-dark text-xs mb-2 truncate">{p.name}</div>
            <div className={`text-xl font-black ${p.availableQuantity === 0 ? 'text-red-500' : 'text-fuchsia'}`}>{p.availableQuantity}</div>
            <div className="text-xs text-brand-gray font-bold">متاح</div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-card p-4">
        <DataTable columns={columns} data={batches} loading={loading}
          emptyIcon={CookingPot} emptyTitle="لا توجد دفعات إنتاج" emptyDescription="ابدأ بتسجيل أول دفعة" />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={<span className="flex items-center gap-2"><CookingPot size={18} /> دفعة إنتاج جديدة</span>}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">المنتج *</label>
            <select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
              <option value="">اختر منتجاً</option>
              {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">الكمية المنتجة *</label>
            <input type="number" min="1" value={form.quantityProduced} onChange={e => setForm(f => ({ ...f, quantityProduced: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
          </div>

          {selectedProduct && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-fuchsia-bg rounded-2xl p-4 space-y-2">
              <div className="font-black text-brand-dark text-sm mb-2">ملخص الدفعة</div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-gray font-bold">تكلفة الوحدة</span>
                <span className="font-black text-brand-dark">{formatCurrency(selectedProduct.calculatedCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-gray font-bold">إجمالي التكلفة</span>
                <span className="font-black text-fuchsia">{formatCurrency(estimatedCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-gray font-bold">المخزون الحالي</span>
                <span className="font-black text-brand-dark">{selectedProduct.availableQuantity} وحدة</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-gray font-bold">بعد الإنتاج</span>
                <span className="font-black text-green-600">{Number(selectedProduct.availableQuantity) + Number(form.quantityProduced)} وحدة</span>
              </div>
            </motion.div>
          )}

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold resize-none" />
          </div>

          <div className="flex gap-3">
            <Button onClick={save} loading={saving} className="flex-1">تسجيل الإنتاج</Button>
            <Button variant="outline" onClick={() => setModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
