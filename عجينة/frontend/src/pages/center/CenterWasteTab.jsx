import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { centerPortalAPI } from '../../services/api'
import toast from 'react-hot-toast'

/**
 * Branch waste log.
 *
 * Everything here is scoped server-side by req.center, so a branch only ever
 * sees and creates its own losses. The cost is computed on the server from
 * the product's real recipe cost — the branch never types a price, which
 * keeps the loss figure honest.
 */

const fmt = n => Number(n || 0).toLocaleString('ar-SY')
const fmtDate = d => new Date(d).toLocaleDateString('ar-SY', { year: 'numeric', month: 'short', day: 'numeric' })

const REASONS = [
  { value: 'expired',   label: 'انتهت الصلاحية' },
  { value: 'damaged',   label: 'تلف' },
  { value: 'burnt',     label: 'احتراق' },
  { value: 'overproduction', label: 'إنتاج زائد' },
  { value: 'other',     label: 'أخرى' },
]

const emptyForm = { productId: '', quantity: 1, reason: 'expired', notes: '' }

export default function CenterWasteTab({ inventory = [] }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    centerPortalAPI.getWaste()
      .then(r => setRecords(r.data.waste || []))
      .catch(err => toast.error(err.message || 'حدث خطأ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    const first = inventory.find(i => i.quantity > 0)
    setForm({ ...emptyForm, productId: first?.productId || '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.productId) return toast.error('اختر الصنف')
    if (!form.quantity || form.quantity <= 0) return toast.error('أدخل كمية صحيحة')

    setSaving(true)
    try {
      const res = await centerPortalAPI.createWaste({
        type: 'product',
        productId: form.productId,
        quantity: Number(form.quantity),
        unitType: 'piece',
        reason: form.reason,
        notes: form.notes,
      })
      toast.success(`تم التسجيل — الخسارة ${fmt(res.data.impact?.totalLossCost)} ل.س`)
      setModal(false)
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const totalLoss = records.reduce((s, r) => s + (r.totalLossCost || 0), 0)

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <div className="bg-white rounded-2xl p-4 shadow-card mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-brand-gray font-bold">إجمالي الهدر المسجّل</div>
            <div className="text-2xl font-black text-red-500">{fmt(totalLoss)} ل.س</div>
            <div className="text-xs text-brand-gray-light font-bold mt-0.5">{records.length} سجل</div>
          </div>
          <button onClick={openCreate}
            className="px-4 py-2.5 rounded-xl text-white font-black text-sm shadow"
            style={{ background: 'linear-gradient(135deg, #8B4513, #5C2D0E)' }}>
            + تسجيل هدر
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-brand-gray-light font-bold text-sm">جاري التحميل…</div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-card">
          <div className="text-4xl mb-2">🗑️</div>
          <div className="font-black text-brand-gray">لا يوجد هدر مسجّل</div>
          <div className="text-xs text-brand-gray-light font-bold mt-1">سجّل أي صنف تالف أو منتهي الصلاحية</div>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r._id} className="bg-white rounded-2xl p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-black text-brand-dark truncate">{r.nameSnapshot}</div>
                  <div className="text-xs text-brand-gray font-bold mt-0.5">
                    {r.quantity} وحدة · {REASONS.find(x => x.value === r.reason)?.label || r.reason}
                  </div>
                  <div className="text-xs text-brand-gray-light font-bold mt-0.5">{fmtDate(r.wasteDate)}</div>
                  {r.notes && <div className="text-xs text-brand-gray font-medium mt-1">{r.notes}</div>}
                </div>
                <div className="text-left flex-shrink-0">
                  <div className="font-black text-red-500">−{fmt(r.totalLossCost)}</div>
                  <div className="text-[11px] text-brand-gray-light font-bold">ل.س</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setModal(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md p-5"
            >
              <h3 className="font-black text-lg text-brand-dark mb-4">تسجيل هدر</h3>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-brand-gray mb-1 block">الصنف</label>
                  <select value={form.productId}
                    onChange={e => setForm(p => ({ ...p, productId: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-brand-border rounded-xl font-bold text-sm bg-white focus:border-fuchsia focus:outline-none">
                    <option value="">— اختر —</option>
                    {inventory.map(i => (
                      <option key={i.productId} value={i.productId}>
                        {i.productNameSnapshot} (متاح {i.quantity})
                      </option>
                    ))}
                  </select>
                  {inventory.length === 0 && (
                    <p className="text-[11px] text-amber-600 font-bold mt-1">
                      لا يوجد مخزون في هذا الفرع حالياً
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-brand-gray mb-1 block">الكمية</label>
                    <input type="number" min="1" value={form.quantity}
                      onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))}
                      className="w-full px-4 py-3 border-2 border-brand-border rounded-xl font-bold text-sm focus:border-fuchsia focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-brand-gray mb-1 block">السبب</label>
                    <select value={form.reason}
                      onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-brand-border rounded-xl font-bold text-sm bg-white focus:border-fuchsia focus:outline-none">
                      {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-brand-gray mb-1 block">ملاحظات</label>
                  <input value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-brand-border rounded-xl font-bold text-sm focus:border-fuchsia focus:outline-none" />
                </div>

                <p className="text-[11px] text-brand-gray-light font-bold">
                  تُحتسب قيمة الخسارة تلقائياً من تكلفة الصنف — لا حاجة لإدخال سعر.
                </p>
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={save} disabled={saving}
                  className="flex-1 py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #8B4513, #5C2D0E)' }}>
                  {saving ? '…' : 'تسجيل'}
                </button>
                <button onClick={() => setModal(false)}
                  className="px-5 py-3 rounded-xl font-bold text-sm text-brand-gray border-2 border-brand-border">
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
