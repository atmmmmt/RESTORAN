import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Loader2, ClipboardList, X, DollarSign, PieChart, Salad,
  Flame, Beef, Wheat, Droplet, Cookie, Candy, Leaf, TestTube2, Sparkles,
} from 'lucide-react'
import { productsAPI, ingredientsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import ImageUpload from '../../components/common/ImageUpload'
import { formatCurrency } from '../../utils/formatters'
import toast from 'react-hot-toast'
import VirtualTryOnSection from '../../features/virtual-try-on/admin/VirtualTryOnSection'

const CATEGORIES = ['باستا', 'رز', 'حساء', 'سلطة', 'مشويات', 'حلويات', 'مشروبات', 'أخرى']
const UNITS = { gram: 'غم', kg: 'كغ', ml: 'مل', liter: 'لتر', piece: 'قطعة' }

export default function ProductFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [ingredients, setIngredients] = useState([])
  const [form, setForm] = useState({
    name: '', description: '', category: 'باستا', image: '', imagePublicId: null,
    directPrice: '', regularCenterPrice: '', specializedCenterDefaultCommissionPercent: 20,
    costMode: 'direct', directCost: '', packagingCost: 150, extraCost: 0, availableQuantity: 0,
    status: 'available', showInTodayMenu: true, allergyNotes: '', notes: '',
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, saturatedFat: 0, sugars: 0, sodium: 0, fiber: 0, portionSize: '', basis: 'estimated', confidence: 'medium', source: '' },
    ingredients: [],
    modifiers: [],
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ingredientsAPI.getAll().then(r => setIngredients(r.data.ingredients || []))
    if (isEdit) {
      setLoading(true)
      productsAPI.getById(id).then(r => {
        const p = r.data.product
        setForm({
          name: p.name, description: p.description || '', category: p.category || 'باستا',
          image: p.image || '', imagePublicId: p.imagePublicId || null,
          directPrice: p.directPrice, regularCenterPrice: p.regularCenterPrice,
          specializedCenterDefaultCommissionPercent: p.specializedCenterDefaultCommissionPercent || 20,
          costMode: p.costMode || (p.ingredients?.length ? 'recipe' : 'direct'),
          directCost: p.directCost ?? p.calculatedCost ?? 0,
          packagingCost: p.packagingCost || 150, extraCost: p.extraCost || 0,
          availableQuantity: p.availableQuantity || 0, status: p.status, showInTodayMenu: p.showInTodayMenu,
          allergyNotes: p.allergyNotes || '', notes: p.notes || '',
          nutrition: {
            calories: p.nutrition?.calories || 0, protein: p.nutrition?.protein || 0,
            carbs: p.nutrition?.carbs || 0, fat: p.nutrition?.fat || 0,
            saturatedFat: p.nutrition?.saturatedFat || 0, sugars: p.nutrition?.sugars || 0,
            sodium: p.nutrition?.sodium || 0, fiber: p.nutrition?.fiber || 0,
            portionSize: p.nutrition?.portionSize || '', basis: p.nutrition?.basis || 'estimated',
            confidence: p.nutrition?.confidence || 'medium', source: p.nutrition?.source || '',
          },
          ingredients: p.ingredients?.map(ing => ({
            ingredientId: ing.ingredientId?._id || ing.ingredientId,
            ingredientNameSnapshot: ing.ingredientNameSnapshot,
            quantityUsed: ing.quantityUsed,
            unitType: ing.unitType,
          })) || [],
          modifiers: p.modifiers?.map(m => ({
            _id: m._id, name: m.name, priceDelta: m.priceDelta || 0,
            costDelta: m.costDelta || 0, isActive: m.isActive !== false,
          })) || [],
        })
      }).finally(() => setLoading(false))
    }
  }, [id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addIngredient = () => {
    if (!ingredients.length) return
    setForm(f => ({
      ...f,
      ingredients: [...f.ingredients, { ingredientId: ingredients[0]._id, ingredientNameSnapshot: ingredients[0].name, quantityUsed: 100, unitType: ingredients[0].unitType }],
    }))
  }

  const removeIngredient = (i) => setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, idx) => idx !== i) }))

  const addModifier = () => setForm(f => ({
    ...f, modifiers: [...f.modifiers, { name: '', priceDelta: 0, costDelta: 0, isActive: true }],
  }))
  const removeModifier = (i) => setForm(f => ({ ...f, modifiers: f.modifiers.filter((_, idx) => idx !== i) }))
  const updateModifier = (i, k, v) => setForm(f => {
    const mods = [...f.modifiers]
    mods[i] = { ...mods[i], [k]: v }
    return { ...f, modifiers: mods }
  })

  const updateIngredient = (i, k, v) => {
    setForm(f => {
      const ings = [...f.ingredients]
      ings[i] = { ...ings[i], [k]: v }
      if (k === 'ingredientId') {
        const found = ingredients.find(x => x._id === v)
        if (found) { ings[i].ingredientNameSnapshot = found.name; ings[i].unitType = found.unitType }
      }
      return { ...f, ingredients: ings }
    })
  }

  /* ── Live cost & nutrition from selected ingredients ── */
  const calcCost = () => {
    if (form.costMode === 'direct') return Math.max(Number(form.directCost) || 0, 0)
    const ingCost = form.ingredients.reduce((sum, ing) => {
      const found = ingredients.find(i => i._id === ing.ingredientId)
      return sum + (found ? found.averageCostPerUnit * ing.quantityUsed : 0)
    }, 0)
    return ingCost + Number(form.packagingCost) + Number(form.extraCost)
  }

  const calcNutrition = () => {
    if (form.ingredients.length === 0) return form.nutrition
    let calories = 0, protein = 0, carbs = 0, fat = 0
    for (const ing of form.ingredients) {
      const found = ingredients.find(i => i._id === ing.ingredientId)
      const n = found?.nutritionPerUnit
      if (n) {
        const qty = ing.quantityUsed || 0
        calories += (n.calories || 0) * qty
        protein  += (n.protein  || 0) * qty
        carbs    += (n.carbs    || 0) * qty
        fat      += (n.fat      || 0) * qty
      }
    }
    return {
      calories: Math.round(calories),
      protein:  Math.round(protein  * 10) / 10,
      carbs:    Math.round(carbs    * 10) / 10,
      fat:      Math.round(fat      * 10) / 10,
    }
  }

  /* Build ingredient list with cost + nutrition snapshots for the backend */
  const buildIngredients = () => form.ingredients.map(ing => {
    const found = ingredients.find(i => i._id === ing.ingredientId)
    const n = found?.nutritionPerUnit
    return {
      ...ing,
      costSnapshot: found ? found.averageCostPerUnit * ing.quantityUsed : 0,
      nutritionSnapshot: n ? {
        calories: (n.calories || 0) * ing.quantityUsed,
        protein:  (n.protein  || 0) * ing.quantityUsed,
        carbs:    (n.carbs    || 0) * ing.quantityUsed,
        fat:      (n.fat      || 0) * ing.quantityUsed,
      } : { calories: 0, protein: 0, carbs: 0, fat: 0 },
    }
  })

  const save = async () => {
    if (!form.name || !form.directPrice) return toast.error('الاسم والسعر مطلوبان')
    setSaving(true)
    try {
      const payload = { ...form, ingredients: buildIngredients(), modifiers: form.modifiers.filter(m => m.name.trim()) }
      if (isEdit) { await productsAPI.update(id, payload); toast.success('تم تحديث المنتج') }
      else { await productsAPI.create(payload); toast.success('تم إنشاء المنتج') }
      navigate('/admin/products')
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setSaving(false) }
  }

  const estimatedCost = calcCost()
  const profit        = form.directPrice ? form.directPrice - estimatedCost : 0
  const nutrition     = calcNutrition()

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={32} className="animate-spin text-fuchsia" />
    </div>
  )

  return (
    <div>
      <PageHeader
        title={isEdit ? 'تعديل منتج' : 'منتج جديد'}
        breadcrumb="المنتجات"
        actions={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate('/admin/products')}>إلغاء</Button>
            <Button onClick={save} loading={saving}>حفظ المنتج</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Basic info */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h2 className="font-black text-brand-dark mb-4">معلومات أساسية</h2>
            <div className="space-y-4">
              {/* Image upload */}
              <ImageUpload
                value={form.image}
                publicId={form.imagePublicId}
                onChange={(url, publicId) => setForm(f => ({ ...f, image: url || '', imagePublicId: publicId }))}
                onDelete={() => setForm(f => ({ ...f, image: '', imagePublicId: null }))}
              />

              <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">اسم المنتج *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
                    placeholder="مثال: لازانيا دجاج" />
              </div>
              <div>
                <label className="text-sm font-bold text-brand-dark mb-1.5 block">الوصف</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
                  className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">التصنيف</label>
                  <select value={form.category} onChange={e => set('category', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold text-brand-dark mb-1.5 block">الحالة</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                    <option value="available">متاح</option>
                    <option value="hidden">مخفي</option>
                    <option value="sold_out">نفدت</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Ingredients — advanced mode only. Day-to-day entry uses one direct cost. */}
          {form.costMode === 'recipe' && <div className="bg-white rounded-2xl shadow-card p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-black text-brand-dark flex items-center gap-2"><ClipboardList size={18} className="text-brand-gray-light" /> المكونات والوصفة</h2>
              <button onClick={addIngredient}
                className="text-sm bg-fuchsia-bg text-fuchsia px-4 py-2 rounded-xl font-bold hover:bg-fuchsia-light transition-colors">
                + إضافة مكون
              </button>
            </div>
            <p className="text-xs text-brand-gray font-medium mb-4">
              المكون مش موجود؟{' '}
              <a href="/admin/ingredients" target="_blank" rel="noopener noreferrer"
                className="text-fuchsia font-bold underline underline-offset-2 hover:text-fuchsia-dark">
                أضفه من صفحة المكونات ←
              </a>
              {' '}ثم ارجعي هون وأضيفيه
            </p>
            <div className="space-y-3">
              {form.ingredients.map((ing, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="grid grid-cols-12 gap-2 items-center p-3 bg-brand-bg rounded-xl">
                  <div className="col-span-5">
                    <select value={ing.ingredientId} onChange={e => updateIngredient(i, 'ingredientId', e.target.value)}
                      className="w-full px-3 py-2 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white text-sm">
                      {ingredients.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input type="number" value={ing.quantityUsed} onChange={e => updateIngredient(i, 'quantityUsed', Number(e.target.value))}
                      className="w-full px-3 py-2 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                  </div>
                  <div className="col-span-2 text-center text-sm text-brand-gray font-bold">{UNITS[ing.unitType] || ing.unitType}</div>
                  <div className="col-span-2 flex justify-end">
                    <button onClick={() => removeIngredient(i)} className="w-8 h-8 rounded-xl bg-red-50 text-red-500 font-bold hover:bg-red-100 transition-colors flex items-center justify-center"><X size={15} /></button>
                  </div>
                </motion.div>
              ))}
              {form.ingredients.length === 0 && (
                <div className="text-center py-6 text-brand-gray font-bold text-sm">لا توجد مكونات — اضغط "+ إضافة مكون"</div>
              )}
            </div>
          </div>}

          {/* Modifiers — selectable extras/reductions the cashier picks per order line,
              e.g. "Extra لحمة" (+) or "لحمة أقل" (−), so one product covers every variant
              instead of duplicating it under a different name. */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-black text-brand-dark flex items-center gap-2"><Sparkles size={18} className="text-brand-gray-light" /> الإضافات والتعديلات</h2>
              <button onClick={addModifier}
                className="text-sm bg-fuchsia-bg text-fuchsia px-4 py-2 rounded-xl font-bold hover:bg-fuchsia-light transition-colors">
                + إضافة خيار
              </button>
            </div>
            <p className="text-xs text-brand-gray font-medium mb-4">
              مثال: "Extra لحمة" بسعر إضافي، أو "لحمة أقل" بسعر أقل — تظهر للكاشير عند البيع ويختار منها.
            </p>
            <div className="space-y-3">
              {form.modifiers.map((mod, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="grid grid-cols-12 gap-2 items-center p-3 bg-brand-bg rounded-xl">
                  <div className="col-span-5">
                    <input value={mod.name} onChange={e => updateModifier(i, 'name', e.target.value)}
                      placeholder="اسم الخيار (مثال: Extra لحمة)"
                      className="w-full px-3 py-2 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm bg-white" />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[10px] font-bold text-brand-gray block mb-0.5">فرق السعر</label>
                    <input type="number" value={mod.priceDelta}
                      onChange={e => updateModifier(i, 'priceDelta', Number(e.target.value))}
                      className="w-full px-3 py-2 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[10px] font-bold text-brand-gray block mb-0.5">فرق التكلفة</label>
                    <input type="number" value={mod.costDelta}
                      onChange={e => updateModifier(i, 'costDelta', Number(e.target.value))}
                      className="w-full px-3 py-2 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => removeModifier(i)} className="w-8 h-8 rounded-xl bg-red-50 text-red-500 font-bold hover:bg-red-100 transition-colors flex items-center justify-center"><X size={15} /></button>
                  </div>
                </motion.div>
              ))}
              {form.modifiers.length === 0 && (
                <div className="text-center py-6 text-brand-gray font-bold text-sm">لا توجد إضافات — هذا الصنف يُباع بسعره الأساسي فقط</div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Pricing */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <h2 className="font-black text-brand-dark mb-4 flex items-center gap-2"><DollarSign size={18} className="text-brand-gray-light" /> التسعير</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-brand-gray mb-1 block">سعر البيع المباشر</label>
                <input type="number" value={form.directPrice} onChange={e => set('directPrice', Number(e.target.value))}
                  className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
              </div>

              <div className="rounded-2xl bg-brand-bg p-3">
                <div className="text-xs font-black text-brand-dark mb-2">طريقة حساب الكلفة</div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => set('costMode','direct')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-black transition-all ${form.costMode === 'direct' ? 'bg-fuchsia text-white' : 'bg-white text-brand-gray border border-brand-border'}`}>
                    كلفة مباشرة
                  </button>
                  <button type="button" onClick={() => set('costMode','recipe')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-black transition-all ${form.costMode === 'recipe' ? 'bg-fuchsia text-white' : 'bg-white text-brand-gray border border-brand-border'}`}>
                    متقدم بالمكونات
                  </button>
                </div>
              </div>

              {form.costMode === 'direct' ? (
                <div>
                  <label className="text-xs font-bold text-brand-gray mb-1 block">كلفة المنتج كاملة</label>
                  <input type="number" min="0" value={form.directCost} onChange={e => set('directCost', Number(e.target.value))}
                    placeholder="مثال: 25000"
                    className="w-full px-3 py-2.5 border-2 border-fuchsia/30 rounded-xl focus:border-fuchsia focus:outline-none font-black text-sm bg-fuchsia-bg/30" />
                  <p className="text-[11px] text-brand-gray mt-1 font-bold">اكتب الكلفة النهائية للصنف وخلاص — بدون مواد أو غرامات.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-bold text-brand-gray mb-1 block">تكلفة التغليف</label>
                    <input type="number" value={form.packagingCost} onChange={e => set('packagingCost', Number(e.target.value))}
                      className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-brand-gray mb-1 block">تكاليف إضافية</label>
                    <input type="number" value={form.extraCost} onChange={e => set('extraCost', Number(e.target.value))}
                      className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-bold text-brand-gray mb-1 block">سعر المراكز العادية</label>
                <input type="number" value={form.regularCenterPrice} onChange={e => set('regularCenterPrice', Number(e.target.value))}
                  className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
              </div>

              <div>
                <label className="text-xs font-bold text-brand-gray mb-1 block">عمولة المراكز المتخصصة (%)</label>
                <input type="number" value={form.specializedCenterDefaultCommissionPercent}
                  onChange={e => set('specializedCenterDefaultCommissionPercent', Number(e.target.value))}
                  className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
              </div>
            </div>
          </div>

          {/* Cost summary */}
          <div className="bg-gradient-to-br from-fuchsia-bg to-brand-offwhite rounded-2xl p-5">
            <h2 className="font-black text-brand-dark mb-4 flex items-center gap-2"><PieChart size={18} className="text-brand-gray-light" /> ملخص التكلفة</h2>
            <div className="space-y-2">
              {form.costMode === 'recipe' ? <>
                <div className="flex justify-between text-sm"><span className="text-brand-gray font-bold">تكلفة المكونات</span><span className="font-black text-brand-dark">{formatCurrency(estimatedCost - Number(form.packagingCost) - Number(form.extraCost))}</span></div>
                <div className="flex justify-between text-sm"><span className="text-brand-gray font-bold">التغليف</span><span className="font-black text-brand-dark">{formatCurrency(form.packagingCost)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-brand-gray font-bold">أخرى</span><span className="font-black text-brand-dark">{formatCurrency(form.extraCost)}</span></div>
                <div className="h-px bg-brand-border my-2" />
              </> : (
                <div className="rounded-xl bg-white/70 p-3 text-xs font-bold text-brand-gray">الكلفة مدخلة مباشرة — بدون تفصيل مكونات.</div>
              )}
              <div className="flex justify-between"><span className="font-black text-brand-dark">إجمالي التكلفة</span><span className="font-black text-fuchsia">{formatCurrency(estimatedCost)}</span></div>
              <div className="flex justify-between"><span className="font-black text-brand-dark">الربح المتوقع</span>
                <span className={`font-black ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(profit)}</span>
              </div>
            </div>
          </div>

          {/* Nutrition summary is useful only in advanced recipe mode. */}
          {form.costMode === 'recipe' && <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-100">
            <h2 className="font-black text-brand-dark mb-1 flex items-center gap-2">
              <Salad size={18} className="text-green-600" /> القيمة الغذائية
            </h2>
            <p className="text-xs text-brand-gray font-medium mb-4">
              محسوبة تلقائياً من المكونات
            </p>
            <div className="space-y-2.5">
                <div className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 text-xs font-bold">
                  <span className="text-brand-gray">حجم الحصة</span>
                  <span className="text-brand-dark">{nutrition.portionSize || 'غير محدد'}</span>
                </div>
                {[
                  { icon: Flame, label: 'سعرات حرارية', val: nutrition.calories, unit: 'kcal', color: 'text-orange-500' },
                  { icon: Beef, label: 'بروتين',        val: nutrition.protein,  unit: 'غ',    color: 'text-red-500' },
                  { icon: Wheat, label: 'كربوهيدرات',    val: nutrition.carbs,    unit: 'غ',    color: 'text-amber-600' },
                  { icon: Droplet, label: 'دهون',           val: nutrition.fat,      unit: 'غ',    color: 'text-yellow-600' },
                  { icon: Cookie, label: 'دهون مشبعة',     val: nutrition.saturatedFat, unit: 'غ', color: 'text-amber-700' },
                  { icon: Candy, label: 'سكريات',          val: nutrition.sugars, unit: 'غ', color: 'text-pink-600' },
                  { icon: Leaf, label: 'ألياف',           val: nutrition.fiber, unit: 'غ', color: 'text-green-700' },
                  { icon: TestTube2, label: 'صوديوم',          val: nutrition.sodium, unit: 'ملغ', color: 'text-blue-600' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2">
                    <span className="text-sm font-bold text-brand-gray flex items-center gap-1.5">
                      <row.icon size={14} className={row.color} /> {row.label}
                    </span>
                    <span className={`font-black text-sm ${row.color}`}>
                      {row.val} {row.unit}
                    </span>
                  </div>
                ))}
                <div className={`rounded-xl px-3 py-2 text-xs font-bold ${nutrition.basis === 'estimated' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                  {nutrition.basis === 'estimated' ? 'تقدير غذائي حسب الحصة' : 'محسوبة من وصفة المكونات'}
                  {nutrition.source && <div className="mt-1 font-medium opacity-75">{nutrition.source}</div>}
                </div>
              </div>
          </div>}

          {/* Settings */}
          <div className="bg-white rounded-2xl shadow-card p-5">
            <h2 className="font-black text-brand-dark mb-4">إعدادات</h2>
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-sm font-bold text-brand-dark">ظاهر في منيو اليوم</span>
                <button onClick={() => set('showInTodayMenu', !form.showInTodayMenu)}
                  className={`w-11 h-6 rounded-full transition-all relative ${form.showInTodayMenu ? 'bg-fuchsia' : 'bg-gray-200'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.showInTodayMenu ? 'right-1' : 'left-1'}`} />
                </button>
              </label>
              <div>
                <label className="text-xs font-bold text-brand-gray mb-1 block">الكمية المتاحة</label>
                <input type="number" value={form.availableQuantity} onChange={e => set('availableQuantity', Number(e.target.value))}
                  className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WebAR Product Virtual Try-On — saves through its own endpoints,
          so it is independent of this form's submit. */}
      <div className="mt-6">
        <VirtualTryOnSection productId={id} productName={form.name} />
      </div>
    </div>
  )
}
