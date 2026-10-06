import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Users, UserPlus, Wallet, CalendarDays, Fingerprint } from 'lucide-react'
import EmptyState from '../../components/common/EmptyState'
import { employeesAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import { formatCurrency, formatDate } from '../../utils/formatters'
import toast from 'react-hot-toast'

const INITIAL = {
  name: '', role: '', department: '', hireDate: '', phone: '', notes: '',
  payMode: 'daily', dailyWage: '', monthlySalary: 0,
  dailyHours: 8, workingDays: 26, payPeriod: 'monthly',
  hourlyRateOverride: 0, devicePin: '',
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(INITIAL)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    employeesAPI.getAll()
      .then(r => setEmployees(r.data.employees || []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    setForm(INITIAL)
    setModal(true)
  }

  const openEdit = emp => {
    setEditing(emp)
    const fallbackDaily = Number(emp.dailyWage) > 0
      ? Number(emp.dailyWage)
      : Math.round((Number(emp.monthlySalary) || 0) / Math.max(Number(emp.workingDays) || 26, 1))

    setForm({
      name: emp.name || '',
      role: emp.role || '',
      department: emp.department || '',
      hireDate: emp.hireDate?.slice(0,10) || '',
      phone: emp.phone || '',
      notes: emp.notes || '',
      payMode: 'daily',
      dailyWage: fallbackDaily || '',
      monthlySalary: Number(emp.monthlySalary) || 0,
      dailyHours: Number(emp.dailyHours) || 8,
      workingDays: Number(emp.workingDays) || 26,
      payPeriod: emp.payPeriod || 'monthly',
      hourlyRateOverride: Number(emp.hourlyRateOverride) || 0,
      devicePin: emp.devicePin || '',
    })
    setModal(true)
  }

  const set = (k,v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) return toast.error('اسم الموظف مطلوب')
    if (!(Number(form.dailyWage) > 0)) return toast.error('أدخل الأجرة اليومية')
    setSaving(true)
    try {
      const payload = {
        ...form,
        payMode: 'daily',
        dailyWage: Number(form.dailyWage),
        monthlySalary: Number(form.monthlySalary) || 0,
      }
      if (editing) {
        await employeesAPI.update(editing._id, payload)
        toast.success('تم تحديث الموظف')
      } else {
        await employeesAPI.create(payload)
        toast.success('تمت إضافة الموظف')
      }
      setModal(false)
      load()
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async emp => {
    if (!confirm(`إلغاء تفعيل ${emp.name}؟`)) return
    try {
      await employeesAPI.remove(emp._id)
      toast.success('تم إلغاء التفعيل')
      load()
    } catch {
      toast.error('حدث خطأ')
    }
  }

  return (
    <div>
      <PageHeader
        title="الموظفين"
        subtitle="إدارة بسيطة بالأجرة اليومية"
        actions={<Button onClick={openAdd} icon={<UserPlus size={16}/>}>إضافة موظف</Button>}
      />

      <div className="mb-5 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm font-bold text-amber-800 flex gap-2 items-start">
        <CalendarDays size={18} className="mt-0.5 shrink-0"/>
        <div>
          كل موظف له أجرة يومية فقط. من صفحة <b>الأجور اليومية</b> بتسجلي حاضر / نصف يوم / غائب، والنظام بيحسب المستحق تلقائياً.
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-44 animate-pulse shadow-card"/>)}
        </div>
      ) : employees.length === 0 ? (
        <EmptyState icon={Users} title="لا يوجد موظفون" description="أضف أول موظف وحدد أجرته اليومية" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((emp,i) => {
            const daily = Number(emp.dailyWage) || 0
            return (
              <motion.div key={emp._id}
                initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
                className={`bg-white rounded-2xl shadow-card overflow-hidden ${!emp.isActive ? 'opacity-50' : ''}`}>
                <div className="bg-gradient-to-br from-fuchsia-bg to-brand-offwhite p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-fuchsia text-white flex items-center justify-center text-xl font-black">
                      {emp.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-brand-dark truncate">{emp.name}</div>
                      <div className="text-xs text-brand-gray font-bold">{emp.role || 'موظف'}</div>
                      {emp.hireDate && <div className="text-xs text-brand-gray-light mt-0.5">{formatDate(emp.hireDate)}</div>}
                    </div>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-2 gap-3 border-b border-brand-border">
                  <div className="rounded-xl bg-brand-bg p-3 text-center">
                    <div className="text-xs text-brand-gray font-bold">الأجرة اليومية</div>
                    <div className="font-black text-fuchsia mt-1">{daily ? formatCurrency(daily) : 'غير محددة'}</div>
                  </div>
                  <div className="rounded-xl bg-brand-bg p-3 text-center">
                    <div className="text-xs text-brand-gray font-bold">البصمة</div>
                    <div className="font-black text-brand-dark mt-1 flex items-center justify-center gap-1">
                      <Fingerprint size={13}/>{emp.devicePin || '—'}
                    </div>
                  </div>
                </div>

                <div className="p-4 flex gap-2">
                  <button onClick={() => openEdit(emp)}
                    className="flex-1 text-xs bg-fuchsia-bg text-fuchsia px-3 py-2 rounded-lg font-bold hover:bg-fuchsia-light">
                    تعديل
                  </button>
                  <Link to={`/admin/payroll?emp=${emp._id}`}
                    className="flex-1 text-center text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg font-bold hover:bg-green-100 flex items-center justify-center gap-1">
                    <Wallet size={13}/> المحاسبة
                  </Link>
                  {emp.isActive && (
                    <button onClick={() => deactivate(emp)}
                      className="text-xs bg-red-50 text-red-500 px-3 py-2 rounded-lg font-bold hover:bg-red-100">
                      إلغاء
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل موظف' : 'إضافة موظف جديد'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">الاسم *</label>
              <input value={form.name} onChange={e=>set('name',e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"/>
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">المسمى الوظيفي</label>
              <input value={form.role} onChange={e=>set('role',e.target.value)}
                placeholder="كاشير، مطبخ..."
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"/>
            </div>
          </div>

          <div className="rounded-2xl bg-fuchsia-bg p-4">
            <label className="text-sm font-black text-brand-dark mb-1.5 block">الأجرة اليومية (ل.س) *</label>
            <input type="number" min="1" value={form.dailyWage} onChange={e=>set('dailyWage',e.target.value)}
              placeholder="مثال: 100000"
              className="w-full px-4 py-3 border-2 border-fuchsia/30 rounded-xl focus:border-fuchsia focus:outline-none font-black bg-white"/>
            <p className="text-[11px] text-brand-gray font-bold mt-2">
              الحساب = عدد الأيام + أنصاف الأيام × الأجرة اليومية، ثم المكافآت والحسميات والسلف.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">تاريخ التوظيف</label>
              <input type="date" value={form.hireDate} onChange={e=>set('hireDate',e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"/>
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">الهاتف</label>
              <input value={form.phone} onChange={e=>set('phone',e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"/>
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">القسم</label>
              <input value={form.department} onChange={e=>set('department',e.target.value)}
                placeholder="المطبخ، الكاشير..."
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"/>
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">رقم البصمة PIN</label>
              <input value={form.devicePin} onChange={e=>set('devicePin',e.target.value)} dir="ltr"
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"/>
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">ملاحظات</label>
            <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={2}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold resize-none"/>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={save} loading={saving} className="flex-1">حفظ</Button>
            <Button variant="outline" onClick={()=>setModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
