import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

  const [deviceBusyId, setDeviceBusyId] = useState(null)

  const pushToDevice = async (emp) => {
    setDeviceBusyId(emp._id)
    try {
      const res = await centerPortalAPI.pushEmployeeToDevice(emp._id)
      toast.success(res.data.message || 'تم الربط بالجهاز')
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setDeviceBusyId(null)
    }
  }

  const enrollFinger = async (emp) => {
    const fingerIndex = window.prompt('رقم الإصبع (0-9)، اتركه فارغاً لاستخدام 0:', '0')
    if (fingerIndex === null) return
    setDeviceBusyId(emp._id)
    try {
      const res = await centerPortalAPI.enrollFingerprint(emp._id, Number(fingerIndex) || 0)
      toast.success(res.data.message || 'الجهاز جاهز للتسجيل')
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setDeviceBusyId(null)
    }
  }

  const clearFinger = async (emp) => {
    if (!confirm(`مسح بصمات ${emp.name}؟`)) return
    setDeviceBusyId(emp._id)
    try {
      const res = await centerPortalAPI.clearFingerprints(emp._id)
      toast.success(res.data.message || 'تم مسح البصمات')
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setDeviceBusyId(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4" style={{ direction: 'rtl' }}>
      <div className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-brand-dark text-base">👥 الموظفون</h2>
          <motion.button whileTap={{ scale: 0.97 }} onClick={openCreate}
            className="px-4 py-2 rounded-xl font-black text-white text-sm shadow"
            style={{ background: 'linear-gradient(135deg, #8B4513, #5C2D0E)' }}>
            + إضافة موظف
          </motion.button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-brand-gray-light font-bold">جاري التحميل...</div>
        ) : employees.length === 0 ? (
          <div className="text-center py-8 text-brand-gray-light font-bold">لا يوجد موظفون بعد</div>
        ) : (
          <div className="space-y-2">
            {employees.map(emp => (
              <div key={emp._id} className="p-3 bg-brand-bg rounded-xl border border-brand-border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-brand-dark">{emp.name}</div>
                    <div className="text-xs text-brand-gray">{emp.role || '—'} · {fmt(emp.monthlySalary)} شهرياً</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(emp)} className="text-xs font-bold text-blue-600 hover:underline">تعديل</button>
                    <button onClick={() => remove(emp)} className="text-xs font-bold text-red-500 hover:underline">حذف</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-brand-border/60">
                  {!emp.devicePin && (
                    <button disabled={deviceBusyId === emp._id} onClick={() => pushToDevice(emp)}
                      className="text-[11px] font-bold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60 px-2.5 py-1 rounded-lg">
                      🖐️ ربط بالبصمة
                    </button>
                  )}
                  {emp.devicePin && (
                    <button disabled={deviceBusyId === emp._id} onClick={() => enrollFinger(emp)}
                      className="text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-2.5 py-1 rounded-lg">
                      ☝️ تسجيل بصمة
                    </button>
                  )}
                  {emp.fingerprintEnrolled && (
                    <button disabled={deviceBusyId === emp._id} onClick={() => clearFinger(emp)}
                      className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 px-2.5 py-1 rounded-lg">
                      🗑️ مسح البصمات
                    </button>
                  )}
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
              <h3 className="font-black text-brand-dark text-lg mb-4">{editing ? 'تعديل موظف' : 'إضافة موظف جديد'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">الاسم</label>
                  <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                </div>
                <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">الراتب الشهري</label>
                  <input type="number" value={form.monthlySalary} onChange={e => setForm(p => ({ ...p, monthlySalary: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-bold text-brand-dark mb-1.5 block">ساعات العمل اليومية</label>
                    <input type="number" value={form.dailyHours} onChange={e => setForm(p => ({ ...p, dailyHours: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-brand-dark mb-1.5 block">أيام العمل بالشهر</label>
                    <input type="number" value={form.workingDays} onChange={e => setForm(p => ({ ...p, workingDays: Number(e.target.value) }))}
                      className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">الوظيفة</label>
                  <input type="text" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                </div>
                <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">الهاتف</label>
                  <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
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
