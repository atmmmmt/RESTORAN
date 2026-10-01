import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { centerPortalAPI } from '../../services/api'
import toast from 'react-hot-toast'

const todayKey = () => new Date().toISOString().slice(0, 10)

const fmtTime = (t) => t ? new Date(t).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' }) : '—'

const STATUS_LABEL = {
  present: { label: 'حاضر', className: 'text-green-700 bg-green-100' },
  late:    { label: 'متأخر', className: 'text-amber-700 bg-amber-100' },
  absent:  { label: 'غائب', className: 'text-red-600 bg-red-100' },
}

export default function CenterAttendanceTab() {
  const [date, setDate] = useState(todayKey())
  const [rows, setRows] = useState([])
  const [totals, setTotals] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    centerPortalAPI.getAttendanceDaily(date)
      .then(r => { setRows(r.data.rows || []); setTotals(r.data.totals || null) })
      .catch(err => toast.error(err.message || 'حدث خطأ'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [date])

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4" style={{ direction: 'rtl' }}>
      <div className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="font-black text-brand-dark text-base">🖐️ الحضور والبصمة</h2>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 border-2 border-brand-border rounded-xl font-bold text-sm" />
        </div>

        {totals && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-brand-bg rounded-xl p-2.5 text-center border border-brand-border">
              <div className="text-lg font-black text-green-700">{totals.present}</div>
              <div className="text-[11px] font-bold text-brand-gray">حاضر</div>
            </div>
            <div className="bg-brand-bg rounded-xl p-2.5 text-center border border-brand-border">
              <div className="text-lg font-black text-amber-700">{totals.late}</div>
              <div className="text-[11px] font-bold text-brand-gray">متأخر</div>
            </div>
            <div className="bg-brand-bg rounded-xl p-2.5 text-center border border-brand-border">
              <div className="text-lg font-black text-red-600">{totals.absent}</div>
              <div className="text-[11px] font-bold text-brand-gray">غائب</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-brand-gray-light font-bold">جاري التحميل...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-brand-gray-light font-bold">لا يوجد موظفون بعد</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-brand-gray text-xs font-bold border-b border-brand-border">
                  <th className="py-2 px-2">الموظف</th>
                  <th className="py-2 px-2">الحالة</th>
                  <th className="py-2 px-2">دخول</th>
                  <th className="py-2 px-2">خروج</th>
                  <th className="py-2 px-2">ساعات العمل</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const st = STATUS_LABEL[r.status] || STATUS_LABEL.absent
                  return (
                    <motion.tr key={r.employeeId} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="border-b border-brand-border/60">
                      <td className="py-2 px-2 font-bold text-brand-dark">{r.name}</td>
                      <td className="py-2 px-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${st.className}`}>{st.label}</span>
                      </td>
                      <td className="py-2 px-2 text-brand-gray">{fmtTime(r.checkIn)}</td>
                      <td className="py-2 px-2 text-brand-gray">{fmtTime(r.checkOut)}</td>
                      <td className="py-2 px-2 font-bold text-brand-dark">{r.workedHours}</td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
