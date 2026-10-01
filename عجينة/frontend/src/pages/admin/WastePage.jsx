import { useEffect, useState } from 'react'
import { wasteAPI, productsAPI, ingredientsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate } from '../../utils/formatters'
import toast from 'react-hot-toast'

const REASONS = ['damaged', 'spilled', 'expired', 'returned_damaged', 'preparation_mistake', 'unsold', 'other']
const REASON_LABELS = { damaged: 'تالف', spilled: 'انسكب', expired: 'منتهي الصلاحية', returned_damaged: 'مرتجع تالف', preparation_mistake: 'خطأ في التحضير', unsold: 'لم يُباع', other: 'أخرى' }

export default function WastePage() {
  const [waste, setWaste] = useState([])
  const [products, setProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ type: 'product', productId: '', ingredientId: '', quantity: 1, estimatedUnitCost: 0, reason: 'damaged', notes: '' })

  const load = () => {
    setLoading(true)
    Promise.all([
      wasteAPI.getAll().then(r => setWaste(r.data.waste || r.data.records || [])),
      productsAPI.getAll().then(r => setProducts(r.data.products || [])),
      ingredientsAPI.getAll().then(r => setIngredients(r.data.ingredients || [])),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const totalWasteCost = waste.reduce((s, w) => s + (w.totalLossCost || 0), 0)

  const save = async () => {
    if (form.type === 'product' && !form.productId) return toast.error('حدد المنتج')
    if (form.type === 'ingredient' && !form.ingredientId) return toast.error('حدد المكون')
    setSaving(true)
    try {
      await wasteAPI.create({
        type: form.type,
        productId: form.type === 'product' ? form.productId : undefined,
        ingredientId: form.type === 'ingredient' ? form.ingredientId : undefined,
        quantity: Number(form.quantity),
        estimatedUnitCost: Number(form.estimatedUnitCost),
        unitType: form.type === 'product' ? 'piece' : (ingredients.find(i => i._id === form.ingredientId)?.unitType || 'gram'),
        reason: form.reason,
        notes: form.notes,
      })
      toast.success('تم تسجيل الهدر')
      setModal(false)
      load()
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setSaving(false) }
  }

  const columns = [
    { key: 'nameSnapshot', label: 'الصنف', render: (v, r) => <div><div className="font-black text-brand-dark">{v}</div><div className="text-xs text-brand-gray">{r.type === 'product' ? 'منتج' : 'مكوّن'}</div></div> },
    { key: 'quantity', label: 'الكمية', render: (v, r) => `${v} ${r.unitType || ''}` },
    { key: 'estimatedUnitCost', label: 'سعر الوحدة', render: v => formatCurrency(v) },
    { key: 'totalLossCost', label: 'الخسارة', render: v => <span className="font-black text-red-500">{formatCurrency(v)}</span> },
    { key: 'reason', label: 'السبب', render: v => REASON_LABELS[v] || v },
    { key: 'wasteDate', label: 'التاريخ', render: v => formatDate(v) },
  ]

  return (
    <div>
      <PageHeader
        title="الهدر 🗑️"
        subtitle="تتبع الخسائر والهدر"
        actions={<Button onClick={() => { setForm({ type: 'product', productId: products[0]?._id || '', ingredientId: ingredients[0]?._id || '', quantity: 1, estimatedUnitCost: 0, reason: 'damaged', notes: '' }); setModal(true) }}>+ تسجيل هدر</Button>}
      />

      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📉</span>
          <div>
            <div className="font-black text-red-600">إجمالي خسائر الهدر</div>
            <div className="text-xs text-red-400 font-bold">جميع السجلات</div>
          </div>
        </div>
        <div className="text-2xl font-black text-red-500">{formatCurrency(totalWasteCost)}</div>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-4">
        <DataTable columns={columns} data={waste} loading={loading} searchable emptyIcon="🗑️" emptyTitle="لا يوجد هدر مسجل" />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="تسجيل هدر 🗑️">
        <div className="space-y-4">
          <div className="flex gap-3">
            {['product', 'ingredient'].map(t => (
              <button key={t} onClick={() => set('type', t)}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${form.type === t ? 'bg-fuchsia text-white' : 'bg-brand-bg text-brand-gray hover:bg-brand-offwhite'}`}>
                {t === 'product' ? '🍽️ منتج' : '🧺 مكوّن'}
              </button>
            ))}
          </div>

          {form.type === 'product' ? (
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">المنتج</label>
              <select value={form.productId} onChange={e => set('productId', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                {products.map(p => <option key={p._id} value={p._id}>{p.name} (متاح: {p.availableQuantity})</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">المكوّن</label>
              <select value={form.ingredientId} onChange={e => set('ingredientId', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                {ingredients.map(i => <option key={i._id} value={i._id}>{i.name} (مخزون: {i.currentStock})</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">الكمية</label>
              <input type="number" min="0.01" step="0.01" value={form.quantity} onChange={e => set('quantity', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">تكلفة الوحدة (ل.س)</label>
              <input type="number" value={form.estimatedUnitCost} onChange={e => set('estimatedUnitCost', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">السبب</label>
            <select value={form.reason} onChange={e => set('reason', e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
              {REASONS.map(r => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
            </select>
          </div>

          <div className="bg-red-50 rounded-xl p-3 flex justify-between">
            <span className="font-bold text-sm text-red-600">الخسارة المقدرة</span>
            <span className="font-black text-red-600">{formatCurrency(form.quantity * form.estimatedUnitCost)}</span>
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">ملاحظات</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold resize-none" />
          </div>

          <div className="flex gap-3">
            <Button onClick={save} loading={saving} variant="danger" className="flex-1">تسجيل الهدر</Button>
            <Button variant="outline" onClick={() => setModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
