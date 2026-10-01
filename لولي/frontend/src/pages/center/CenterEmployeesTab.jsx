import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users } from 'lucide-react'
import { centerPortalAPI } from '../../services/api'
import toast from 'react-hot-toast'

const fmt = (n) => Number(n || 0).toLocaleString('ar-SY')

const emptyForm = { name: '', monthlySalary: '', dailyHours: 8, workingDays: 26, role: '', phone: '', notes: '' }

export default function CenterEmployeesTab() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    centerPortalAPI.getEmployees()
      .then(r => setEmployees(r.data.employees || []))
      .catch(err => toast.error(err.message || 'حدث خطأ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModal(true) }
  const openEdit = (emp) => {
    setEditing(emp)
    setForm({
      name: emp.name, monthlySalary: emp.monthlySalary, dailyHours: emp.dailyHours,
      workingDays: emp.workingDays, role: emp.role || '', phone: emp.phone || '', notes: emp.notes || '',
    })
    setModal(true)
  }

  const save = async () => {
    if (!form.name || !form.monthlySalary) return toast.error('الاسم والراتب مطلوبان')
    setSaving(true)
    try {
      if (editing) {
        await centerPortalAPI.updateEmployee(editing._id, form)
        toast.success('تم تحديث الموظف')
      } else {
        await centerPortalAPI.createEmployee(form)
        toast.success('تم إضافة الموظف')
      }
      setModal(false)
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (emp) => {
    if (!confirm(`إلغاء تفعيل ${emp.name}؟`)) return
    try {
      await centerPortalAPI.removeEmployee(emp._id)
      toast.success('تم إلغاء التفعيل')
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4" style={{ direction: 'rtl' }}>
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-gray-800 text-base flex items-center gap-2"><Users size={17} className="text-gray-400" /> الموظفون</h2>
          <motion.button whileTap={{ scale: 0.97 }} onClick={openCreate}
            className="px-4 py-2 rounded-xl font-black text-white text-sm shadow"
            style={{ background: 'linear-gradient(135deg, #C18A4A, #F6B91A)' }}>
            + إضافة موظف
          </motion.button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400 font-bold">جاري التحميل...</div>
        ) : employees.length === 0 ? (
          <div className="text-center py-8 text-gray-400 font-bold">لا يوجد موظفون بعد</div>
        ) : (
          <div className="space-y-2">
            {employees.map(emp => (
              <div key={emp._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <div className="font-bold text-sm text-gray-800">{emp.name}</div>
                  <div className="text-xs text-gray-500">{emp.role || '—'} · {fmt(emp.monthlySalary)} شهرياً</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(emp)} className="text-xs font-bold text-blue-600 hover:underline">تعديل</button>
                  <button onClick={() => remove(emp)} className="text-xs font-bold text-red-500 hover:underline">حذف</button>
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
              className="bg-white rounded-3xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto">
              <h3 className="font-black text-gray-800 text-lg mb-4">{editing ? 'تعديل موظف' : 'إضافة موظف جديد'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-bold text-gray-700 mb-1.5 block">الاسم</label>
                  <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-pink-400 focus:outline-none font-bold text-sm" />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 mb-1.5 block">الراتب الشهري</label>
                  <input type="number" value={form.monthlySalary} onChange={e => setForm(p => ({ ...p, monthlySalary: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-pink-400 focus:outline-none font-bold text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-bold text-gray-700 mb-1.5 block">ساعات العمل اليومية</label>
                    <input type="number" value={form.dailyHours} onChange={e => setForm(p => ({ ...p, dailyHours: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-pink-400 focus:outline-none font-bold text-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-gray-700 mb-1.5 block">أيام العمل بالشهر</label>
                    <input type="number" value={form.workingDays} onChange={e => setForm(p => ({ ...p, workingDays: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-pink-400 focus:outline-none font-bold text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 mb-1.5 block">الوظيفة</label>
                  <input type="text" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-pink-400 focus:outline-none font-bold text-sm" />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 mb-1.5 block">الهاتف</label>
                  <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-pink-400 focus:outline-none font-bold text-sm" />
                </div>
                <div className="flex gap-3 pt-1">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={save} disabled={saving}
                    className="flex-1 py-3 rounded-2xl font-black text-white shadow-lg disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #C18A4A, #F6B91A)' }}>
                    {saving ? '...' : 'حفظ'}
                  </motion.button>
                  <button onClick={() => setModal(false)}
                    className="flex-1 py-3 rounded-2xl font-black border-2 border-gray-200 text-gray-600 hover:bg-gray-50">
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
