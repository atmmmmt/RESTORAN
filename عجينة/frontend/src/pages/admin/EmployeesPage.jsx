import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { employeesAPI, centersAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import { formatCurrency, formatDate } from '../../utils/formatters'
import toast from 'react-hot-toast'

const INITIAL = {
  name: '', role: '', department: '', hireDate: '', monthlySalary: '',
  dailyHours: 8, workingDays: 26, payPeriod: 'monthly', phone: '', notes: '',
  hourlyRateOverride: 0, devicePin: '', centerId: '',
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState(INITIAL)
  const [saving,    setSaving]    = useState(false)
  /* Deactivated staff stay on file for payroll, but they are not who you came
     to this page to look at — so they are folded away by default. */
  const [showInactive, setShowInactive] = useState(false)
  const [branches, setBranches] = useState([])

  const load = () => {
    setLoading(true)
    employeesAPI.getAll().then(r => setEmployees(r.data.employees || [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    centersAPI.getAll()
      .then(r => setBranches(r.data.centers || []))
      .catch(() => { /* a single-site shop has none; the field just stays empty */ })
  }, [])

  const openAdd  = () => { setEditing(null); setForm(INITIAL); setModal(true) }
  const openEdit = (e) => {
    setEditing(e)
    setForm({
      name: e.name, role: e.role || '', department: e.department || '', hireDate: e.hireDate?.slice(0, 10) || '',
      monthlySalary: e.monthlySalary, dailyHours: e.dailyHours, workingDays: e.workingDays,
      payPeriod: e.payPeriod || 'monthly', phone: e.phone || '', notes: e.notes || '',
      hourlyRateOverride: e.hourlyRateOverride || 0, devicePin: e.devicePin || '',
      centerId: e.centerId?._id || e.centerId || '',
    })
    setModal(true)
  }

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }))

  /* Manual override wins — lets the manager price an hour directly. */
  const hourlyRate = () => {
    if (Number(form.hourlyRateOverride) > 0) return Number(form.hourlyRateOverride).toFixed(0)
    const s = Number(form.monthlySalary), h = Number(form.dailyHours)
    const d = form.payPeriod === 'daily' ? 1 : form.payPeriod === 'weekly' ? 5 : Number(form.workingDays)
    return s && h && d ? (s / (h * d)).toFixed(0) : 0
  }

  const save = async () => {
    if (!form.name || !form.monthlySalary) return toast.error('الاسم والراتب مطلوبان')
    setSaving(true)
    /* The select yields '' for head office, which Mongoose cannot cast to an
       ObjectId — it has to travel as an explicit null. */
    const payload = { ...form, centerId: form.centerId || null }
    try {
      if (editing) { await employeesAPI.update(editing._id, payload); toast.success('تم التحديث') }
      else         { await employeesAPI.create(payload); toast.success('تمت إضافة الموظف') }
      setModal(false); load()
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setSaving(false) }
  }

  const restore = async (emp) => {
    try { await employeesAPI.restore(emp._id); toast.success('تمت إعادة التفعيل'); load() }
    catch (e) { toast.error(e.message || 'حدث خطأ') }
  }

  /* Only offered for deactivated rows: erasing someone with history would
     leave their punches and payslips pointing at nobody. */
  const purge = async (emp) => {
    if (!confirm(`حذف ${emp.name} نهائياً؟ لا يمكن التراجع.`)) return
    try {
      const res = await employeesAPI.purge(emp._id)
      toast.success(res.data.message || 'تم الحذف'); load()
    } catch (e) { toast.error(e.message || 'تعذّر الحذف') }
  }

  const deactivate = async (emp) => {
    if (!confirm(`إلغاء تفعيل ${emp.name}؟`)) return
    try { await employeesAPI.remove(emp._id); toast.success('تم إلغاء التفعيل'); load() }
    catch { toast.error('حدث خطأ') }
  }

  const inactiveCount = employees.filter(e => !e.isActive).length
  const visible = showInactive ? employees : employees.filter(e => e.isActive)

  return (
    <div>
      {!!inactiveCount && (
        <button onClick={() => setShowInactive(v => !v)}
          className="mb-4 text-xs font-black px-3 py-2 rounded-xl bg-brand-bg text-brand-gray hover:text-brand-dark transition-colors">
          {showInactive ? `إخفاء المعطّلين (${inactiveCount})` : `إظهار المعطّلين (${inactiveCount})`}
        </button>
      )}
      <PageHeader title="الموظفين 👥" subtitle="إدارة فريق العمل والرواتب"
        actions={<Button onClick={openAdd}>+ إضافة موظف</Button>} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-44 animate-pulse shadow-card" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">👥</div>
          <div className="font-black text-brand-gray text-xl">لا يوجد موظفون — أضف أول موظف!</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((emp, i) => (
            <motion.div key={emp._id}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className={`bg-white rounded-2xl shadow-card overflow-hidden ${!emp.isActive ? 'opacity-50' : ''}`}>

              {/* Header */}
              <div className="bg-gradient-to-br from-fuchsia-bg to-brand-offwhite p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-fuchsia flex items-center justify-center text-white text-xl font-black flex-shrink-0">
                    {emp.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-brand-dark truncate">{emp.name}</div>
                    <div className="text-xs text-brand-gray font-bold">{emp.role || 'موظف'}</div>
                    {emp.hireDate && <div className="text-xs text-brand-gray-light mt-0.5">{formatDate(emp.hireDate)}</div>}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="p-4 grid grid-cols-3 gap-2 text-center border-b border-brand-border">
                <div>
                  <div className="text-xs text-brand-gray font-bold">الراتب</div>
                  <div className="font-black text-fuchsia text-sm">{formatCurrency(emp.monthlySalary)}</div>
                </div>
                <div>
                  <div className="text-xs text-brand-gray font-bold">الدوام</div>
                  <div className="font-black text-brand-dark text-sm">{emp.dailyHours}س/يوم</div>
                </div>
                <div>
                  <div className="text-xs text-brand-gray font-bold">سعر الساعة</div>
                  <div className="font-black text-brand-dark text-sm">
                    {formatCurrency(emp.monthlySalary / (emp.dailyHours * emp.workingDays))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 flex gap-2">
                <button onClick={() => openEdit(emp)} className="flex-1 text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors">تعديل</button>
                <Link to={`/admin/payroll?emp=${emp._id}`} className="flex-1 text-center text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg font-bold hover:bg-green-100 transition-colors">الرواتب</Link>
                {emp.isActive ? (
                  <button onClick={() => deactivate(emp)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors">إلغاء</button>
                ) : (
                  <>
                    <button onClick={() => restore(emp)} className="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg font-bold hover:bg-green-100 transition-colors">تفعيل</button>
                    <button onClick={() => purge(emp)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors">حذف نهائي</button>
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل موظف' : 'إضافة موظف جديد 👤'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">الاسم *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" placeholder="أم أحمد..." />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">المسمى الوظيفي</label>
              <input value={form.role} onChange={e => set('role', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" placeholder="طباخة، مساعدة..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">تاريخ التوظيف</label>
              <input type="date" value={form.hireDate} onChange={e => set('hireDate', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">الهاتف</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
          </div>

          <div className="bg-fuchsia-bg rounded-2xl p-4 space-y-3">
            <div className="font-black text-brand-dark text-sm mb-1">إعدادات الراتب 💰</div>
            <div>
              <label className="text-xs font-bold text-brand-gray mb-1 block">دورية الراتب</label>
              <div className="flex gap-2">
                {[['monthly','شهري 📅'], ['weekly','أسبوعي 🗓️'], ['daily','يومي ☀️']].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => set('payPeriod', val)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${form.payPeriod === val ? 'bg-fuchsia text-white' : 'bg-white text-brand-gray border-2 border-brand-border'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-brand-gray mb-1 block">
                {form.payPeriod === 'weekly' ? 'الراتب الأسبوعي (ل.س) *' : form.payPeriod === 'daily' ? 'الراتب اليومي (ل.س) *' : 'الراتب الشهري (ل.س) *'}
              </label>
              <input type="number" value={form.monthlySalary} onChange={e => set('monthlySalary', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-brand-gray mb-1 block">ساعات الدوام / يوم</label>
                <input type="number" min="1" max="12" value={form.dailyHours} onChange={e => set('dailyHours', e.target.value)}
                  className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white" />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-gray mb-1 block">أيام العمل / شهر</label>
                <input type="number" min="1" max="31" value={form.workingDays} onChange={e => set('workingDays', e.target.value)}
                  className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-brand-gray mb-1 block">
                سعر الساعة يدوياً (اختياري)
              </label>
              <input type="number" min="0" value={form.hourlyRateOverride}
                onChange={e => set('hourlyRateOverride', e.target.value)}
                placeholder="اتركه 0 ليُحسب من الراتب"
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white" />
              <p className="text-[11px] text-brand-gray-light mt-1 font-medium">
                إذا حدّدت قيمة هنا فستُعتمد بدل الحساب من الراتب — تُضرب بعدد الساعات المسجّلة بالبصمة
              </p>
            </div>

            {(form.monthlySalary > 0 || form.hourlyRateOverride > 0) && (
              <div className="text-xs text-fuchsia font-black flex items-center gap-1.5">
                <Clock size={13} /> سعر الساعة المعتمد: {formatCurrency(hourlyRate())} ل.س
                {Number(form.hourlyRateOverride) > 0 && <span className="text-brand-gray font-bold">(يدوي)</span>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">القسم</label>
              <input value={form.department} onChange={e => set('department', e.target.value)}
                placeholder="مثال: المخبز، الكاشير"
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">الفرع</label>
              <select value={form.centerId} onChange={e => set('centerId', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                <option value="">الإدارة (بدون بصمة)</option>
                {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
              {/* Punches carry the branch of the terminal that recorded them, so
                  an employee left on head office can never be matched to one. */}
              <p className="text-xs text-brand-gray-light mt-1 font-medium">
                لاستخدام البصمة، اختر الفرع الذي يعمل فيه
              </p>
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">رقم البصمة (PIN)</label>
              <input value={form.devicePin} onChange={e => set('devicePin', e.target.value)} dir="ltr"
                placeholder="يُولَّد تلقائياً"
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">ملاحظات</label>
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
