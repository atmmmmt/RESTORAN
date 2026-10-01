import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ShoppingCart, Check, X as XIcon, Trash2, Pencil } from 'lucide-react'
import { purchasesAPI, ingredientsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate } from '../../utils/formatters'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'

const UNIT_LABELS = { gram: 'غم', kg: 'كغ', ml: 'مل', liter: 'لتر', piece: 'قطعة' }

/* Plain number inputs made typing a price like 2705 easy to mistype and hard
   to read back — no thousands separator, and the browser's built-in spinner
   arrows sit right where a comma would help most. This shows "2,705" while
   typing but keeps the underlying value a plain numeric string. */
function ThousandsInput({ value, onChange, className, placeholder, allowDecimal = false }) {
  const format = raw => {
    if (raw === '') return ''
    const [intPart, decPart] = String(raw).split('.')
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas
  }
  const handleChange = e => {
    let digitsOnly = allowDecimal
      ? e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
      : e.target.value.replace(/[^\d]/g, '')
    // "0" + typing "2705" naively gives "02705" — drop leading zeros unless
    // that's the whole value or it's "0." for an in-progress decimal.
    digitsOnly = digitsOnly.replace(/^0+(?=\d)/, '')
    onChange(digitsOnly)
  }
  return (
    <input
      type="text" inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={format(value)} onChange={handleChange}
      placeholder={placeholder} dir="ltr"
      className={className}
    />
  )
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paidFromCash, setPaidFromCash] = useState(true)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ ingredientId: '', quantity: 1, costPerUnit: 0 }])
  const [editingId, setEditingId] = useState(null)
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const NEW_ING = '__new' // select value for "type a new ingredient here"

  const load = () => {
    setLoading(true)
    Promise.all([
      purchasesAPI.getAll().then(r => setPurchases(r.data.purchases || [])),
      ingredientsAPI.getAll().then(r => setIngredients(r.data.ingredients || [])),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const addItem = () => setItems(prev => [...prev, { ingredientId: ingredients[0]?._id || '', quantity: 1, costPerUnit: 0 }])
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i, k, v) => setItems(prev => { const n = [...prev]; n[i] = { ...n[i], [k]: v }; return n })

  const unitLabel = it => {
    if (it.ingredientId === NEW_ING) return UNIT_LABELS[it.newUnit || 'kg'] || ''
    const ing = ingredients.find(x => x._id === it.ingredientId)
    return ing ? (UNIT_LABELS[ing.unitType] || '') : ''
  }

  const totalCost = items.reduce((s, it) => s + (Number(it.quantity) * Number(it.costPerUnit)), 0)

  const openModal = () => {
    setEditingId(null)
    setSupplier(''); setPaymentMethod('cash'); setPaidFromCash(true); setNotes('')
    setItems([{ ingredientId: ingredients[0]?._id || '', quantity: 1, costPerUnit: 0 }])
    setModal(true)
  }

  const openEdit = (purchase) => {
    setEditingId(purchase._id)
    setSupplier(purchase.supplierName)
    setPaymentMethod(purchase.paymentMethod || 'cash')
    setPaidFromCash(!!purchase.paidFromCashBalance)
    setNotes(purchase.notes || '')
    setItems((purchase.items || []).map(it => ({
      ingredientId: it.ingredientId?._id || it.ingredientId || '',
      quantity: it.quantity,
      costPerUnit: it.costPerUnit,
    })))
    setModal(true)
  }

  const save = async () => {
    if (!supplier) return toast.error('اسم المورد مطلوب')
    const isNew = i => i.ingredientId === NEW_ING
    const named = i => isNew(i) ? String(i.newName || '').trim() : i.ingredientId
    const filled = items.filter(i => named(i) || Number(i.quantity) > 0 || Number(i.costPerUnit) > 0)
    if (!filled.length) return toast.error('أضف عنصراً واحداً على الأقل')
    for (const i of filled) {
      const label = isNew(i) ? (String(i.newName || '').trim() || 'المكوّن الجديد') : (ingredients.find(x => x._id === i.ingredientId)?.name || 'المكوّن')
      if (!named(i)) return toast.error('اختر المكوّن أو اكتب اسم المكوّن الجديد')
      if (!(Number(i.quantity) > 0)) return toast.error(`اكتب الكمية لـ"${label}"`)
      if (!(Number(i.costPerUnit) > 0)) return toast.error(`اكتب سعر الوحدة لـ"${label}" — السعر لا يمكن أن يكون صفر`)
    }
    const validItems = filled
    setSaving(true)
    try {
      const payload = {
        supplierName: supplier,
        paymentMethod,
        paidFromCashBalance: paidFromCash,
        notes,
        items: validItems.map(it => {
          if (isNew(it)) {
            return {
              newIngredientName: it.newName.trim(),
              ingredientNameSnapshot: it.newName.trim(),
              quantity: Number(it.quantity),
              unitType: it.newUnit || 'kg',
              costPerUnit: Number(it.costPerUnit),
              totalCost: Number(it.quantity) * Number(it.costPerUnit),
            }
          }
          const ing = ingredients.find(x => x._id === it.ingredientId)
          return {
            ingredientId: it.ingredientId,
            ingredientNameSnapshot: ing?.name || '',
            quantity: Number(it.quantity),
            unitType: ing?.unitType || 'gram',
            costPerUnit: Number(it.costPerUnit),
            totalCost: Number(it.quantity) * Number(it.costPerUnit),
          }
        }),
        totalPurchaseCost: totalCost,
      }
      if (editingId) {
        const r = await purchasesAPI.update(editingId, payload)
        toast.success(r.data.message || 'تم تعديل عملية الشراء')
      } else {
        await purchasesAPI.create(payload)
        toast.success('تم تسجيل المشتريات بنجاح')
      }
      setModal(false)
      load()
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setSaving(false) }
  }

  const remove = async (purchase) => {
    const paid = purchase.paidFromCashBalance
      ? `\nسيرجع ${formatCurrency(purchase.totalPurchaseCost)} للصندوق`
      : ''
    if (!confirm(`حذف عملية الشراء من "${purchase.supplierName}"؟\nسترجع الكميات من المخزون.${paid}`)) return
    try {
      const r = await purchasesAPI.remove(purchase._id)
      toast.success(r.data.message)
      load()
    } catch (e) { toast.error(e.message || 'تعذّر الحذف') }
  }

  const columns = [
    { key: 'supplierName', label: 'المورد', render: v => <span className="font-black text-brand-dark">{v}</span> },
    {
      key: 'items', label: 'المواد المشتراة',
      render: (items) => (
        <div className="space-y-1 min-w-[160px]">
          {(items || []).map((it, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="font-black text-brand-dark">{it.ingredientNameSnapshot}</span>
              <span className="text-brand-gray font-medium">
                {it.quantity} {UNIT_LABELS[it.unitType] || it.unitType}
              </span>
              <span className="text-fuchsia font-bold">({formatCurrency(it.totalCost)})</span>
            </div>
          ))}
        </div>
      ),
    },
    { key: 'totalPurchaseCost', label: 'الإجمالي', render: v => <span className="font-black text-fuchsia">{formatCurrency(v)}</span> },
    { key: 'paymentMethod', label: 'طريقة الدفع', render: v => ({ cash: 'كاش', bank: 'بنك', other: 'أخرى' }[v] || v) },
    { key: 'paidFromCashBalance', label: 'من الكاش', render: v => v ? <Check size={16} className="text-green-600" /> : <XIcon size={16} className="text-red-400" /> },
    { key: 'purchaseDate', label: 'التاريخ', render: v => formatDate(v) },
    { key: 'notes', label: 'ملاحظات', render: v => v || '—' },
    { key: '_id', label: '', render: (v, r) => isAdmin ? (
      <div className="flex gap-1.5">
        <button onClick={() => openEdit(r)}
          className="text-xs bg-blue-50 text-blue-500 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition-colors flex items-center gap-1.5">
          <Pencil size={13} /> تعديل
        </button>
        <button onClick={() => remove(r)}
          className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center gap-1.5">
          <Trash2 size={13} /> حذف
        </button>
      </div>
    ) : null },
  ]

  return (
    <div>
      <PageHeader
        title="المشتريات"
        subtitle="تسجيل شراء المواد الخام"
        actions={<Button onClick={openModal}>+ تسجيل مشتريات</Button>}
      />

      <div className="bg-white rounded-2xl shadow-card p-4">
        <DataTable columns={columns} data={purchases} loading={loading}
          emptyIcon={ShoppingCart} emptyTitle="لا توجد مشتريات" />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={<span className="flex items-center gap-2"><ShoppingCart size={18} /> {editingId ? 'تعديل عملية الشراء' : 'تسجيل مشتريات جديدة'}</span>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">اسم المورد *</label>
              <input value={supplier} onChange={e => setSupplier(e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
                placeholder="محل أبو خالد..." />
            </div>
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">طريقة الدفع</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                <option value="cash">كاش</option>
                <option value="bank">تحويل بنكي</option>
                <option value="other">أخرى</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1 block">المواد المشتراة</label>
            <p className="text-xs text-brand-gray font-bold mb-3">اختر المكوّن، أو «+ مكوّن جديد» إذا أول مرة بتشتريه — بينضاف لحاله للمكوّنات، والكمية بتنزل عالمخزون مباشرة.</p>
            <div className="space-y-2">
              {items.map((it, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-5 space-y-1.5">
                    <select value={it.ingredientId} onChange={e => updateItem(i, 'ingredientId', e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white text-sm">
                      <option value="">اختر مكوناً</option>
                      <option value={NEW_ING}>+ مكوّن جديد…</option>
                      {ingredients.map(x => <option key={x._id} value={x._id}>{x.name} ({UNIT_LABELS[x.unitType] || x.unitType})</option>)}
                    </select>
                    {it.ingredientId === NEW_ING && (
                      <div className="flex gap-1.5">
                        <input autoFocus value={it.newName || ''} onChange={e => updateItem(i, 'newName', e.target.value)}
                          placeholder="اسم المكوّن الجديد"
                          className="flex-1 min-w-0 px-3 py-2 border-2 border-fuchsia/40 rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                        <select value={it.newUnit || 'kg'} onChange={e => updateItem(i, 'newUnit', e.target.value)}
                          className="w-20 px-2 py-2 border-2 border-fuchsia/40 rounded-xl font-bold bg-white text-sm">
                          {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="col-span-3">
                    <label className="text-[11px] font-black text-brand-gray mb-1 block">الكمية {unitLabel(it)}</label>
                    <ThousandsInput allowDecimal placeholder="0" value={it.quantity} onChange={v => updateItem(i, 'quantity', v)}
                      className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[11px] font-black text-brand-gray mb-1 block">سعر {unitLabel(it) || 'الوحدة'}</label>
                    <ThousandsInput placeholder="0" value={it.costPerUnit} onChange={v => updateItem(i, 'costPerUnit', v)}
                      className={`w-full px-3 py-2.5 border-2 rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm ${
                        Number(it.costPerUnit) > 0 ? 'border-brand-border' : 'border-amber-300 bg-amber-50'
                      }`} />
                  </div>
                  <div className="col-span-1 pt-5">
                    <button onClick={() => removeItem(i)} disabled={items.length === 1}
                      className="w-9 h-9 rounded-xl bg-red-50 text-red-500 font-bold disabled:opacity-30 flex items-center justify-center"><XIcon size={15} /></button>
                  </div>
                  {Number(it.quantity) > 0 && Number(it.costPerUnit) > 0 && (
                    <div className="col-span-12 -mt-1 text-[11px] font-black text-brand-gray text-left">
                      إجمالي السطر: <span className="text-fuchsia">{formatCurrency(Number(it.quantity) * Number(it.costPerUnit))}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
            <button onClick={addItem} className="mt-2 text-sm text-fuchsia font-bold hover:underline">+ إضافة عنصر</button>
          </div>

          <div className="bg-brand-bg rounded-xl p-4 flex justify-between items-center">
            <span className="font-black text-brand-dark">الإجمالي</span>
            <span className="font-black text-fuchsia text-lg">{formatCurrency(totalCost)}</span>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={paidFromCash} onChange={e => setPaidFromCash(e.target.checked)} className="w-5 h-5 accent-fuchsia" />
            <span className="font-bold text-sm text-brand-dark">خصم من رصيد الكاش</span>
          </label>

          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">ملاحظات</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold resize-none" />
          </div>

          <div className="flex gap-3">
            <Button onClick={save} loading={saving} className="flex-1">{editingId ? 'حفظ التعديل' : 'تسجيل الشراء'}</Button>
            <Button variant="outline" onClick={() => setModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
