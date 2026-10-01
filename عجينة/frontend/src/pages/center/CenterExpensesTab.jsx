import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { centerPortalAPI } from '../../services/api'
import toast from 'react-hot-toast'

const fmt = (n) => Number(n || 0).toLocaleString('ar-SY')
const fmtDate = (d) => new Date(d).toLocaleDateString('ar-SY', { year: 'numeric', month: 'short', day: 'numeric' })

const emptyForm = { amount: '', description: '', direction: 'out' }

export default function CenterExpensesTab() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    centerPortalAPI.getExpenses()
      .then(r => setTransactions(r.data.transactions || []))
      .catch(err => toast.error(err.message || 'حدث خطأ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(emptyForm); setModal(true) }

  const save = async () => {
    if (!form.amount || !form.description) return toast.error('المبلغ والوصف مطلوبان')
    setSaving(true)
    try {
      await centerPortalAPI.createExpense(form)
      toast.success('تم تسجيل المصروف')
      setModal(false)
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (tx) => {
    if (!confirm('حذف هذه المعاملة؟')) return
    try {
      await centerPortalAPI.removeExpense(tx._id)
      toast.success('تم الحذف')
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4" style={{ direction: 'rtl' }}>
      <div className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-brand-dark text-base">🧾 المصاريف</h2>
          <motion.button whileTap={{ scale: 0.97 }} onClick={openCreate}
            className="px-4 py-2 rounded-xl font-black text-white text-sm shadow"
            style={{ background: 'linear-gradient(135deg, #8B4513, #5C2D0E)' }}>
            + إضافة مصروف
          </motion.button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-brand-gray-light font-bold">جاري التحميل...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-brand-gray-light font-bold">لا توجد معاملات بعد</div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx._id} className="flex items-center justify-between p-3 bg-brand-bg rounded-xl border border-brand-border">
                <div>
                  <div className="font-bold text-sm text-brand-dark">{tx.description}</div>
                  <div className="text-xs text-brand-gray">{fmtDate(tx.transactionDate)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-black text-sm ${tx.direction === 'in' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.direction === 'in' ? '+' : '-'}{fmt(tx.amount)}
                  </span>
                  <button onClick={() => remove(tx)} className="text-xs font-bold text-red-500 hover:underline">حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4"
            onClick={e => e.target === e.currentTarget && setModal(false)}
          >
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm">
              <h3 className="font-black text-brand-dark text-lg mb-4">إضافة مصروف</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">النوع</label>
                  <select value={form.direction} onChange={e => setForm(p => ({ ...p, direction: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm bg-white">
                    <option value="out">مصروف</option>
                    <option value="in">دخل</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">المبلغ</label>
                  <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-lg" />
                </div>
                <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">الوصف</label>
                  <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                </div>
                <div className="flex gap-3 pt-1">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={save} disabled={saving}
                    className="flex-1 py-3 rounded-2xl font-black text-white shadow-lg disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #8B4513, #5C2D0E)' }}>
                    {saving ? '...' : 'حفظ'}
                  </motion.button>
                  <button onClick={() => setModal(false)}
                    className="flex-1 py-3 rounded-2xl font-black border-2 border-brand-border text-brand-gray hover:bg-brand-bg">
                    إلغاء
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
