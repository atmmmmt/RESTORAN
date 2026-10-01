import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Clock, Users, UserPlus, Wallet, Calendar, CalendarDays } from 'lucide-react'
import EmptyState from '../../components/common/EmptyState'
import { employeesAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import { formatCurrency, formatDate } from '../../utils/formatters'
import toast from 'react-hot-toast'

const INITIAL = {
  name: '', role: '', department: '', hireDate: '', monthlySalary: '',
  dailyHours: 8, workingDays: 26, payPeriod: 'monthly', phone: '', notes: '',
  hourlyRateOverride: 0, devicePin: '',
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [form,      setForm]      = useState(INITIAL)
  const [saving,    setSaving]    = useState(false)

  const load = () => {
    setLoading(true)
    employeesAPI.getAll().then(r => setEmployees(r.data.employees || [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openAdd  = () => { setEditing(null); setForm(INITIAL); setModal(true) }
  const openEdit = (e) => {
    setEditing(e)
    setForm({
      name: e.name, role: e.role || '', department: e.department || '', hireDate: e.hireDate?.slice(0, 10) || '',
      monthlySalary: e.monthlySalary, dailyHours: e.dailyHours, workingDays: e.workingDays,
      payPeriod: e.payPeriod || 'monthly', phone: e.phone || '', notes: e.notes || '',
      hourlyRateOverride: e.hourlyRateOverride || 0, devicePin: e.devicePin || '',
    })
    setModal(true)
  }

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }))

  /* Manual override wins — lets the manager price an hour directly. */
  const hourlyRate = () => {
    if (Number(form.hourlyRateOverride) > 0) return Number(form.hourlyRateOverride).toFixed(0)
    const s = Number(form.monthlySalary), h = Number(form.dailyHours)
    const d = form.payPeriod === 'weekly' ? 5 : Number(form.workingDays)
    return s && h && d ? (s / (h * d)).toFixed(0) : 0
  }

  const save = async () => {
    if (!form.name || !form.monthlySalary) return toast.error('الاسم والراتب مطلوبان')
    setSaving(true)
    try {
      if (editing) { await employeesAPI.update(editing._id, form); toast.success('تم التحديث') }
      else         { await employeesAPI.create(form); toast.success('تمت إضافة الموظف') }
      setModal(false); load()
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setSaving(false) }
  }

  const deactivate = async (emp) => {
    if (!confirm(`إلغاء تفعيل ${emp.name}؟`)) return
    try { await employeesAPI.remove(emp._id); toast.success('تم إلغاء التفعيل'); load() }
    catch { toast.error('حدث خطأ') }
  }

  return (
    <div>
      <PageHeader title="الموظفين" subtitle="إدارة فريق العمل والرواتب"
        actions={<Button onClick={openAdd} icon={<UserPlus size={16} />}>إضافة موظف</Button>} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-44 animate-pulse shadow-card" />)}
        </div>
      ) : employees.length === 0 ? (
        <EmptyState icon={Users} title="لا يوجد موظفون" description="أضف أول موظف لبدء إدارة الفريق والرواتب" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((emp, i) => (
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
                {emp.isActive && (
                  <button onClick={() => deactivate(emp)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors">إلغاء</button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل موظف' : 'إضافة موظف جديد'}>
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
            <div className="font-black text-brand-dark text-sm mb-1 flex items-center gap-2"><Wallet size={15} /> إعدادات الراتب</div>
            <div>
              <label className="text-xs font-bold text-brand-gray mb-1 block">دورية الراتب</label>
              <div className="flex gap-2">
                {[['monthly', 'شهري', Calendar], ['weekly', 'أسبوعي', CalendarDays]].map(([val, label, Icon]) => (
                  <button key={val} type="button" onClick={() => set('payPeriod', val)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5 ${form.payPeriod === val ? 'bg-fuchsia text-white' : 'bg-white text-brand-gray border-2 border-brand-border'}`}>
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-brand-gray mb-1 block">
                {form.payPeriod === 'weekly' ? 'الراتب الأسبوعي (ل.س) *' : 'الراتب الشهري (ل.س) *'}
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
