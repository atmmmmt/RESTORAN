import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Fingerprint, Clock } from 'lucide-react'
import { salaryAPI, employeesAPI, advancesAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import { formatCurrency } from '../../utils/formatters'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import weekOfYear from 'dayjs/plugin/weekOfYear'
dayjs.extend(weekOfYear)

const THIS_MONTH = dayjs().format('YYYY-MM')
const THIS_WEEK  = `${dayjs().format('YYYY')}-W${String(dayjs().week()).padStart(2,'0')}`
const THIS_DAY   = dayjs().format('YYYY-MM-DD')

/* Week label helper */
const weekLabel = (w) => {
  const [y, wk] = w.split('-W')
  const d = dayjs().year(Number(y)).week(Number(wk))
  return `الأسبوع ${wk} (${d.startOf('week').format('DD/MM')} – ${d.endOf('week').format('DD/MM')})`
}

export default function PayrollPage() {
  const [periodTab, setPeriodTab] = useState('monthly') // 'monthly' | 'weekly' | 'daily'
  const [month,     setMonth]     = useState(THIS_MONTH)
  const [week,      setWeek]      = useState(THIS_WEEK)
  const [day,       setDay]       = useState(THIS_DAY)
  const [records,   setRecords]   = useState([])
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [initing,   setIniting]   = useState(false)

  /* advances */
  const [advances,      setAdvances]      = useState([])
  const [advModal,      setAdvModal]      = useState(false)
  const [advEmpId,      setAdvEmpId]      = useState('')
  const [advAmount,     setAdvAmount]     = useState('')
  const [advDate,       setAdvDate]       = useState(dayjs().format('YYYY-MM-DD'))
  const [advReason,     setAdvReason]     = useState('')
  const [savingAdv,     setSavingAdv]     = useState(false)

  /* attendance sync — holds the record id currently being pulled */
  const [syncing, setSyncing] = useState('')

  /* late modal */
  const [lateModal, setLateModal]    = useState(false)
  const [lateRec,   setLateRec]      = useState(null)
  const [lateHours, setLateHours]    = useState('')
  const [lateDate,  setLateDate]     = useState(dayjs().format('YYYY-MM-DD'))
  const [lateReason,setLateReason]   = useState('')
  const [savingLate,setSavingLate]   = useState(false)

  /* adjust modal */
  const [adjModal,  setAdjModal]     = useState(false)
  const [adjRec,    setAdjRec]       = useState(null)
  const [adjBonus,  setAdjBonus]     = useState('')
  const [adjDeduct, setAdjDeduct]    = useState('')
  const [adjNotes,  setAdjNotes]     = useState('')
  const [savingAdj, setSavingAdj]    = useState(false)

  const currentPeriod = periodTab === 'weekly' ? week : periodTab === 'daily' ? day : month

  const load = async () => {
    setLoading(true)
    try {
      const r = await salaryAPI.getMonth(currentPeriod)
      // Filter by period type
      setRecords((r.data.records || []).filter(rec => rec.period === periodTab))
    } catch { toast.error('فشل تحميل البيانات') }
    finally { setLoading(false) }
  }

  const loadAdvances = () => {
    advancesAPI.getAll({ isDeducted: false }).then(r => setAdvances(r.data.advances || []))
  }

  useEffect(() => { load(); loadAdvances() }, [currentPeriod, periodTab])
  useEffect(() => {
    employeesAPI.getAll({ isActive: true }).then(r => setEmployees(r.data.employees || []))
  }, [])

  const initMonth = async () => {
    setIniting(true)
    try {
      const r = await salaryAPI.initMonth(currentPeriod, periodTab)
      toast.success(r.data.message || 'تم الإنشاء')
      load()
    } catch { toast.error('حدث خطأ') }
    finally { setIniting(false) }
  }

  const saveAdvance = async () => {
    if (!advEmpId || !advAmount) return toast.error('اختر الموظف وأدخل المبلغ')
    setSavingAdv(true)
    try {
      await advancesAPI.create({ employeeId: advEmpId, amount: Number(advAmount), date: advDate, reason: advReason })
      toast.success('✅ تم تسجيل السلفة وخصمها من الكاش')
      setAdvModal(false); setAdvAmount(''); setAdvReason(''); loadAdvances()
    } catch (e) { toast.error(e?.response?.data?.message || 'حدث خطأ') }
    finally { setSavingAdv(false) }
  }

  const deleteAdvance = async (id) => {
    if (!confirm('حذف هذه السلفة؟')) return
    try { await advancesAPI.remove(id); toast.success('تم الحذف'); loadAdvances() }
    catch { toast.error('حدث خطأ') }
  }

  /** Pull the month's real clocked hours off the fingerprint terminal.
      `basis` decides whether the wage stays fixed or becomes hours × rate. */
  const syncAttendance = async (rec, basis) => {
    if (basis === 'hours' && !confirm(
      `احتساب راتب ${rec.employeeName} بالساعة؟\n` +
      'سيصبح الراتب = الساعات المسجّلة بالبصمة × سعر الساعة، بدل الراتب الثابت.'
    )) return

    setSyncing(rec._id)
    try {
      const res = await salaryAPI.syncAttendance(rec._id, basis)
      toast.success(res.data.message)
      load()
    } catch (e) {
      toast.error(e?.message || 'تعذّرت المزامنة')
    } finally { setSyncing('') }
  }

  const openLate = (rec) => { setLateRec(rec); setLateHours(''); setLateDate(dayjs().format('YYYY-MM-DD')); setLateReason(''); setLateModal(true) }
  const saveLate = async () => {
    if (!lateHours || Number(lateHours) <= 0) return toast.error('أدخل عدد ساعات التأخر')
    setSavingLate(true)
    try {
      await salaryAPI.addLate(lateRec._id, { hours: Number(lateHours), date: lateDate, reason: lateReason })
      toast.success('تم تسجيل التأخر وخصم الراتب تلقائياً ✅')
      setLateModal(false); load()
    } catch (e) { toast.error(e?.response?.data?.message || 'حدث خطأ') }
    finally { setSavingLate(false) }
  }

  const openAdj = (rec) => { setAdjRec(rec); setAdjBonus(rec.bonuses || ''); setAdjDeduct(rec.otherDeductions || ''); setAdjNotes(rec.notes || ''); setAdjModal(true) }
  const saveAdj = async () => {
    setSavingAdj(true)
    try {
      await salaryAPI.adjust(adjRec._id, { bonuses: Number(adjBonus) || 0, otherDeductions: Number(adjDeduct) || 0, notes: adjNotes })
      toast.success('تم التحديث')
      setAdjModal(false); load()
    } catch (e) { toast.error(e?.response?.data?.message || 'حدث خطأ') }
    finally { setSavingAdj(false) }
  }

  const pay = async (rec) => {
    if (!confirm(`صرف راتب ${rec.employeeName} — ${formatCurrency(rec.finalSalary)}؟\nسيتم خصم المبلغ من الكاش.`)) return
    try {
      await salaryAPI.pay(rec._id)
      toast.success(`✅ تم صرف راتب ${rec.employeeName}`)
      load()
    } catch (e) { toast.error(e?.response?.data?.message || 'حدث خطأ') }
  }

  /* Summary */
  const totalBase    = records.reduce((s, r) => s + r.baseSalary, 0)
  const totalFinal   = records.reduce((s, r) => s + r.finalSalary, 0)
  const totalPaid    = records.filter(r => r.isPaid).reduce((s, r) => s + r.finalSalary, 0)
  const totalPending = totalFinal - totalPaid
  const paidCount    = records.filter(r => r.isPaid).length

  return (
    <div>
      <PageHeader title="الرواتب 💰" subtitle="إدارة رواتب الموظفين الشهرية" />

      {/* Period tabs + selector */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Tab */}
        <div className="flex bg-white rounded-2xl shadow-card p-1">
          {[['monthly','📅 شهري'], ['weekly','🗓️ أسبوعي'], ['daily','☀️ يومي']].map(([val, label]) => (
            <button key={val} onClick={() => setPeriodTab(val)}
              className={`px-5 py-2 rounded-xl font-bold text-sm transition-all ${periodTab === val ? 'bg-fuchsia text-white' : 'text-brand-gray hover:text-fuchsia'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Period picker */}
        {periodTab === 'monthly' ? (
          <div className="flex items-center gap-2 bg-white rounded-2xl shadow-card px-4 py-2.5">
            <span className="text-brand-gray font-bold text-sm">الشهر:</span>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="border-none outline-none font-black text-brand-dark text-sm bg-transparent" />
          </div>
        ) : periodTab === 'weekly' ? (
          <div className="flex items-center gap-2 bg-white rounded-2xl shadow-card px-4 py-2.5">
            <span className="text-brand-gray font-bold text-sm">الأسبوع:</span>
            <input type="week" value={week} onChange={e => setWeek(e.target.value)}
              className="border-none outline-none font-black text-brand-dark text-sm bg-transparent" />
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-white rounded-2xl shadow-card px-4 py-2.5">
            <span className="text-brand-gray font-bold text-sm">اليوم:</span>
            <input type="date" value={day} onChange={e => setDay(e.target.value)}
              className="border-none outline-none font-black text-brand-dark text-sm bg-transparent" />
          </div>
        )}

        <Button variant="outline" onClick={initMonth} loading={initing}>
          🔄 إنشاء سجلات {periodTab === 'weekly' ? 'الأسبوع' : periodTab === 'daily' ? 'اليوم' : 'الشهر'} للكل
        </Button>

        {/* Advance button */}
        <button onClick={() => { setAdvEmpId(employees[0]?._id || ''); setAdvModal(true) }}
          className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2.5 rounded-2xl font-bold text-sm hover:bg-amber-100 transition-colors shadow-card">
          💵 تسجيل سلفة
        </button>
      </div>

      {/* Pending advances */}
      {advances.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
          <div className="font-black text-amber-800 text-sm mb-3 flex items-center gap-2">
            ⚠️ سلف غير مخصومة من الراتب ({advances.length})
          </div>
          <div className="space-y-2">
            {advances.map(a => (
              <div key={a._id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                <div className="text-sm">
                  <span className="font-black text-brand-dark">{a.employeeName}</span>
                  <span className="text-brand-gray font-medium mr-2">— {formatCurrency(a.amount)}</span>
                  <span className="text-xs text-brand-gray-light">{a.date?.slice(0,10)} {a.reason && `(${a.reason})`}</span>
                </div>
                <button onClick={() => deleteAdvance(a._id)} className="text-xs text-red-400 hover:text-red-600 font-bold">✕</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-600 font-medium mt-2">
            💡 ستُخصم تلقائياً عند إنشاء سجل الراتب القادم
          </p>
        </div>
      )}

      {/* Summary cards */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'إجمالي الرواتب الأساسية', val: totalBase,    color: 'text-brand-dark', bg: 'bg-white' },
            { label: 'إجمالي الرواتب النهائية',  val: totalFinal,   color: 'text-fuchsia',     bg: 'bg-white' },
            { label: 'تم صرفه',                  val: totalPaid,    color: 'text-green-600',   bg: 'bg-green-50' },
            { label: 'متبقي للصرف',              val: totalPending, color: 'text-amber-600',   bg: 'bg-amber-50' },
          ].map(c => (
            <div key={c.label} className={`${c.bg} rounded-2xl shadow-card p-4 text-center`}>
              <div className="text-xs text-brand-gray font-bold mb-1">{c.label}</div>
              <div className={`font-black text-lg ${c.color}`}>{formatCurrency(c.val)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Records */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-24 animate-pulse shadow-card" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-card">
          <div className="text-5xl mb-4">📋</div>
          <div className="font-black text-brand-gray text-lg mb-2">لا توجد سجلات لهذه الفترة</div>
          <p className="text-brand-gray-light text-sm mb-4">اضغط "إنشاء سجلات {periodTab === 'weekly' ? 'الأسبوع' : periodTab === 'daily' ? 'اليوم' : 'الشهر'} للكل" لإنشاء سجل لكل موظف</p>
          <Button onClick={initMonth} loading={initing}>🔄 إنشاء سجلات {currentPeriod}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((rec, i) => (
            <motion.div key={rec._id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className={`bg-white rounded-2xl shadow-card overflow-hidden ${rec.isPaid ? 'border-l-4 border-l-green-400' : ''}`}>
              <div className="p-5">
                <div className="flex flex-wrap items-start gap-4 justify-between">
                  {/* Employee info */}
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-fuchsia flex items-center justify-center text-white font-black text-lg flex-shrink-0">
                      {rec.employeeName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-black text-brand-dark">{rec.employeeName}</div>
                      <div className="text-xs text-brand-gray font-bold">
                        الراتب الأساسي: {formatCurrency(rec.baseSalary)}
                        {rec.hourlyRate > 0 && <span className="mr-2 text-brand-gray-light">• سعر الساعة: {formatCurrency(rec.hourlyRate)}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`text-xs px-3 py-1.5 rounded-xl font-black ${rec.isPaid ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                    {rec.isPaid ? `✅ مصروف ${rec.paidDate ? new Date(rec.paidDate).toLocaleDateString('ar-SY') : ''}` : '⏳ لم يُصرف'}
                  </span>
                </div>

                {/* Attendance pulled from the fingerprint terminal */}
                {rec.attendanceSynced && (
                  <div className="mt-3 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5"
                    style={{ background: 'rgba(169,103,52,0.08)', border: '1px solid rgba(169,103,52,0.2)' }}>
                    <span className="text-xs font-black flex items-center gap-1.5" style={{ color: '#A96734' }}>
                      <Fingerprint size={13} /> من البصمة
                    </span>
                    <span className="text-xs font-bold text-brand-dark">
                      أيام الحضور: <b>{rec.daysAttended}</b>
                    </span>
                    <span className="text-xs font-bold text-brand-dark">
                      ساعات العمل: <b>{rec.hoursWorked}</b>
                      {rec.expectedHours > 0 && <span className="text-brand-gray-light"> / {rec.expectedHours}</span>}
                    </span>
                    <span className="text-xs font-bold text-brand-dark">
                      أجر الساعات: <b>{formatCurrency(rec.hoursPay)}</b>
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-lg font-black ${
                      rec.payBasis === 'hours' ? 'bg-green-100 text-green-700' : 'bg-white text-brand-gray'
                    }`}>
                      {rec.payBasis === 'hours' ? 'الاحتساب: بالساعة' : 'الاحتساب: راتب ثابت'}
                    </span>
                  </div>
                )}

                {/* Salary breakdown */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-brand-bg rounded-xl p-3 text-center">
                    <div className="text-xs text-brand-gray font-bold">ساعات التأخر</div>
                    <div className={`font-black text-lg ${rec.lateHours > 0 ? 'text-red-500' : 'text-brand-dark'}`}>{rec.lateHours}س</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 text-center">
                    <div className="text-xs text-brand-gray font-bold">خصم التأخر</div>
                    <div className="font-black text-lg text-red-500">
                      {rec.payBasis === 'hours'
                        ? <span className="text-brand-gray-light text-sm">ضمن الساعات</span>
                        : <>−{formatCurrency(rec.lateDeduction)}</>}
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center">
                    <div className="text-xs text-brand-gray font-bold">مكافآت</div>
                    <div className="font-black text-lg text-green-600">+{formatCurrency(rec.bonuses)}</div>
                  </div>
                  <div className="bg-fuchsia-bg rounded-xl p-3 text-center">
                    <div className="text-xs text-brand-gray font-bold">الراتب النهائي</div>
                    <div className="font-black text-lg text-fuchsia">{formatCurrency(rec.finalSalary)}</div>
                  </div>
                </div>

                {/* Advances row */}
                {rec.advances > 0 && (
                  <div className="mt-3 bg-amber-50 rounded-xl px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-700">💵 سلف مخصومة من هذه الفترة</span>
                    <span className="font-black text-amber-700">−{formatCurrency(rec.advances)}</span>
                  </div>
                )}

                {/* Late log */}
                {rec.lateLog?.length > 0 && (
                  <div className="mt-3 bg-red-50 rounded-xl p-3">
                    <div className="text-xs font-black text-red-600 mb-2">سجل التأخرات:</div>
                    <div className="space-y-1">
                      {rec.lateLog.map((l, j) => (
                        <div key={j} className="flex justify-between text-xs font-medium text-red-700">
                          <span>{l.date} — {l.hours}س {l.reason ? `(${l.reason})` : ''}</span>
                          <span className="font-black">−{formatCurrency(l.hours * rec.hourlyRate)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {!rec.isPaid && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => syncAttendance(rec, 'salary')} disabled={syncing === rec._id}
                      title="يجلب أيام وساعات العمل الفعلية من جهاز البصمة"
                      className="text-xs px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      style={{ background: 'rgba(169,103,52,0.12)', color: '#A96734' }}>
                      <Fingerprint size={13} /> جلب من البصمة
                    </button>
                    <button onClick={() => syncAttendance(rec, 'hours')} disabled={syncing === rec._id}
                      title="يحتسب الراتب = الساعات المسجّلة × سعر الساعة"
                      className="text-xs bg-green-50 text-green-700 px-4 py-2 rounded-xl font-bold hover:bg-green-100 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                      <Clock size={13} /> احتساب بالساعة
                    </button>
                    <button onClick={() => openLate(rec)}
                      className="text-xs bg-red-50 text-red-600 px-4 py-2 rounded-xl font-bold hover:bg-red-100 transition-colors flex items-center gap-1.5">
                      ⏰ تسجيل تأخر
                    </button>
                    <button onClick={() => openAdj(rec)}
                      className="text-xs bg-amber-50 text-amber-700 px-4 py-2 rounded-xl font-bold hover:bg-amber-100 transition-colors">
                      ✏️ مكافآت / خصومات
                    </button>
                    <button onClick={() => pay(rec)}
                      className="text-xs bg-green-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-green-700 transition-colors flex items-center gap-1.5">
                      💵 صرف الراتب ({formatCurrency(rec.finalSalary)})
                    </button>
                  </div>
                )}
                {rec.notes && (
                  <div className="mt-2 text-xs text-brand-gray font-medium">📝 {rec.notes}</div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Advance Modal */}
      <Modal open={advModal} onClose={() => setAdvModal(false)} title="تسجيل سلفة 💵">
        <div className="space-y-4">
          <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-700 font-medium">
            ⚠️ السلفة ستُخصم من الكاش فوراً، وتُحسب تلقائياً على الراتب القادم
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">الموظف *</label>
            <select value={advEmpId} onChange={e => setAdvEmpId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
              <option value="">اختر الموظف</option>
              {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">المبلغ (ل.س) *</label>
              <input type="number" min="1" value={advAmount} onChange={e => setAdvAmount(e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-lg text-center"
                placeholder="50,000" />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">التاريخ</label>
              <input type="date" value={advDate} onChange={e => setAdvDate(e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">السبب (اختياري)</label>
            <input value={advReason} onChange={e => setAdvReason(e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
              placeholder="ظروف طارئة، مصاريف طبية..." />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={saveAdvance} loading={savingAdv} className="flex-1">تسجيل السلفة</Button>
            <Button variant="outline" onClick={() => setAdvModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>

      {/* Late Modal */}
      <Modal open={lateModal} onClose={() => setLateModal(false)} title={`تسجيل تأخر — ${lateRec?.employeeName}`}>
        <div className="space-y-4">
          {lateRec && (
            <div className="bg-red-50 rounded-xl p-3 text-sm text-red-700 font-medium">
              سعر الساعة: <span className="font-black">{formatCurrency(lateRec.hourlyRate)}</span>
              {lateHours > 0 && (
                <span className="mr-2">← خصم التأخر: <span className="font-black">{formatCurrency(Number(lateHours) * lateRec.hourlyRate)}</span></span>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">عدد ساعات التأخر *</label>
              <input type="number" step="0.5" min="0.5" value={lateHours} onChange={e => setLateHours(e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-xl text-center"
                placeholder="2" />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">التاريخ</label>
              <input type="date" value={lateDate} onChange={e => setLateDate(e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">السبب (اختياري)</label>
            <input value={lateReason} onChange={e => setLateReason(e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
              placeholder="تأخر الباص، ظروف..." />
          </div>
          {lateHours > 0 && lateRec && (
            <div className="bg-fuchsia-bg rounded-xl p-3 text-center">
              <div className="text-sm text-brand-gray font-bold">سيُخصم من الراتب</div>
              <div className="font-black text-fuchsia text-xl">{formatCurrency(Number(lateHours) * lateRec.hourlyRate)}</div>
              <div className="text-xs text-brand-gray-light mt-1">
                الراتب الجديد: {lateRec ? formatCurrency(lateRec.finalSalary - (Number(lateHours) * lateRec.hourlyRate)) : 0}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button onClick={saveLate} loading={savingLate} className="flex-1">تسجيل التأخر</Button>
            <Button variant="outline" onClick={() => setLateModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>

      {/* Adjust Modal */}
      <Modal open={adjModal} onClose={() => setAdjModal(false)} title={`مكافآت وخصومات — ${adjRec?.employeeName}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">مكافآت (+)</label>
              <input type="number" min="0" value={adjBonus} onChange={e => setAdjBonus(e.target.value)}
                className="w-full px-4 py-3 border-2 border-green-200 rounded-xl focus:border-green-400 focus:outline-none font-bold text-green-700 text-lg text-center" placeholder="0" />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">خصومات أخرى (−)</label>
              <input type="number" min="0" value={adjDeduct} onChange={e => setAdjDeduct(e.target.value)}
                className="w-full px-4 py-3 border-2 border-red-200 rounded-xl focus:border-red-400 focus:outline-none font-bold text-red-600 text-lg text-center" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">ملاحظات</label>
            <textarea value={adjNotes} onChange={e => setAdjNotes(e.target.value)} rows={2}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold resize-none" />
          </div>
          {adjRec && (
            <div className="bg-fuchsia-bg rounded-xl p-3 text-center">
              <div className="text-sm text-brand-gray font-bold">الراتب النهائي المتوقع</div>
              <div className="font-black text-fuchsia text-xl">
                {formatCurrency(Math.max(0, adjRec.baseSalary + (Number(adjBonus) || 0) - adjRec.lateDeduction - (Number(adjDeduct) || 0)))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button onClick={saveAdj} loading={savingAdj} className="flex-1">حفظ</Button>
            <Button variant="outline" onClick={() => setAdjModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
