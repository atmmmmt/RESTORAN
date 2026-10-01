import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { purchasesAPI, ingredientsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import DataTable from '../../components/common/DataTable'
import { formatCurrency, formatDate } from '../../utils/formatters'
import toast from 'react-hot-toast'

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

  const totalCost = items.reduce((s, it) => s + (Number(it.quantity) * Number(it.costPerUnit)), 0)

  const openModal = () => {
    setSupplier(''); setPaymentMethod('cash'); setPaidFromCash(true); setNotes('')
    setItems([{ ingredientId: ingredients[0]?._id || '', quantity: 1, costPerUnit: 0 }])
    setModal(true)
  }

  const save = async () => {
    if (!supplier) return toast.error('اسم المورد مطلوب')
    const validItems = items.filter(i => i.ingredientId && i.quantity > 0 && i.costPerUnit > 0)
    if (!validItems.length) return toast.error('أضف عنصراً واحداً على الأقل')
    setSaving(true)
    try {
      const payload = {
        supplierName: supplier,
        paymentMethod,
        paidFromCashBalance: paidFromCash,
        notes,
        items: validItems.map(it => {
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
      await purchasesAPI.create(payload)
      toast.success('تم تسجيل المشتريات بنجاح')
      setModal(false)
      load()
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setSaving(false) }
  }

  const UNIT_LABELS = { gram: 'غم', kg: 'كغ', ml: 'مل', liter: 'لتر', piece: 'قطعة' }

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
    { key: 'paidFromCashBalance', label: 'من الكاش', render: v => v ? '✅' : '❌' },
    { key: 'purchaseDate', label: 'التاريخ', render: v => formatDate(v) },
    { key: 'notes', label: 'ملاحظات', render: v => v || '—' },
  ]

  return (
    <div>
      <PageHeader
        title="المشتريات 🛒"
        subtitle="تسجيل شراء المواد الخام"
        actions={<Button onClick={openModal}>+ تسجيل مشتريات</Button>}
      />

      <div className="bg-white rounded-2xl shadow-card p-4">
        <DataTable columns={columns} data={purchases} loading={loading}
          emptyIcon="🛒" emptyTitle="لا توجد مشتريات" />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="تسجيل مشتريات جديدة 🛒">
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
            <label className="text-sm font-bold text-brand-dark mb-3 block">المواد المشتراة</label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <select value={it.ingredientId} onChange={e => updateItem(i, 'ingredientId', e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white text-sm">
                      <option value="">اختر مكوناً</option>
                      {ingredients.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input type="number" placeholder="الكمية" value={it.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                  </div>
                  <div className="col-span-3">
                    <input type="number" placeholder="سعر الوحدة" value={it.costPerUnit} onChange={e => updateItem(i, 'costPerUnit', e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                  </div>
                  <div className="col-span-1">
                    <button onClick={() => removeItem(i)} disabled={items.length === 1}
                      className="w-9 h-9 rounded-xl bg-red-50 text-red-500 font-bold disabled:opacity-30">✕</button>
                  </div>
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
            <Button onClick={save} loading={saving} className="flex-1">تسجيل الشراء</Button>
            <Button variant="outline" onClick={() => setModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
