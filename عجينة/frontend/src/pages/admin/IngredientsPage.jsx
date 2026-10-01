import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ingredientsAPI, nutritionAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import DataTable from '../../components/common/DataTable'
import Modal from '../../components/common/Modal'
import Button from '../../components/common/Button'
import { formatCurrency, formatNumber } from '../../utils/formatters'
import toast from 'react-hot-toast'

const UNIT_LABELS = { gram: 'غم', kg: 'كغ', ml: 'مل', liter: 'لتر', piece: 'قطعة' }

const INITIAL = {
  name: '', unitType: 'gram', lowStockThreshold: 100,
  nutritionPerUnit: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  notes: '',
}

/* factor to convert Open Food Facts "per 100g" → "per 1 unit" */
const NUT_FACTOR = { gram: 0.01, kg: 0.1, ml: 0.01, liter: 0.1, piece: 1 }

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(INITIAL)
  const [saving, setSaving] = useState(false)
  const [fetchingNut, setFetchingNut] = useState(false)

  const load = () => {
    setLoading(true)
    ingredientsAPI.getAll().then(r => setIngredients(r.data.ingredients || [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(INITIAL); setModal(true) }
  const openEdit = (row) => {
    setEditing(row)
    setForm({ name: row.name, unitType: row.unitType, lowStockThreshold: row.lowStockThreshold || 100, nutritionPerUnit: row.nutritionPerUnit || {}, notes: row.notes || '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.name) return toast.error('اسم المكون مطلوب')
    setSaving(true)
    try {
      if (editing) {
        await ingredientsAPI.update(editing._id, form)
        toast.success('تم تحديث المكون')
      } else {
        await ingredientsAPI.create(form)
        toast.success('تم إضافة المكون')
      }
      setModal(false)
      load()
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('حذف هذا المكون؟')) return
    try { await ingredientsAPI.delete(id); toast.success('تم الحذف'); load() }
    catch (e) { toast.error(e.message) }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setNut = (k, v) => setForm(f => ({ ...f, nutritionPerUnit: { ...f.nutritionPerUnit, [k]: Number(v) } }))

  /* ── Auto-fetch nutrition via backend proxy (avoids CORS) ── */
  const fetchNutrition = async () => {
    if (!form.name.trim()) return toast.error('أدخل اسم المكون أولاً')
    setFetchingNut(true)
    try {
      const r = await nutritionAPI.search(form.name, form.unitType)
      if (!r.data.success) return toast.error(r.data.message || 'لم يُعثر على بيانات')
      setForm(prev => ({ ...prev, nutritionPerUnit: r.data.nutritionPerUnit }))
      toast.success(`✅ تم الجلب من: ${r.data.source}`)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'تعذّر الاتصال بالسيرفر')
    } finally {
      setFetchingNut(false)
    }
  }

  const columns = [
    { key: 'name', label: 'المكون', render: (v, r) => (
      <div className="flex items-center gap-2">
        <span className="font-black text-brand-dark">{v}</span>
        {r.currentStock <= r.lowStockThreshold && (
          <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-lg font-bold">مخزون منخفض</span>
        )}
      </div>
    )},
    { key: 'currentStock', label: 'المخزون', render: (v, r) => `${formatNumber(v)} ${UNIT_LABELS[r.unitType] || r.unitType}` },
    { key: 'averageCostPerUnit', label: 'متوسط التكلفة', render: v => `${formatNumber(v)} ل.س` },
    { key: 'unitType', label: 'الوحدة', render: v => UNIT_LABELS[v] || v },
    { key: '_id', label: 'إجراءات', render: (v, r) => (
      <div className="flex gap-2">
        <button onClick={() => openEdit(r)} className="text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors">تعديل</button>
        <button onClick={() => del(v)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors">حذف</button>
      </div>
    )},
  ]

  return (
    <div>
      <PageHeader
        title="المكونات 🧺"
        subtitle="إدارة المواد الخام ومخزونها"
        actions={<Button onClick={openAdd}>+ إضافة مكون</Button>}
      />

      {/* Low stock alert */}
      {ingredients.filter(i => i.currentStock <= i.lowStockThreshold).length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <div className="font-black text-red-600 text-sm">تحذير: مخزون منخفض</div>
            <div className="text-red-500 text-xs">{ingredients.filter(i => i.currentStock <= i.lowStockThreshold).map(i => i.name).join('، ')}</div>
          </div>
        </motion.div>
      )}

      <div className="bg-white rounded-2xl shadow-card p-4">
        <DataTable columns={columns} data={ingredients} loading={loading}
          searchable searchPlaceholder="ابحث عن مكون..." emptyIcon="🧺" emptyTitle="لا توجد مكونات" />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل مكون' : 'إضافة مكون جديد'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-brand-dark mb-1.5">اسم المكون *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
              placeholder="مثال: رز، دجاج، بندورة..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-brand-dark mb-1.5">وحدة القياس</label>
              <select value={form.unitType} onChange={e => set('unitType', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-brand-dark mb-1.5">حد التنبيه</label>
              <input type="number" value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', Number(e.target.value))}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold text-brand-dark">
                القيمة الغذائية (لكل وحدة)
              </label>
              <button
                type="button"
                onClick={fetchNutrition}
                disabled={fetchingNut}
                className="inline-flex items-center gap-1.5 text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors disabled:opacity-50">
                {fetchingNut ? (
                  <><span className="w-3 h-3 border-2 border-fuchsia border-t-transparent rounded-full animate-spin" /> جارٍ الجلب...</>
                ) : (
                  <>🔍 جلب تلقائي</>
                )}
              </button>
            </div>
            <p className="text-xs text-brand-gray-light mb-2 font-medium">
              💡 يجلب القيم تلقائياً من قاعدة بيانات Open Food Facts — يفضّل الاسم بالإنجليزي
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[['calories', 'سعرات (kcal)'], ['protein', 'بروتين (غ)'], ['carbs', 'كربوهيدرات (غ)'], ['fat', 'دهون (غ)']].map(([k, l]) => (
                <div key={k}>
                  <label className="text-xs text-brand-gray font-bold mb-1 block">{l}</label>
                  <input type="number" step="0.001" value={form.nutritionPerUnit[k] || 0} onChange={e => setNut(k, e.target.value)}
                    className="w-full px-3 py-2 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-brand-dark mb-1.5">ملاحظات</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={save} loading={saving} className="flex-1">حفظ</Button>
            <Button variant="outline" onClick={() => setModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
