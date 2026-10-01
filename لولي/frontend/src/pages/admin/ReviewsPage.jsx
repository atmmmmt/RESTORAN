import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Star, Pencil, Trash2, EyeOff, Eye } from 'lucide-react'
import { reviewsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import EmptyState from '../../components/common/EmptyState'
import toast from 'react-hot-toast'

const STARS = [1, 2, 3, 4, 5]

const INITIAL = { customerName: '', content: '', rating: 5, isVisible: true }

export default function ReviewsPage() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(INITIAL)
  const [saving, setSaving]   = useState(false)

  const load = () => {
    setLoading(true)
    reviewsAPI.getAll().then(r => setReviews(r.data.reviews || [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd  = () => { setEditing(null); setForm(INITIAL); setModal(true) }
  const openEdit = (r) => {
    setEditing(r)
    setForm({ customerName: r.customerName, content: r.content, rating: r.rating, isVisible: r.isVisible })
    setModal(true)
  }

  const save = async () => {
    if (!form.customerName || !form.content) return toast.error('الاسم والرأي مطلوبان')
    setSaving(true)
    try {
      if (editing) {
        await reviewsAPI.update(editing._id, form)
        toast.success('تم التحديث')
      } else {
        await reviewsAPI.create(form)
        toast.success('تمت الإضافة')
      }
      setModal(false); load()
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setSaving(false) }
  }

  const toggleVisible = async (r) => {
    try {
      await reviewsAPI.update(r._id, { isVisible: !r.isVisible })
      load()
    } catch { toast.error('حدث خطأ') }
  }

  const del = async (id) => {
    if (!confirm('حذف هذا الرأي؟')) return
    try { await reviewsAPI.delete(id); toast.success('تم الحذف'); load() }
    catch { toast.error('حدث خطأ') }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <PageHeader
        title="آراء العملاء"
        subtitle="إدارة شهادات وتقييمات الزبائن"
        actions={<Button onClick={openAdd}>+ إضافة رأي</Button>}
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-40 animate-pulse shadow-card" />)}
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState icon={Star} title="لا توجد آراء" description="أضيفي أول رأي لعرضه على الموقع" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reviews.map((r, i) => (
            <motion.div key={r._id}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className={`bg-white rounded-2xl shadow-card p-5 flex flex-col gap-3 ${!r.isVisible ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-fuchsia-bg flex items-center justify-center text-lg font-black text-fuchsia">{r.customerName?.trim()?.[0] || '؟'}</div>
                  <div>
                    <div className="font-black text-brand-dark text-sm">{r.customerName}</div>
                    <div className="flex gap-0.5 mt-0.5">
                      {STARS.map(s => <Star key={s} size={13} fill="currentColor" strokeWidth={0} className={s <= r.rating ? 'text-yellow-400' : 'text-brand-border'} />)}
                    </div>
                  </div>
                </div>
                {!r.isVisible && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-lg font-bold">مخفي</span>}
              </div>

              <p className="text-brand-gray font-medium text-sm leading-relaxed flex-1">"{r.content}"</p>

              <div className="flex gap-2 pt-2 border-t border-brand-border">
                <button onClick={() => openEdit(r)} className="flex-1 text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors flex items-center justify-center gap-1"><Pencil size={13} /> تعديل</button>
                <button onClick={() => toggleVisible(r)} className={`flex-1 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-1 ${r.isVisible ? 'bg-gray-50 text-gray-500 hover:bg-gray-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                  {r.isVisible ? <><EyeOff size={13} /> إخفاء</> : <><Eye size={13} /> إظهار</>}
                </button>
                <button onClick={() => del(r._id)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center gap-1"><Trash2 size={13} /> حذف</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل رأي' : 'إضافة رأي جديد'}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">اسم العميل *</label>
            <input value={form.customerName} onChange={e => set('customerName', e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
              placeholder="أم أحمد، سارة..." />
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">الرأي *</label>
            <textarea value={form.content} onChange={e => set('content', e.target.value)} rows={3}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold resize-none"
              placeholder="اكتبي رأي العميل بالضبط..." />
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-2 block">التقييم</label>
            <div className="flex gap-1">
              {STARS.map(s => (
                <button key={s} type="button" onClick={() => set('rating', s)}
                  className={`transition-transform hover:scale-110 ${s <= form.rating ? 'text-yellow-400' : 'text-brand-border'}`}>
                  <Star size={26} fill="currentColor" strokeWidth={0} />
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" onClick={() => set('isVisible', !form.isVisible)}
              className={`w-11 h-6 rounded-full transition-all relative ${form.isVisible ? 'bg-fuchsia' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isVisible ? 'right-1' : 'left-1'}`} />
            </button>
            <span className="text-sm font-bold text-brand-dark">ظاهر على الموقع</span>
          </label>

          <div className="flex gap-3 pt-2">
            <Button onClick={save} loading={saving} className="flex-1">حفظ</Button>
            <Button variant="outline" onClick={() => setModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
