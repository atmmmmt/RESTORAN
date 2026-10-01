import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { cashAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import StatCard from '../../components/common/StatCard'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDateTime } from '../../utils/formatters'
import toast from 'react-hot-toast'

const TX_TYPE_LABELS = {
  opening_balance: 'رصيد افتتاحي', sale_income: 'مبيعات', center_collection: 'تحصيل فرع',
  purchase_expense: 'مشتريات', manual_expense: 'مصروف يدوي', manual_income: 'دخل يدوي', adjustment: 'تعديل',
}

export default function CashPage() {
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'income' | 'expense' | 'adjustment'
  const [form, setForm] = useState({ amount: '', description: '', direction: 'in' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      cashAPI.getBalance().then(r => setBalance(r.data.balance)),
      cashAPI.getTransactions().then(r => setTransactions(r.data.transactions || [])),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.amount || !form.description) return toast.error('المبلغ والوصف مطلوبان')
    setSaving(true)
    try {
      if (modal === 'income') await cashAPI.addIncome({ amount: Number(form.amount), description: form.description })
      else if (modal === 'expense') await cashAPI.addExpense({ amount: Number(form.amount), description: form.description })
      else await cashAPI.addAdjustment({ amount: Number(form.amount), direction: form.direction, description: form.description })
      toast.success('تم التسجيل بنجاح')
      setModal(null)
      setForm({ amount: '', description: '', direction: 'in' })
      load()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const columns = [
    { key: 'description', label: 'الوصف', render: v => <span className="font-bold text-brand-dark">{v}</span> },
    { key: 'type', label: 'النوع', render: v => TX_TYPE_LABELS[v] || v },
    { key: 'amount', label: 'المبلغ', render: (v, r) => (
      <span className={`font-black text-base ${r.direction === 'in' ? 'text-green-600' : 'text-red-500'}`}>
        {r.direction === 'in' ? '+' : '-'}{formatCurrency(v)}
      </span>
    )},
    { key: 'transactionDate', label: 'التاريخ', render: v => formatDateTime(v) },
  ]

  const totalIn = transactions.filter(t => t.direction === 'in').reduce((s, t) => s + t.amount, 0)
  const totalOut = transactions.filter(t => t.direction === 'out').reduce((s, t) => s + t.amount, 0)

  return (
    <div>
      <PageHeader
        title="الكاش 🏦"
        subtitle="إدارة الرصيد وحركة الأموال"
        actions={
          <div className="flex gap-2">
            <Button variant="mint" onClick={() => { setForm({ amount: '', description: '', direction: 'in' }); setModal('income') }}>+ دخل</Button>
            <Button variant="danger" onClick={() => { setForm({ amount: '', description: '', direction: 'out' }); setModal('expense') }}>- مصروف</Button>
            <Button variant="outline" onClick={() => { setForm({ amount: '', description: '', direction: 'in' }); setModal('adjustment') }}>تعديل</Button>
          </div>
        }
      />

      {/* Balance card */}
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-fuchsia to-fuchsia-dark text-white rounded-3xl p-7 mb-6 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 text-[120px] flex items-center justify-end pr-6 pointer-events-none select-none">💵</div>
        <div className="text-sm font-bold opacity-80 mb-2">الرصيد الحالي</div>
        <div className="text-5xl font-black mb-2">{formatCurrency(balance)}</div>
        <div className="flex gap-6 mt-4 text-sm">
          <div><div className="text-white/85 font-bold">إجمالي الدخل</div><div className="font-black text-lg">+{formatCurrency(totalIn)}</div></div>
          <div><div className="text-white/85 font-bold">إجمالي المصروف</div><div className="font-black text-lg">-{formatCurrency(totalOut)}</div></div>
        </div>
      </motion.div>

      <div className="bg-white rounded-2xl shadow-card p-4">
        <h2 className="font-black text-brand-dark mb-4">سجل الحركات</h2>
        <DataTable columns={columns} data={transactions} loading={loading}
          emptyIcon="🏦" emptyTitle="لا توجد حركات" />
      </div>

      <Modal open={Boolean(modal)} onClose={() => setModal(null)}
        title={modal === 'income' ? 'إضافة دخل ✅' : modal === 'expense' ? 'إضافة مصروف 📤' : 'تعديل الرصيد ⚖️'}>
        <div className="space-y-4">
          {modal === 'adjustment' && (
            <div className="flex gap-3">
              {['in', 'out'].map(d => (
                <button key={d} onClick={() => setForm(f => ({ ...f, direction: d }))}
                  className={`flex-1 py-3 rounded-xl font-bold transition-all ${form.direction === d ? (d === 'in' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'bg-brand-bg text-brand-gray'}`}>
                  {d === 'in' ? '+ دخل' : '- خروج'}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">المبلغ (ل.س) *</label>
            <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-xl" />
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">الوصف *</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
              placeholder="وصف الحركة..." />
          </div>
          <div className="flex gap-3">
            <Button onClick={save} loading={saving} className="flex-1">تسجيل</Button>
            <Button variant="outline" onClick={() => setModal(null)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
