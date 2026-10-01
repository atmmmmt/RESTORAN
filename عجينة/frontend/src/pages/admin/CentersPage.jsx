import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Store, MapPin, Phone, ChevronLeft } from 'lucide-react'
import { centersAPI, employeesAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import EmptyState from '../../components/common/EmptyState'
import LoadingState from '../../components/common/LoadingState'
import { formatCurrency, getCenterTypeText } from '../../utils/formatters'
import toast from 'react-hot-toast'

const INITIAL = { name: '', type: 'regular_price_center', commissionPercent: 0, contactPerson: '', phone: '', location: '', notes: '', mapLink: '', availableProducts: [] }

export default function CentersPage() {
  const [centers,   setCenters]   = useState([])
  const [employees, setEmployees] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [form,     setForm]     = useState(INITIAL)
  const [saving,   setSaving]   = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      centersAPI.getAll().then(r => setCenters(r.data.centers || [])),
      employeesAPI.getAll().then(r => setEmployees(r.data.employees || [])),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd  = () => { setEditing(null); setForm(INITIAL); setModal(true) }
  const openEdit = (c) => {
    setEditing(c)
    setForm({
      name: c.name, type: c.type,
      commissionPercent: c.commissionPercent || 0,
      contactPerson: c.contactPerson || '', phone: c.phone || '',
      location: c.location || '', notes: c.notes || '',
      mapLink: c.mapLink || '',
      availableProducts: c.availableProducts || [],
    })
    setModal(true)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name) return toast.error('اسم الفرع مطلوب')
    setSaving(true)
    try {
      if (editing) { await centersAPI.update(editing._id, form); toast.success('تم تحديث الفرع') }
      else { await centersAPI.create(form); toast.success('تم إنشاء الفرع') }
      setModal(false); load()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const toggle = async (c) => {
    try {
      await centersAPI.update(c._id, { isActive: !c.isActive })
      toast.success(c.isActive ? 'تم تعطيل الفرع' : 'تم تفعيل الفرع')
      load()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div>
      <PageHeader title="فروعنا" subtitle="إدارة نقاط البيع والموزعين"
        actions={<Button onClick={openAdd}>+ فرع جديد</Button>} />

      {loading ? <LoadingState /> : centers.length === 0 ? (
        <EmptyState icon="🏪" title="لا توجد فروع" action={<Button onClick={openAdd}>+ إضافة فرع</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {centers.map((c, i) => (
            <motion.div key={c._id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className={`bg-white rounded-2xl shadow-card overflow-hidden transition-all duration-200 hover:-translate-y-0.5 ${!c.isActive ? 'opacity-60' : ''}`}>

              {/* Card header – brand gradient */}
              <div className="p-5 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #A96734 0%, #6F3E25 100%)' }}>
                <div className="absolute -top-5 -left-5 w-20 h-20 rounded-full opacity-10 bg-white" />
                <div className="absolute -bottom-4 -right-4 w-14 h-14 rounded-full opacity-10 bg-white" />
                <div className="relative flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.18)' }}>
                    <Store size={20} style={{ color: '#FBF7F0' }} />
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-lg font-bold ${c.isActive ? 'bg-green-500/20 text-green-100' : 'bg-white/20 text-white/60'}`}>
                    {c.isActive ? 'نشط' : 'معطل'}
                  </span>
                </div>
                <h3 className="font-black text-lg" style={{ color: '#FBF7F0' }}>
                  {c.name}
                  {c.contactPerson && (
                    <span className="font-bold text-sm" style={{ color: 'rgba(251,247,240,0.75)' }}> — {c.contactPerson}</span>
                  )}
                </h3>
                <div className="text-xs font-bold mt-0.5" style={{ color: 'rgba(251,247,240,0.7)' }}>{getCenterTypeText(c.type)}</div>
                {c.location && (
                  <div className="flex items-center gap-1 mt-1.5 text-xs font-medium" style={{ color: 'rgba(251,247,240,0.65)' }}>
                    <MapPin size={10} /> {c.location}
                  </div>
                )}
                {c.type === 'commission_based_specialized_center' && (
                  <div className="text-xs px-2 py-0.5 rounded-lg font-bold inline-block mt-2"
                    style={{ background: 'rgba(255,255,255,0.15)', color: '#FBF7F0' }}>
                    عمولة: {c.commissionPercent}%
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="p-4 grid grid-cols-2 gap-3 border-b border-brand-border">
                <div>
                  <div className="text-xs text-brand-gray font-bold mb-0.5">الرصيد المتبقي</div>
                  <div className="font-black text-fuchsia">{formatCurrency(c.currentBalance)}</div>
                </div>
                <div>
                  <div className="text-xs text-brand-gray font-bold mb-0.5">إجمالي المبيعات</div>
                  <div className="font-black text-brand-dark">{formatCurrency(c.totalSoldValue)}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={() => openEdit(c)} className="text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors">تعديل</button>
                  <button onClick={() => toggle(c)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${c.isActive ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                    {c.isActive ? 'تعطيل' : 'تفعيل'}
                  </button>
                </div>
                <Link to={`/admin/centers/${c._id}`}>
                  <button className="text-xs bg-brand-bg text-brand-gray px-3 py-1.5 rounded-lg font-bold hover:bg-brand-offwhite transition-colors flex items-center gap-1">
                    التفاصيل <ChevronLeft size={13} />
                  </button>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل فرع' : 'فرع بيع جديد'}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">اسم الفرع *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">المسؤول</label>
              <select value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                <option value="">— اختر موظف —</option>
                {employees.map(emp => (
                  <option key={emp._id} value={emp.name}>
                    {emp.name}{emp.role ? ` — ${emp.role}` : ''}
                  </option>
                ))}
                {form.contactPerson && !employees.some(emp => emp.name === form.contactPerson) && (
                  <option value={form.contactPerson}>{form.contactPerson} (سابق)</option>
                )}
              </select>
              {employees.length === 0 && (
                <p className="text-xs text-brand-gray-light mt-1 font-medium">لا يوجد موظفون مضافون بعد — أضيفي موظفين أولاً من صفحة الموظفين</p>
              )}
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">الهاتف</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">الموقع (نص)</label>
            <input value={form.location} onChange={e => set('location', e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
              placeholder="مثال: دمشق — المزة، شارع الجلاء" />
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">
              رابط خرائط Google 📍
            </label>
            <input value={form.mapLink} onChange={e => set('mapLink', e.target.value)} dir="ltr"
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm"
              placeholder="https://maps.google.com/?q=..." />
            <p className="text-xs text-brand-gray-light mt-1 font-medium">
              افتحي الموقع على Google Maps ← شاركي ← انسخي الرابط
            </p>
          </div>

          <div className="flex gap-3">
            <Button onClick={save} loading={saving} className="flex-1">حفظ</Button>
            <Button variant="outline" onClick={() => setModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
