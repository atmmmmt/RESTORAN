import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  LayoutGrid, Plus, Trash2, Save, ArrowUp, ArrowDown,
  Eye, EyeOff, AlertTriangle, PackageSearch, Image as ImageIcon,
} from 'lucide-react'
import { categoriesAPI } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import PageHeader   from '../../components/common/PageHeader'
import Button       from '../../components/common/Button'
import Modal        from '../../components/common/Modal'
import LoadingState from '../../components/common/LoadingState'
import ImageUpload  from '../../components/common/ImageUpload'
import toast from 'react-hot-toast'

const inputCls = 'w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold'

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-sm font-bold text-brand-dark mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-brand-gray-light mt-1 font-medium">{hint}</p>}
    </div>
  )
}

/**
 * Menu sections.
 *
 * Products reference a category by *name*, so a rename is not a local edit —
 * the server rewrites every product that used the old name in the same
 * request. The UI leans on that: it saves the whole row at once and reports
 * how many products moved, rather than pretending the two are independent.
 */
export default function CategoriesPage() {
  const { isAdmin } = useAuth()

  const [categories, setCategories] = useState([])
  const [orphans,    setOrphans]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [busy,       setBusy]       = useState('')

  /* Per-row draft, so typing in one card never touches another. */
  const [drafts, setDrafts] = useState({})

  const [adding,  setAdding]  = useState(false)
  const [newCat,  setNewCat]  = useState({ name: '', image: '', imagePublicId: null })
  const [deleting, setDeleting] = useState(null)   // the category pending deletion
  const [moveTo,   setMoveTo]   = useState('')

  const load = useCallback(async () => {
    try {
      const [cats, orph] = await Promise.all([
        categoriesAPI.getAll(true),
        categoriesAPI.orphans().catch(() => ({ data: { orphans: [] } })),
      ])
      const list = cats.data.categories || []
      setCategories(list)
      setDrafts(Object.fromEntries(list.map(c => [c._id, { name: c.name, image: c.image, imagePublicId: c.imagePublicId }])))
      setOrphans(orph.data.orphans || [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const run = async (key, fn, okMsg) => {
    setBusy(key)
    try {
      const res = await fn()
      if (okMsg !== null) toast.success(res?.data?.message || okMsg)
      return res
    } catch (e) {
      toast.error(e.message)
    } finally { setBusy('') }
  }

  const setDraft = (id, patch) => setDrafts(d => ({ ...d, [id]: { ...d[id], ...patch } }))

  const saveRow = c => {
    const d = drafts[c._id] || {}
    return run(`save-${c._id}`, () => categoriesAPI.update(c._id, {
      name: d.name, image: d.image, imagePublicId: d.imagePublicId,
    }), 'تم الحفظ').then(load)
  }

  const toggleActive = c =>
    run(`vis-${c._id}`, () => categoriesAPI.update(c._id, { isActive: !c.isActive }),
      c.isActive ? 'أُخفي من المنيو' : 'أصبح ظاهراً').then(load)

  /* Reorder by swapping with the neighbour, then persisting the whole list —
     the server takes one array so a half-applied order is impossible. */
  const move = (index, delta) => {
    const next = [...categories]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setCategories(next)
    return run('reorder', () => categoriesAPI.reorder(next.map(c => c._id)), 'تم حفظ الترتيب').then(load)
  }

  const addCategory = () => {
    if (!newCat.name.trim()) return toast.error('اكتب اسم التصنيف')
    return run('add', () => categoriesAPI.create(newCat), null).then(res => {
      if (!res) return
      toast.success(res.data.message)
      setAdding(false)
      setNewCat({ name: '', image: '', imagePublicId: null })
      load()
    })
  }

  /* Adopt a name that products already use but no category row covers. */
  const adopt = name =>
    run(`adopt-${name}`, () => categoriesAPI.create({ name }), 'تمت إضافته').then(load)

  const confirmDelete = async () => {
    if (!deleting) return
    const res = await run(`del-${deleting._id}`, () => categoriesAPI.delete(deleting._id, moveTo || undefined), null)
    if (!res) return          // the error toast already explained why
    toast.success(res.data.message)
    setDeleting(null)
    setMoveTo('')
    load()
  }

  if (loading) return <LoadingState />

  const others = categories.filter(c => c._id !== deleting?._id)

  return (
    <div>
      <PageHeader
        title="التصنيفات"
        subtitle="أقسام المنيو — الاسم والصورة والترتيب"
        actions={isAdmin && (
          <Button size="sm" onClick={() => setAdding(true)} icon={<Plus size={14} />}>
            تصنيف جديد
          </Button>
        )}
      />

      {/* Names in use with no row — the storefront draws these without a
          picture, so they are worth fixing rather than hiding. */}
      {!!orphans.length && (
        <div className="mb-5 rounded-2xl p-4" style={{ background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.35)' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-black text-amber-800">تصنيفات مستخدمة على منتجات لكنها غير مسجّلة</div>
              <p className="text-xs font-medium text-amber-700 mt-1">
                تظهر في المنيو بدون صورة. أضفها لتتحكم باسمها وصورتها.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {orphans.map(o => (
                  <button key={o.name} onClick={() => adopt(o.name)} disabled={busy === `adopt-${o.name}`}
                    className="px-3 py-1.5 rounded-lg bg-white border-2 border-amber-300 text-xs font-black text-amber-800 hover:border-amber-500 transition-colors">
                    <Plus size={11} className="inline ml-1" />
                    {o.name} ({o.productCount})
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {categories.map((c, i) => {
          const d = drafts[c._id] || {}
          const dirty = d.name !== c.name || d.image !== c.image

          return (
            <motion.div key={c._id} layout
              className={`bg-white rounded-2xl p-5 shadow-card space-y-4 ${c.isActive ? '' : 'opacity-60'}`}>

              <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-brand-bg flex-shrink-0 flex items-center justify-center">
                  {d.image
                    ? <img src={d.image} alt={c.name} className="w-full h-full object-cover" />
                    : <ImageIcon size={26} className="text-brand-gray-light" />}
                </div>

                <div className="flex-1 min-w-0">
                  <input value={d.name ?? ''} disabled={!isAdmin}
                    onChange={e => setDraft(c._id, { name: e.target.value })}
                    className={inputCls + ' mb-2'} />
                  <div className="flex items-center gap-3 text-xs font-bold text-brand-gray">
                    <span className="flex items-center gap-1">
                      <PackageSearch size={12} /> {c.productCount} منتج
                    </span>
                    {!c.isActive && <span className="text-amber-600">مخفي من المنيو</span>}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <>
                  <ImageUpload
                    label="صورة التصنيف"
                    placeholder="🗂️"
                    value={d.image}
                    publicId={d.imagePublicId}
                    onChange={(url, publicId) => setDraft(c._id, { image: url || '', imagePublicId: publicId })}
                  />

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-brand-border">
                    <Button size="sm" onClick={() => saveRow(c)} loading={busy === `save-${c._id}`}
                      disabled={!dirty} icon={<Save size={13} />}>
                      حفظ
                    </Button>

                    <Button size="sm" variant="ghost" onClick={() => toggleActive(c)}
                      loading={busy === `vis-${c._id}`}
                      icon={c.isActive ? <EyeOff size={13} /> : <Eye size={13} />}>
                      {c.isActive ? 'إخفاء' : 'إظهار'}
                    </Button>

                    <div className="flex gap-1">
                      <button onClick={() => move(i, -1)} disabled={i === 0}
                        className="p-2 rounded-lg border-2 border-brand-border hover:border-fuchsia disabled:opacity-30 disabled:hover:border-brand-border"
                        aria-label="تحريك لأعلى">
                        <ArrowUp size={13} />
                      </button>
                      <button onClick={() => move(i, 1)} disabled={i === categories.length - 1}
                        className="p-2 rounded-lg border-2 border-brand-border hover:border-fuchsia disabled:opacity-30 disabled:hover:border-brand-border"
                        aria-label="تحريك لأسفل">
                        <ArrowDown size={13} />
                      </button>
                    </div>

                    <Button size="sm" variant="danger" className="mr-auto"
                      onClick={() => { setDeleting(c); setMoveTo('') }} icon={<Trash2 size={13} />}>
                      حذف
                    </Button>
                  </div>

                  {dirty && d.name !== c.name && (
                    <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                      <AlertTriangle size={12} />
                      إعادة التسمية ستنقل {c.productCount} منتج للاسم الجديد
                    </p>
                  )}
                </>
              )}
            </motion.div>
          )
        })}
      </div>

      {!categories.length && (
        <div className="bg-white rounded-2xl p-10 text-center shadow-card">
          <LayoutGrid size={36} className="mx-auto text-brand-gray-light mb-3" />
          <p className="font-bold text-brand-gray">لا يوجد تصنيفات بعد</p>
        </div>
      )}

      {/* ── Add ── */}
      <Modal open={adding} onClose={() => setAdding(false)} title="تصنيف جديد">
        <div className="space-y-4">
          <Field label="الاسم" hint="سيظهر كما هو في المنيو">
            <input value={newCat.name} onChange={e => setNewCat(c => ({ ...c, name: e.target.value }))}
              className={inputCls} placeholder="مثلاً: حلويات" />
          </Field>

          <Field label="الصورة">
            <ImageUpload
              label="صورة التصنيف"
              placeholder="🗂️"
              value={newCat.image}
              publicId={newCat.imagePublicId}
              onChange={(url, publicId) => setNewCat(c => ({ ...c, image: url || '', imagePublicId: publicId }))}
            />
          </Field>

          <Button onClick={addCategory} loading={busy === 'add'} className="w-full">إضافة</Button>
        </div>
      </Modal>

      {/* ── Delete ── */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={`حذف «${deleting?.name || ''}»`}>
        <div className="space-y-4">
          {deleting?.productCount ? (
            <>
              <div className="rounded-xl p-4 flex items-start gap-3"
                style={{ background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.35)' }}>
                <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm font-bold text-amber-800">
                  هذا التصنيف يحتوي {deleting.productCount} منتج.
                  <div className="font-medium text-xs mt-1">اختر تصنيفاً تُنقل إليه — لن يُحذف أي منتج.</div>
                </div>
              </div>

              <Field label="انقل المنتجات إلى">
                <select value={moveTo} onChange={e => setMoveTo(e.target.value)} className={inputCls}>
                  <option value="">— اختر تصنيفاً —</option>
                  {others.map(o => <option key={o._id} value={o.name}>{o.name}</option>)}
                </select>
              </Field>
            </>
          ) : (
            <p className="text-sm font-medium text-brand-gray">
              التصنيف فارغ — يمكن حذفه مباشرة.
            </p>
          )}

          <Button variant="danger" className="w-full" onClick={confirmDelete}
            loading={busy === `del-${deleting?._id}`}
            disabled={!!deleting?.productCount && !moveTo}>
            تأكيد الحذف
          </Button>
        </div>
      </Modal>
    </div>
  )
}
