import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { centerPortalAPI } from '../../services/api'
import toast from 'react-hot-toast'

const fmt = (n) => Number(n || 0).toLocaleString('ar-SY')
const currentMonth = () => new Date().toISOString().slice(0, 7)

export default function CenterSalaryTab() {
  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [month, setMonth] = useState(currentMonth())
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      centerPortalAPI.getSalaryRecords({ month }).then(r => setRecords(r.data.records || [])),
      centerPortalAPI.getEmployees({ isActive: true }).then(r => setEmployees(r.data.employees || [])),
    ]).catch(err => toast.error(err.message || 'حدث خطأ')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [month])

  const openCreate = () => {
    setEmployeeId(employees[0]?._id || '')
    setModal(true)
  }

  const createRecord = async () => {
    if (!employeeId) return toast.error('اختر الموظف')
    setSaving(true)
    try {
      await centerPortalAPI.initSalaryRecord({ employeeId, month })
      toast.success('تم إنشاء سجل الراتب')
      setModal(false)
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const pay = async (rec) => {
    if (!confirm(`صرف راتب ${rec.employeeName} بقيمة ${fmt(rec.finalSalary)}؟`)) return
    try {
      await centerPortalAPI.paySalaryRecord(rec._id)
      toast.success('تم صرف الراتب')
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    }
  }

  const [syncingId, setSyncingId] = useState(null)

  const syncAttendance = async (rec) => {
    setSyncingId(rec._id)
    try {
      const res = await centerPortalAPI.syncSalaryAttendance(rec._id, 'salary')
      toast.success(res.data.message || 'تمت المزامنة')
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setSyncingId(null)
    }
  }

  const remove = async (rec) => {
    if (!confirm(`حذف سجل راتب ${rec.employeeName}؟`)) return
    try {
      await centerPortalAPI.removeSalaryRecord(rec._id)
      toast.success('تم الحذف')
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4" style={{ direction: 'rtl' }}>
      <div className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="font-black text-brand-dark text-base">💵 سجلات الرواتب</h2>
          <div className="flex items-center gap-2">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-1.5 border-2 border-brand-border rounded-xl font-bold text-sm" />
            <motion.button whileTap={{ scale: 0.97 }} onClick={openCreate}
              className="px-4 py-2 rounded-xl font-black text-white text-sm shadow whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg, #8B4513, #5C2D0E)' }}>
              + سجل جديد
            </motion.button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-brand-gray-light font-bold">جاري التحميل...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-brand-gray-light font-bold">لا توجد سجلات لهذا الشهر</div>
        ) : (
          <div className="space-y-2">
            {records.map(rec => (
              <div key={rec._id} className="p-3 bg-brand-bg rounded-xl border border-brand-border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-brand-dark">{rec.employeeName}</div>
                    <div className="text-xs text-brand-gray">صافي: {fmt(rec.finalSalary)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {rec.isPaid ? (
                      <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-lg">مدفوع</span>
                    ) : (
                      <>
                        <button onClick={() => pay(rec)} className="text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg">
                          صرف
                        </button>
                        <button onClick={() => remove(rec)} className="text-xs font-bold text-red-500 hover:underline">حذف</button>
                      </>
                    )}
                  </div>
                </div>

                {!rec.isPaid && (
                  <div className="flex items-center justify-between border-t border-brand-border/60 pt-2">
                    <button disabled={syncingId === rec._id} onClick={() => syncAttendance(rec)}
                      className="text-[11px] font-bold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60 px-2.5 py-1 rounded-lg">
                      🖐️ جلب من البصمة
                    </button>
                    {rec.attendanceSynced && (
                      <div className="text-[11px] font-bold text-brand-gray">
                        {rec.daysAttended} يوم · {rec.hoursWorked} ساعة
                        {rec.lateHours > 0 && <span className="text-red-500"> · تأخر {rec.lateHours} ساعة</span>}
                      </div>
                    )}
                  </div>
                )}
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
              <h3 className="font-black text-brand-dark text-lg mb-4">إنشاء سجل راتب — {month}</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">الموظف</label>
                  <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm bg-white">
                    {employees.map(emp => (
                      <option key={emp._id} value={emp._id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-1">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={createRecord} disabled={saving}
                    className="flex-1 py-3 rounded-2xl font-black text-white shadow-lg disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #8B4513, #5C2D0E)' }}>
                    {saving ? '...' : 'إنشاء'}
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
