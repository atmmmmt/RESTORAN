import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { offersAPI, productsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import EmptyState from '../../components/common/EmptyState'
import LoadingState from '../../components/common/LoadingState'
import { formatCurrency, formatDate } from '../../utils/formatters'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'

const INITIAL = { productId: '', title: '', description: '', discountType: 'percentage', discountValue: 10, startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().add(7, 'day').format('YYYY-MM-DD'), isActive: true }

export default function OffersPage() {
  const [offers, setOffers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(INITIAL)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      offersAPI.getAll().then(r => setOffers(r.data.offers || [])),
      productsAPI.getAll().then(r => setProducts(r.data.products || [])),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm({ ...INITIAL, productId: products[0]?._id || '' }); setModal(true) }
  const openEdit = (o) => {
    setEditing(o)
    setForm({ productId: o.productId?._id || o.productId, title: o.title, description: o.description || '', discountType: o.discountType, discountValue: o.discountValue, startDate: dayjs(o.startDate).format('YYYY-MM-DD'), endDate: dayjs(o.endDate).format('YYYY-MM-DD'), isActive: o.isActive })
    setModal(true)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.productId || !form.title || !form.discountValue) return toast.error('جميع الحقول مطلوبة')
    setSaving(true)
    try {
      if (editing) { await offersAPI.update(editing._id, form); toast.success('تم تحديث العرض') }
      else { await offersAPI.create(form); toast.success('تم إنشاء العرض') }
      setModal(false); load()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('حذف هذا العرض؟')) return
    try { await offersAPI.delete(id); toast.success('تم الحذف'); load() }
    catch (e) { toast.error(e.message) }
  }

  const toggle = async (o) => {
    try { await offersAPI.update(o._id, { isActive: !o.isActive }); load() }
    catch (e) { toast.error(e.message) }
  }

  const isActive = (o) => o.isActive && new Date(o.startDate) <= new Date() && new Date(o.endDate) >= new Date()

  return (
    <div>
      <PageHeader title="العروض 🏷️" subtitle="إدارة العروض والخصومات"
        actions={<Button onClick={openAdd}>+ عرض جديد</Button>} />

      {loading ? <LoadingState /> : offers.length === 0 ? (
        <EmptyState icon="🏷️" title="لا توجد عروض" action={<Button onClick={openAdd}>+ إنشاء عرض</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offers.map((o, i) => {
            const active = isActive(o)
            const prod = o.productId
            return (
              <motion.div key={o._id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className="bg-white rounded-2xl shadow-card overflow-hidden">
                <div className={`p-5 ${active ? 'bg-gradient-to-br from-brand-yellow/20 to-brand-offwhite' : 'bg-brand-bg'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-3xl">🏷️</span>
                    <span className={`text-xs px-2 py-1 rounded-lg font-bold ${active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {active ? 'نشط' : o.isActive ? 'منتهي' : 'معطل'}
                    </span>
                  </div>
                  <h3 className="font-black text-brand-dark">{o.title}</h3>
                  {prod && <div className="text-xs text-brand-gray font-bold mt-1">{prod.name || prod}</div>}
                  <div className="text-xl font-black text-brand-yellow mt-2">
                    {o.discountType === 'percentage' ? `خصم ${o.discountValue}%` : `خصم ${formatCurrency(o.discountValue)}`}
                  </div>
                </div>
                <div className="p-4 border-t border-brand-border">
                  <div className="text-xs text-brand-gray font-bold mb-3">
                    {formatDate(o.startDate)} ← {formatDate(o.endDate)}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <button onClick={() => toggle(o)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${o.isActive ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-600'}`}>
                        {o.isActive ? 'تعطيل' : 'تفعيل'}
                      </button>
                      <button onClick={() => del(o._id)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors">حذف</button>
                    </div>
                    <button onClick={() => openEdit(o)} className="text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors">تعديل</button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل عرض' : 'عرض جديد 🏷️'}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">المنتج *</label>
            <select value={form.productId} onChange={e => set('productId', e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
              {products.map(p => <option key={p._id} value={p._id}>{p.image} {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">عنوان العرض *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
              placeholder="مثال: عرض نهاية الأسبوع" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">نوع الخصم</label>
              <select value={form.discountType} onChange={e => set('discountType', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                <option value="percentage">نسبة مئوية %</option>
                <option value="fixed">مبلغ ثابت ل.س</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">قيمة الخصم</label>
              <input type="number" value={form.discountValue} onChange={e => set('discountValue', Number(e.target.value))}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">تاريخ البداية</label>
              <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">تاريخ النهاية</label>
              <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
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
