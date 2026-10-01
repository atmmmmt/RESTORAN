import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart } from 'lucide-react'
import { centerPortalAPI } from '../../services/api'
import toast from 'react-hot-toast'

/**
 * Local purchases made by the branch.
 *
 * Runs through the same server-side controller as head-office purchasing, so
 * stock and weighted-average cost stay consistent across the business — the
 * only difference is which till the money leaves.
 */

const fmt = n => Number(n || 0).toLocaleString('ar-SY')
const fmtDate = d => new Date(d).toLocaleDateString('ar-SY', { year: 'numeric', month: 'short', day: 'numeric' })

const emptyLine = () => ({ ingredientId: '', quantity: '', totalCost: '' })

export default function CenterPurchasesTab() {
  const [purchases, setPurchases] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [supplier, setSupplier] = useState('')
  const [lines, setLines] = useState([emptyLine()])
  const [notes, setNotes] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      centerPortalAPI.getPurchases().then(r => setPurchases(r.data.purchases || [])),
      centerPortalAPI.getIngredients().then(r => setIngredients(r.data.ingredients || [])).catch(() => {}),
    ])
      .catch(err => toast.error(err.message || 'حدث خطأ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setSupplier(''); setLines([emptyLine()]); setNotes('')
    setModal(true)
  }

  const setLine = (i, patch) =>
    setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const addLine = () => setLines(ls => [...ls, emptyLine()])
  const removeLine = i => setLines(ls => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)))

  const total = lines.reduce((s, l) => s + (Number(l.totalCost) || 0), 0)

  const save = async () => {
    if (!supplier.trim()) return toast.error('أدخل اسم المورّد')

    const items = lines
      .filter(l => l.ingredientId && Number(l.quantity) > 0 && Number(l.totalCost) >= 0)
      .map(l => {
        const ing = ingredients.find(i => i._id === l.ingredientId)
        return {
          ingredientId: l.ingredientId,
          quantity: Number(l.quantity),
          unitType: ing?.unitType || 'piece',
          totalCost: Number(l.totalCost),
        }
      })

    if (!items.length) return toast.error('أضف صنفاً واحداً على الأقل بكمية وسعر')

    setSaving(true)
    try {
      await centerPortalAPI.createPurchase({ supplierName: supplier.trim(), items, notes })
      toast.success('تم تسجيل الشراء — خُصم من صندوق الفرع')
      setModal(false)
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const totalSpent = purchases.reduce((s, p) => s + (p.totalPurchaseCost || 0), 0)

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 font-bold">إجمالي مشتريات الفرع</div>
            <div className="text-2xl font-black text-gray-800">{fmt(totalSpent)} ل.س</div>
            <div className="text-xs text-gray-400 font-bold mt-0.5">{purchases.length} عملية</div>
          </div>
          <button onClick={openCreate}
            className="px-4 py-2.5 rounded-xl text-white font-black text-sm shadow"
            style={{ background: 'linear-gradient(135deg, #C18A4A, #F6B91A)' }}>
            + شراء جديد
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 font-bold text-sm">جاري التحميل…</div>
      ) : purchases.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
          <ShoppingCart size={36} className="mx-auto mb-2 text-gray-300" strokeWidth={1.5} />
          <div className="font-black text-gray-500">لا توجد مشتريات</div>
          <div className="text-xs text-gray-400 font-bold mt-1">سجّل ما تشتريه محلياً للفرع</div>
        </div>
      ) : (
        <div className="space-y-2">
          {purchases.map(p => (
            <div key={p._id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="font-black text-gray-800 truncate">{p.supplierName}</div>
                  <div className="text-xs text-gray-400 font-bold mt-0.5">{fmtDate(p.purchaseDate)}</div>
                </div>
                <div className="text-left flex-shrink-0">
                  <div className="font-black text-gray-800">{fmt(p.totalPurchaseCost)}</div>
                  <div className="text-[11px] text-gray-400 font-bold">ل.س</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(p.items || []).map((it, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-lg font-bold bg-gray-100 text-gray-600">
                    {it.ingredientNameSnapshot} × {it.quantity}
                  </span>
                ))}
              </div>
              {p.notes && <div className="text-xs text-gray-500 font-medium mt-2">{p.notes}</div>}
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
              className="bg-white rounded-3xl w-full max-w-md p-5 max-h-[88vh] overflow-y-auto"
            >
              <h3 className="font-black text-lg text-gray-800 mb-4">شراء جديد</h3>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">المورّد</label>
                  <input value={supplier} onChange={e => setSupplier(e.target.value)}
                    placeholder="اسم المحل أو المورّد"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl font-bold text-sm focus:border-pink-400 focus:outline-none" />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 mb-2 block">الأصناف</label>
                  <div className="space-y-2">
                    {lines.map((l, i) => (
                      <div key={i} className="rounded-xl border-2 border-gray-100 p-2.5">
                        <div className="flex items-center gap-2 mb-2">
                          <select value={l.ingredientId}
                            onChange={e => setLine(i, { ingredientId: e.target.value })}
                            className="flex-1 min-w-0 px-3 py-2 border-2 border-gray-200 rounded-lg font-bold text-xs bg-white focus:border-pink-400 focus:outline-none">
                            <option value="">— اختر مكوّناً —</option>
                            {ingredients.map(ing => (
                              <option key={ing._id} value={ing._id}>{ing.name}</option>
                            ))}
                          </select>
                          {lines.length > 1 && (
                            <button onClick={() => removeLine(i)}
                              className="text-red-400 font-black text-lg px-1 flex-shrink-0">×</button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" min="0" step="0.01" value={l.quantity}
                            onChange={e => setLine(i, { quantity: e.target.value })}
                            placeholder="الكمية"
                            className="px-3 py-2 border-2 border-gray-200 rounded-lg font-bold text-xs focus:border-pink-400 focus:outline-none" />
                          <input type="number" min="0" value={l.totalCost}
                            onChange={e => setLine(i, { totalCost: e.target.value })}
                            placeholder="السعر الكلي"
                            className="px-3 py-2 border-2 border-gray-200 rounded-lg font-bold text-xs focus:border-pink-400 focus:outline-none" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={addLine}
                    className="mt-2 text-xs font-black text-pink-500">+ إضافة صنف</button>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">ملاحظات</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl font-bold text-sm focus:border-pink-400 focus:outline-none" />
                </div>

                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50">
                  <span className="text-sm font-bold text-gray-600">الإجمالي</span>
                  <span className="text-lg font-black text-gray-800">{fmt(total)} ل.س</span>
                </div>

                <p className="text-[11px] text-gray-400 font-bold">
                  يُخصم المبلغ من صندوق فرعك، ويُضاف المكوّن للمخزون تلقائياً.
                </p>
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={save} disabled={saving}
                  className="flex-1 py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #C18A4A, #F6B91A)' }}>
                  {saving ? '…' : 'تسجيل الشراء'}
                </button>
                <button onClick={() => setModal(false)}
                  className="px-5 py-3 rounded-xl font-bold text-sm text-gray-500 border-2 border-gray-200">
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
