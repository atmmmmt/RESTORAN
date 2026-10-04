import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UtensilsCrossed, Minus, Plus, Check } from 'lucide-react'
import { productsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import LoadingState from '../../components/common/LoadingState'
import EmptyState from '../../components/common/EmptyState'
import { formatCurrency, isImageUrl } from '../../utils/formatters'
import toast from 'react-hot-toast'

/* Stock edited straight from the card — no need to open the full product form
   just to say how many portions are ready today. Saves on +/−, Enter or blur. */
function QuantityEditor({ product, onSaved }) {
  const [value, setValue] = useState(String(product.availableQuantity ?? 0))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setValue(String(product.availableQuantity ?? 0)) }, [product.availableQuantity])

  const save = async (next) => {
    const qty = Math.max(0, Math.floor(Number(next)))
    if (!Number.isFinite(qty)) { setValue(String(product.availableQuantity ?? 0)); return }
    setValue(String(qty))
    if (qty === product.availableQuantity) return
    setSaving(true)
    try {
      await productsAPI.update(product._id, { availableQuantity: qty })
      onSaved(qty)
      setSaved(true)
      setTimeout(() => setSaved(false), 1200)
    } catch (e) {
      toast.error(e.message || 'تعذّر حفظ الكمية')
      setValue(String(product.availableQuantity ?? 0))
    } finally { setSaving(false) }
  }

  const btn = 'w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40'
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-brand-gray font-bold">المتاح:</span>
      <button type="button" disabled={saving || Number(value) <= 0} onClick={() => save(Number(value) - 1)}
        className={`${btn} bg-brand-bg text-brand-dark hover:bg-fuchsia-bg`} aria-label="إنقاص">
        <Minus size={14} />
      </button>
      <input type="number" min="0" inputMode="numeric" value={value} disabled={saving}
        onChange={e => setValue(e.target.value)}
        onBlur={() => save(value)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="w-16 h-8 text-center border-2 border-brand-border rounded-lg font-black text-sm focus:border-fuchsia focus:outline-none" />
      <button type="button" disabled={saving} onClick={() => save(Number(value) + 1)}
        className={`${btn} bg-fuchsia text-white hover:bg-fuchsia-dark`} aria-label="زيادة">
        <Plus size={14} />
      </button>
      <span className="text-xs text-brand-gray font-bold">وحدة</span>
      {saved && <Check size={15} className="text-green-600" />}
    </div>
  )
}

const STATUS_MAP = { available: { label: 'متاح', cls: 'bg-green-50 text-green-600' }, hidden: { label: 'مخفي', cls: 'bg-gray-100 text-gray-500' }, sold_out: { label: 'نفدت', cls: 'bg-red-50 text-red-600' } }

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    productsAPI.getAll().then(r => setProducts(r.data.products || [])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const toggleMenu = async (p) => {
    try {
      await productsAPI.update(p._id, { showInTodayMenu: !p.showInTodayMenu })
      toast.success(p.showInTodayMenu ? 'تم إخفاؤه من منيو اليوم' : 'تم إضافته لمنيو اليوم')
      load()
    } catch (e) { toast.error(e.message) }
  }

  const del = async (id) => {
    if (!confirm('حذف هذا المنتج نهائياً من قائمة المنتجات؟\n\nلن تتأثر الفواتير والطلبات القديمة.')) return
    try {
      await productsAPI.delete(id)
      toast.success('تم حذف المنتج')
      setProducts(list => list.filter(p => p._id !== id))
    } catch (e) {
      toast.error(e.message || 'تعذّر حذف المنتج')
    }
  }

  return (
    <div>
      <PageHeader
        title="المنتجات"
        subtitle="إدارة وجبات لوليز"
        actions={
          <Link to="/admin/products/new">
            <Button>+ منتج جديد</Button>
          </Link>
        }
      />

      {loading ? <LoadingState /> : products.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="لا توجد منتجات" description="ابدئي بإضافة أول وجبة"
          action={<Link to="/admin/products/new"><Button>+ إضافة منتج</Button></Link>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p, i) => {
            const status = STATUS_MAP[p.status] || STATUS_MAP.hidden
            const margin = p.directPrice > 0 ? (((p.directPrice - (p.calculatedCost || 0)) / p.directPrice) * 100).toFixed(0) : 0
            return (
              <motion.div key={p._id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className="bg-white rounded-2xl shadow-card overflow-hidden">
                {/* Card header */}
                <div className="bg-gradient-to-br from-fuchsia-bg to-brand-offwhite p-5 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-3xl shadow-sm overflow-hidden flex-shrink-0">
                    {isImageUrl(p.image) ? (
                      <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <UtensilsCrossed size={24} className="text-brand-gray-light" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-brand-dark truncate">{p.name}</h3>
                    <div className="text-xs text-brand-gray font-bold">{p.category}</div>
                    <div className={`text-xs px-2 py-0.5 rounded-lg font-bold inline-block mt-1 ${status.cls}`}>{status.label}</div>
                  </div>
                </div>

                {/* Stats */}
                <div className="p-4 grid grid-cols-3 gap-2 text-center border-b border-brand-border">
                  <div>
                    <div className="text-xs text-brand-gray font-bold">سعر البيع</div>
                    <div className="font-black text-fuchsia text-sm">{formatCurrency(p.directPrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-gray font-bold">التكلفة</div>
                    <div className="font-black text-brand-dark text-sm">{formatCurrency(p.calculatedCost)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-gray font-bold">الهامش</div>
                    <div className={`font-black text-sm ${Number(margin) > 30 ? 'text-green-600' : 'text-red-500'}`}>{margin}%</div>
                  </div>
                </div>

                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-brand-gray font-bold">منيو اليوم</span>
                    <button onClick={() => toggleMenu(p)}
                      className={`w-10 h-5 rounded-full transition-all relative ${p.showInTodayMenu ? 'bg-fuchsia' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${p.showInTodayMenu ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/admin/products/${p._id}/edit`}>
                      <button className="text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors">تعديل</button>
                    </Link>
                    <button onClick={() => del(p._id)} className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors">حذف</button>
                  </div>
                </div>

                <div className="px-4 pb-3 flex items-center gap-3">
                  <QuantityEditor product={p}
                    onSaved={qty => setProducts(list => list.map(x => x._id === p._id ? { ...x, availableQuantity: qty } : x))} />
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
