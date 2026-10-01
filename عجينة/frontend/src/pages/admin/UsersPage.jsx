import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck, UserCog, Eye, Plus, Pencil, Trash2,
  Mail, Phone, Clock, CheckCircle2, XCircle, KeyRound, Building2,
} from 'lucide-react'
import { usersAPI, centersAPI } from '../../services/api'
import { useAuth, ROLE_LABELS, ROLE_DESCRIPTIONS } from '../../hooks/useAuth'
import PageHeader   from '../../components/common/PageHeader'
import Button       from '../../components/common/Button'
import Modal        from '../../components/common/Modal'
import EmptyState   from '../../components/common/EmptyState'
import LoadingState from '../../components/common/LoadingState'
import toast from 'react-hot-toast'

const ROLE_META = {
  admin:      { Icon: ShieldCheck, color: '#A96734', bg: 'rgba(169,103,52,0.12)' },
  supervisor: { Icon: UserCog,     color: '#4A7A2E', bg: 'rgba(74,122,46,0.12)' },
  cashier:    { Icon: UserCog,     color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
  kitchen:    { Icon: UserCog,     color: '#B45309', bg: 'rgba(180,83,9,0.12)' },
  viewer:     { Icon: Eye,         color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  americans_manager: { Icon: Building2, color: '#8B4513', bg: 'rgba(139,69,19,0.12)' },
}

const EMPTY = { name: '', email: '', phone: '', password: '', role: 'supervisor', centerId: '', isActive: true }

export default function UsersPage() {
  const { user: me } = useAuth()
  const [users,   setUsers]   = useState([])
  const [centers, setCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [form,    setForm]    = useState(EMPTY)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const load = async () => {
    try {
      const [usersRes, centersRes] = await Promise.all([usersAPI.getAll(), centersAPI.getAll()])
      setUsers(usersRes.data.users || [])
      setCenters(centersRes.data.centers || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY)
    setModal(true)
  }

  const openEdit = u => {
    setEditing(u)
    setForm({
      name: u.name || '', email: u.email || '', phone: u.phone || '',
      password: '', role: u.role, centerId: u.centerId?._id || u.centerId || '', isActive: u.isActive !== false,
    })
    setModal(true)
  }

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) return toast.error('الاسم والبريد مطلوبان')
    if (!editing && form.password.length < 6) return toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')

    setSaving(true)
    try {
      const payload = { ...form }
      if (editing && !payload.password) delete payload.password

      if (editing) {
        await usersAPI.update(editing._id, payload)
        toast.success('تم تحديث الحساب')
      } else {
        await usersAPI.create(payload)
        toast.success('تم إنشاء الحساب')
      }
      setModal(false)
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async u => {
    try {
      await usersAPI.update(u._id, { isActive: u.isActive === false })
      toast.success(u.isActive === false ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب')
      load()
    } catch (e) { toast.error(e.message) }
  }

  const remove = async u => {
    if (!confirm(`حذف حساب "${u.name}" نهائياً؟`)) return
    try {
      await usersAPI.remove(u._id)
      toast.success('تم حذف الحساب')
      load()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div>
      <PageHeader
        title="إدارة المستخدمين"
        subtitle="حسابات الدخول للوحة التحكم وصلاحياتها"
        actions={<Button onClick={openAdd} icon={<Plus size={16} />}>حساب جديد</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {Object.entries(ROLE_LABELS).map(([key, label]) => {
          const { Icon, color, bg } = ROLE_META[key] || ROLE_META.viewer
          return (
            <div key={key} className="bg-white rounded-2xl p-4 shadow-card flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <div className="font-black text-brand-dark text-sm mb-0.5">{label}</div>
                <div className="text-xs text-brand-gray font-medium leading-relaxed">{ROLE_DESCRIPTIONS[key]}</div>
              </div>
            </div>
          )
        })}
      </div>

      {loading ? <LoadingState /> : users.length === 0 ? (
        <EmptyState icon="👤" title="لا يوجد مستخدمون" action={<Button onClick={openAdd}>+ إضافة حساب</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u, i) => {
            const { Icon, color, bg } = ROLE_META[u.role] || ROLE_META.viewer
            const disabled = u.isActive === false
            const isMe = me && String(me._id || me.id) === String(u._id)

            return (
              <motion.div key={u._id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className={`bg-white rounded-2xl shadow-card overflow-hidden ${disabled ? 'opacity-60' : ''}`}>
                <div className="p-5 border-b border-brand-border">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: bg }}>
                      <Icon size={22} style={{ color }} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isMe && <span className="text-xs px-2 py-1 rounded-lg font-bold bg-brand-bg text-brand-gray">أنت</span>}
                      <span className="text-xs px-2.5 py-1 rounded-lg font-bold" style={{ background: bg, color }}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </div>
                  </div>
                  <div className="font-black text-brand-dark text-lg">{u.name}</div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-brand-gray font-medium" dir="ltr">
                      <Mail size={12} className="flex-shrink-0" /><span className="truncate">{u.email}</span>
                    </div>
                    {u.phone && <div className="flex items-center gap-2 text-xs text-brand-gray font-medium" dir="ltr"><Phone size={12} /> {u.phone}</div>}
                    {u.centerId?.name && <div className="text-xs text-brand-gray font-bold">الفرع: {u.centerId.name}</div>}
                    <div className="flex items-center gap-2 text-xs text-brand-gray-light font-medium">
                      <Clock size={12} />
                      {u.lastLoginAt ? `آخر دخول: ${new Date(u.lastLoginAt).toLocaleDateString('ar-EG')}` : 'لم يسجّل دخول بعد'}
                    </div>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(u)} className="text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors flex items-center gap-1"><Pencil size={12} /> تعديل</button>
                    {!isMe && (
                      <button onClick={() => toggleActive(u)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1 ${disabled ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}>
                        {disabled ? <><CheckCircle2 size={12} /> تفعيل</> : <><XCircle size={12} /> تعطيل</>}
                      </button>
                    )}
                  </div>
                  {!isMe && <button onClick={() => remove(u)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded-lg font-bold transition-colors"><Trash2 size={14} /></button>}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل الحساب' : 'حساب جديد'}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">الاسم *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
          </div>

          {['cashier', 'kitchen'].includes(form.role) && (
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">الفرع المسموح</label>
              <select value={form.centerId} onChange={e => set('centerId', e.target.value)} className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                <option value="">المقر الرئيسي / كل الفروع</option>
                {centers.filter(c => c.isActive !== false).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-brand-gray mt-1">عند اختيار فرع لن يرى الموظف ولن يعدّل طلبات أي فرع آخر.</p>
            </div>
          )}

          {form.role === 'americans_manager' && (
            <div className="rounded-xl bg-brand-bg border border-brand-border p-3 text-xs font-bold text-brand-gray">
              هذا الحساب يدخل على لوحة إدارة الأميركان فقط ويشاهد البيانات المالية لفرع الأميركان في لوليز وعجينة وطحينة، بدون صلاحية تعديل إعدادات المطعم.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">البريد الإلكتروني *</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} dir="ltr" type="email" className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">الهاتف</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} dir="ltr" className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block flex items-center gap-1.5"><KeyRound size={13} />{editing ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور *'}</label>
            <input value={form.password} onChange={e => set('password', e.target.value)} type="password" dir="ltr" placeholder={editing ? '••••••' : '6 أحرف على الأقل'} className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-2 block">الصلاحية</label>
            <div className="space-y-2">
              {Object.entries(ROLE_LABELS).map(([key, label]) => {
                const { Icon, color, bg } = ROLE_META[key] || ROLE_META.viewer
                const active = form.role === key
                return (
                  <button key={key} type="button" onClick={() => set('role', key)} className={`w-full text-right p-3 rounded-xl border-2 transition-all flex items-start gap-3 ${active ? 'border-fuchsia bg-fuchsia-bg' : 'border-brand-border hover:border-brand-gray-light'}`}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bg }}><Icon size={16} style={{ color }} /></div>
                    <div><div className="font-black text-sm text-brand-dark">{label}</div><div className="text-xs text-brand-gray font-medium leading-relaxed mt-0.5">{ROLE_DESCRIPTIONS[key]}</div></div>
                  </button>
                )
              })}
            </div>
          </div>

          {editing && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="w-4 h-4 accent-fuchsia" />
              <span className="text-sm font-bold text-brand-dark">الحساب مفعّل</span>
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={save} loading={saving} className="flex-1">{editing ? 'حفظ التعديلات' : 'إنشاء الحساب'}</Button>
            <Button variant="ghost" onClick={() => setModal(false)}>إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
