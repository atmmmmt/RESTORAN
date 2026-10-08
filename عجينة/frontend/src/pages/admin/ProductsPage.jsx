import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, ChevronRight, ChevronLeft, Eye, EyeOff, Trash2 } from 'lucide-react'
import { productsAPI, categoriesAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import LoadingState from '../../components/common/LoadingState'
import EmptyState from '../../components/common/EmptyState'
import { formatCurrency, isImageUrl } from '../../utils/formatters'
import toast from 'react-hot-toast'

const STATUS_MAP = { available: { label: 'متاح', cls: 'bg-green-50 text-green-600' }, hidden: { label: 'مخفي', cls: 'bg-gray-100 text-gray-500' }, sold_out: { label: 'نفدت', cls: 'bg-red-50 text-red-600' } }
const KITCHEN_SECTION_LABEL = {
  pastries: 'المعجنات', grills: 'المشاوي', appetizers: 'المقبلات', drinks: 'المشروبات', other: 'أخرى',
}
const PAGE_SIZE = 12
const selectCls = 'px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white text-sm'

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [total,    setTotal]    = useState(0)
  const [pages,    setPages]    = useState(1)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [busy,     setBusy]     = useState('')

  const [searchInput, setSearchInput] = useState('')
  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState([])

  /* Debounce typing so each keystroke doesn't fire a request, and go back to
     page 1 — page 7 of a narrower result may not exist. */
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    categoriesAPI.getAll(true)
      .then(r => setCategories((r.data.categories || []).map(c => c.name)))
      .catch(() => { /* the filter just offers "all" */ })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await productsAPI.getAll({
        page, limit: PAGE_SIZE,
        ...(search   ? { search }   : {}),
        ...(status   ? { status }   : {}),
        ...(category ? { category } : {}),
      })
      setProducts(r.data.products || [])
      setTotal(r.data.total ?? (r.data.products || []).length)
      setPages(r.data.pages || 1)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [page, search, status, category])

  useEffect(() => { load() }, [load])

  /* Deleting the last card on the last page would otherwise leave the reader
     on an empty page past the end. */
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])

  const run = async (key, fn, okMsg) => {
    setBusy(key)
    try {
      const res = await fn()
      toast.success(res?.data?.message || okMsg)
      await load()
    } catch (e) { toast.error(e.message) } finally { setBusy('') }
  }

  const toggleMenu = p => run(`menu-${p._id}`,
    () => productsAPI.update(p._id, { showInTodayMenu: !p.showInTodayMenu }),
    p.showInTodayMenu ? 'تم إخفاؤه من منيو اليوم' : 'تم إضافته لمنيو اليوم')

  /* Hiding used to be the only "delete", and with every product listed
     regardless of status it looked like the button did nothing. It is now a
     plain toggle, and the status filter makes hidden items findable. */
  const toggleHidden = p => {
    const hide = p.status !== 'hidden'
    return run(`vis-${p._id}`,
      () => productsAPI.update(p._id, hide ? { status: 'hidden', showInTodayMenu: false } : { status: 'available' }),
      hide ? 'أُخفي المنتج من الموقع' : 'أصبح المنتج ظاهراً')
  }

  const purge = p => {
    if (!confirm(`حذف «${p.name}» نهائياً؟ لا يمكن التراجع.`)) return
    return run(`del-${p._id}`, () => productsAPI.purge(p._id), 'تم حذف المنتج نهائياً')
  }

  const filtered = search || status || category
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const to   = Math.min(page * PAGE_SIZE, total)

  return (
    <div>
      <PageHeader
        title="المنتجات 🍽️"
        subtitle="إدارة وجبات عجينة وطحينة"
        actions={<Link to="/admin/products/new"><Button>+ منتج جديد</Button></Link>}
      />

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-card p-4 mb-5 flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[220px]">
          <span className="sr-only">ابحث عن منتج</span>
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray" />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="ابحث باسم المنتج..."
            className="w-full pr-10 pl-4 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
        </label>
        <select value={category} onChange={e => { setCategory(e.target.value); setPage(1) }} className={selectCls}>
          <option value="">كل التصنيفات</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className={selectCls}>
          <option value="">كل الحالات</option>
          <option value="available">متاح</option>
          <option value="hidden">مخفي</option>
          <option value="sold_out">نفدت</option>
        </select>
        <div className="text-xs font-bold text-brand-gray">
          {total ? `${from}–${to} من ${total}` : 'لا نتائج'}
        </div>
      </div>

      {loading && !products.length ? <LoadingState /> : products.length === 0 ? (
        filtered
          ? <EmptyState icon="🔍" title="لا توجد نتائج" description="جرّب كلمة بحث أو فلتراً آخر" />
          : <EmptyState icon="🍽️" title="لا توجد منتجات" description="ابدأ بإضافة أول وجبة"
              action={<Link to="/admin/products/new"><Button>+ إضافة منتج</Button></Link>} />
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
          {products.map((p, i) => {
            const st = STATUS_MAP[p.status] || STATUS_MAP.hidden
            const margin = p.directPrice > 0 ? (((p.directPrice - (p.calculatedCost || 0)) / p.directPrice) * 100).toFixed(0) : 0
            const hidden = p.status === 'hidden'
            return (
              <motion.div key={p._id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className={`bg-white rounded-2xl shadow-card overflow-hidden ${hidden ? 'opacity-70' : ''}`}>
                <div className="bg-gradient-to-br from-fuchsia-bg to-brand-offwhite p-5 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-3xl shadow-sm overflow-hidden flex-shrink-0">
                    {isImageUrl(p.image)
                      ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      : <span>{p.image || '🍽️'}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-brand-dark truncate">{p.name}</h3>
                    <div className="text-xs text-brand-gray font-bold">{p.category}</div>
                    <div className="text-[11px] text-brand-gray-light font-bold mt-0.5">
                      قسم المطبخ: {KITCHEN_SECTION_LABEL[p.kitchenSection] || 'تلقائي من التصنيف'}
                    </div>
                    <div className={`text-xs px-2 py-0.5 rounded-lg font-bold inline-block mt-1 ${st.cls}`}>{st.label}</div>
                  </div>
                </div>

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

                <div className="p-4 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-brand-gray font-bold">منيو اليوم</span>
                    <button onClick={() => toggleMenu(p)} disabled={hidden || busy === `menu-${p._id}`}
                      title={hidden ? 'أظهر المنتج أولاً' : ''}
                      className={`w-10 h-5 rounded-full transition-all relative disabled:opacity-40 ${p.showInTodayMenu ? 'bg-fuchsia' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${p.showInTodayMenu ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <Link to={`/admin/products/${p._id}/edit`}>
                      <button className="text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors">تعديل</button>
                    </Link>
                    <button onClick={() => toggleHidden(p)} disabled={busy === `vis-${p._id}`}
                      className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-200 transition-colors inline-flex items-center gap-1">
                      {hidden ? <><Eye size={12} /> إظهار</> : <><EyeOff size={12} /> إخفاء</>}
                    </button>
                    <button onClick={() => purge(p)} disabled={busy === `del-${p._id}`}
                      className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors inline-flex items-center gap-1">
                      <Trash2 size={12} /> حذف
                    </button>
                  </div>
                </div>

                <div className="px-4 pb-3 text-xs text-brand-gray font-bold">
                  المتاح: <span className="text-brand-dark">{p.availableQuantity} وحدة</span>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-1.5 flex-wrap">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="p-2 rounded-xl border-2 border-brand-border bg-white disabled:opacity-40" aria-label="السابق">
            <ChevronRight size={16} />
          </button>
          {pageList(page, pages).map((n, i) => n === '…'
            ? <span key={`gap-${i}`} className="px-2 text-brand-gray font-bold">…</span>
            : <button key={n} onClick={() => setPage(n)}
                className={`min-w-[38px] h-[38px] rounded-xl border-2 font-black text-sm transition-colors ${
                  n === page ? 'border-fuchsia bg-fuchsia text-white' : 'border-brand-border bg-white text-brand-dark hover:border-fuchsia'
                }`}>{n}</button>)}
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            className="p-2 rounded-xl border-2 border-brand-border bg-white disabled:opacity-40" aria-label="التالي">
            <ChevronLeft size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

/* First, last, and a window around the current page, with gaps elided —
   fourteen buttons in a row would wrap badly on a phone. */
function pageList(current, total) {
  const keep = new Set([1, total, current - 1, current, current + 1])
  const out = []
  for (let n = 1; n <= total; n++) {
    if (keep.has(n)) out.push(n)
    else if (out[out.length - 1] !== '…') out.push('…')
  }
  return out
}
