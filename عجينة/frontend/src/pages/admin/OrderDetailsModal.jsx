import { useEffect, useMemo, useState } from 'react'
import { Edit3, Eye, Plus, Save, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/common/Modal'
import { internalOrdersAPI, ordersAPI, productsAPI } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'

const ORDER_TYPES = {
  takeaway: 'سفري',
  dine_in: 'داخلي / بالمحل',
  delivery: 'توصيل',
}
const PAYMENTS = { cash: 'نقداً', card: 'بطاقة', unpaid: 'آجل' }
const DELIVERY = { delivery: 'توصيل', pickup: 'استلام من المحل' }
const idOf = value => typeof value === 'object' && value ? String(value._id || '') : String(value || '')
const dateTime = value => value ? new Date(value).toLocaleString('ar-SY') : '—'

function Field({ label, children }) {
  return <div>
    <label className="text-xs font-black text-brand-gray block mb-1.5">{label}</label>
    {children}
  </div>
}
const inputCls = 'w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold text-sm focus:border-fuchsia focus:outline-none bg-white'

export default function OrderDetailsModal({ open, order, kind = 'site', onClose, onSaved, canEdit = true }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState([])
  const [addProductId, setAddProductId] = useState('')
  const [form, setForm] = useState(null)

  const isInternal = kind === 'cashier'
  const locked = order?.status === 'cancelled'

  useEffect(() => {
    if (!open || !order) return
    setEditing(false)
    setAddProductId('')
    if (isInternal) {
      setForm({
        customerName: order.customerName || '',
        customerPhone: order.customerPhone || '',
        orderType: order.orderType || 'takeaway',
        paymentMethod: order.paymentMethod || 'cash',
        notes: order.notes || '',
        discount: Number(order.discount || 0),
        discountType: order.discountType || 'amount',
        discountPercent: Number(order.discountPercent || 0),
        discountReason: order.discountReason || '',
        fulfillmentType: order.fulfillmentType || 'asap',
        scheduledFor: order.scheduledFor ? new Date(order.scheduledFor).toISOString().slice(0,16) : '',
        items: (order.items || []).map((item, index) => ({
          key: `${idOf(item.productId)}-${index}`,
          productId: idOf(item.productId),
          name: item.name || '',
          quantity: Number(item.quantity || 1),
          notes: item.notes || '',
          modifiers: item.modifiers || [],
        })),
      })
    } else {
      setForm({
        productId: idOf(order.productId),
        quantity: Number(order.quantity || 1),
        customerName: order.customerName || '',
        customerPhone: order.phone || order.customerPhone || '',
        deliveryLocation: order.location || order.deliveryLocation || '',
        deliveryMethod: order.deliveryMethod || 'delivery',
        notes: order.notes || '',
      })
    }

    productsAPI.getAll()
      .then(r => setProducts(r.data.products || []))
      .catch(() => setProducts([]))
  }, [open, order, isInternal])

  const selectedProduct = useMemo(
    () => !isInternal && form ? products.find(p => String(p._id) === String(form.productId)) : null,
    [products, form, isInternal]
  )

  if (!order || !form) return null

  const updateLine = (index, patch) => {
    setForm(current => ({
      ...current,
      items: current.items.map((line, i) => i === index ? { ...line, ...patch } : line),
    }))
  }

  const removeLine = index => {
    if (form.items.length <= 1) return toast.error('لازم يبقى صنف واحد على الأقل')
    setForm(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))
  }

  const addLine = () => {
    const product = products.find(p => String(p._id) === String(addProductId))
    if (!product) return
    const existing = form.items.findIndex(line => String(line.productId) === String(product._id))
    if (existing >= 0) {
      updateLine(existing, { quantity: form.items[existing].quantity + 1 })
    } else {
      setForm(current => ({
        ...current,
        items: [...current.items, {
          key: `${product._id}-new-${Date.now()}`,
          productId: product._id,
          name: product.name,
          quantity: 1,
          notes: '',
          modifiers: [],
        }],
      }))
    }
    setAddProductId('')
  }

  const save = async () => {
    setSaving(true)
    try {
      let response
      if (isInternal) {
        response = await internalOrdersAPI.update(order._id, {
          items: form.items.map(line => ({
            productId: line.productId,
            quantity: Number(line.quantity),
            notes: line.notes || '',
          })),
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          orderType: form.orderType,
          paymentMethod: form.paymentMethod,
          notes: form.notes,
          discount: Number(form.discount || 0),
          discountType: form.discountType,
          discountPercent: Number(form.discountPercent || 0),
          discountReason: form.discountReason || '',
          fulfillmentType: form.fulfillmentType,
          scheduledFor: form.fulfillmentType === 'scheduled' ? form.scheduledFor : null,
        })
      } else {
        response = await ordersAPI.update(order._id, {
          productId: form.productId,
          quantity: Number(form.quantity),
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          deliveryLocation: form.deliveryLocation,
          deliveryMethod: form.deliveryMethod,
          notes: form.notes,
        })
      }
      toast.success(response.data.message || 'تم تعديل الطلب')
      setEditing(false)
      onSaved?.(response.data.order)
      onClose?.()
    } catch (e) {
      toast.error(e.message || 'تعذّر تعديل الطلب')
    } finally {
      setSaving(false)
    }
  }

  const financeRows = [
    ['قيمة المأكولات والمشروبات', order.netAmount],
    ['إنفاق استهلاكي (5%)', order.consumptionTaxAmount],
    ['إدارة محلية (5%)', order.localAdminAmount],
    ['الإجمالي', isInternal ? order.total : (order.totalPrice || order.totalAmount)],
  ]

  return <Modal open={open} onClose={onClose} title={isInternal ? `الطلب ${order.orderNumber || ''}` : 'تفاصيل الطلب'} size="lg">
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-brand-gray font-bold">تاريخ الطلب</div>
          <div className="font-black text-brand-dark mt-1">{dateTime(order.createdAt)}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-brand-bg text-brand-dark text-xs font-black">{order.status}</span>
          {canEdit && !locked && !editing && (
            <button onClick={() => setEditing(true)}
              className="px-4 py-2 rounded-xl bg-fuchsia text-white font-black text-sm flex items-center gap-2">
              <Edit3 size={15}/> تعديل الطلب
            </button>
          )}
          {editing && (
            <button onClick={() => setEditing(false)}
              className="px-3 py-2 rounded-xl bg-brand-bg text-brand-gray font-black text-sm flex items-center gap-1">
              <X size={14}/> إلغاء التعديل
            </button>
          )}
        </div>
      </div>

      {locked && <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm font-bold">
        الطلب ملغى، لذلك التفاصيل متاحة للعرض فقط. أعد تفعيله أولاً إذا بدك تعدله.
      </div>}

      {!editing ? (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-brand-bg p-4">
              <div className="text-xs font-black text-brand-gray mb-3">بيانات العميل</div>
              <div className="space-y-2 text-sm">
                <div><span className="text-brand-gray">الاسم:</span> <strong>{order.customerName || '—'}</strong></div>
                <div><span className="text-brand-gray">الهاتف:</span> <strong dir="ltr">{order.customerPhone || order.phone || '—'}</strong></div>
                {!isInternal && <div><span className="text-brand-gray">الموقع:</span> <strong>{order.location || '—'}</strong></div>}
              </div>
            </div>
            <div className="rounded-2xl bg-brand-bg p-4">
              <div className="text-xs font-black text-brand-gray mb-3">تفاصيل التشغيل</div>
              <div className="space-y-2 text-sm">
                {isInternal ? <>
                  <div><span className="text-brand-gray">نوع الطلب:</span> <strong>{ORDER_TYPES[order.orderType] || order.orderType}</strong></div>
                  <div><span className="text-brand-gray">الدفع:</span> <strong>{PAYMENTS[order.paymentMethod] || order.paymentMethod}</strong></div>
                  <div><span className="text-brand-gray">الموعد:</span> <strong>{order.fulfillmentType === 'scheduled' ? dateTime(order.scheduledFor) : 'بأسرع وقت'}</strong></div>
                </> : (
                  <div><span className="text-brand-gray">الاستلام:</span> <strong>{DELIVERY[order.deliveryMethod] || order.deliveryMethod}</strong></div>
                )}
                <div><span className="text-brand-gray">ملاحظات:</span> <strong>{order.notes || 'لا يوجد'}</strong></div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-border overflow-hidden">
            <div className="px-4 py-3 bg-brand-bg font-black text-brand-dark">الأصناف</div>
            <div className="divide-y divide-brand-border">
              {isInternal ? (order.items || []).map((item, index) => (
                <div key={index} className="p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-brand-dark">{item.name} × {item.quantity}</div>
                    {!!item.modifiers?.length && <div className="text-xs text-brand-gray mt-1">{item.modifiers.map(m => m.name).join('، ')}</div>}
                    {item.notes && <div className="text-xs text-brand-gray mt-1">{item.notes}</div>}
                  </div>
                  <div className="font-black text-fuchsia">{formatCurrency((item.unitPrice || 0) * (item.quantity || 0))}</div>
                </div>
              )) : (
                <div className="p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-brand-dark">{order.productNameSnapshot} × {order.quantity}</div>
                    <div className="text-xs text-brand-gray mt-1">سعر الوحدة: {formatCurrency(order.unitPrice || 0)}</div>
                  </div>
                  <div className="font-black text-fuchsia">{formatCurrency(order.netAmount || 0)}</div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-brand-border p-4">
            <div className="text-xs font-black text-brand-gray mb-3">الحساب</div>
            <div className="space-y-2">
              {financeRows.map(([label, value], index) => (
                <div key={label} className={`flex justify-between gap-3 ${index === financeRows.length - 1 ? 'pt-2 border-t border-brand-border text-base' : 'text-sm'}`}>
                  <span className={index === financeRows.length - 1 ? 'font-black text-brand-dark' : 'font-bold text-brand-gray'}>{label}</span>
                  <span className={index === financeRows.length - 1 ? 'font-black text-fuchsia' : 'font-black text-brand-dark'}>{formatCurrency(value || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-5">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="اسم العميل">
              <input className={inputCls} value={form.customerName} onChange={e=>setForm(f=>({...f,customerName:e.target.value}))}/>
            </Field>
            <Field label="رقم الهاتف">
              <input className={inputCls} dir="ltr" value={form.customerPhone} onChange={e=>setForm(f=>({...f,customerPhone:e.target.value}))}/>
            </Field>

            {isInternal ? <>
              <Field label="نوع الطلب">
                <select className={inputCls} value={form.orderType} onChange={e=>setForm(f=>({...f,orderType:e.target.value}))}>
                  {Object.entries(ORDER_TYPES).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="طريقة الدفع">
                <select className={inputCls} value={form.paymentMethod} onChange={e=>setForm(f=>({...f,paymentMethod:e.target.value}))}>
                  {Object.entries(PAYMENTS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </> : <>
              <Field label="طريقة الاستلام">
                <select className={inputCls} value={form.deliveryMethod} onChange={e=>setForm(f=>({...f,deliveryMethod:e.target.value}))}>
                  {Object.entries(DELIVERY).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="العنوان / الموقع">
                <input className={inputCls} value={form.deliveryLocation} onChange={e=>setForm(f=>({...f,deliveryLocation:e.target.value}))}/>
              </Field>
            </>}
          </div>

          {isInternal ? (
            <div className="rounded-2xl border border-brand-border overflow-hidden">
              <div className="px-4 py-3 bg-brand-bg font-black text-brand-dark flex items-center justify-between">
                <span>تعديل الأصناف والكميات</span>
                <span className="text-xs text-brand-gray">{form.items.length} صنف</span>
              </div>
              <div className="divide-y divide-brand-border">
                {form.items.map((line,index)=>(
                  <div key={line.key} className="p-4 grid grid-cols-[1fr_100px_auto] gap-3 items-center">
                    <div>
                      <div className="font-black text-brand-dark">{line.name}</div>
                      {!!line.modifiers?.length && <div className="text-xs text-brand-gray mt-1">{line.modifiers.map(m=>m.name).join('، ')}</div>}
                    </div>
                    <input type="number" min="1" className={inputCls} value={line.quantity}
                      onChange={e=>updateLine(index,{quantity:Math.max(1,Number(e.target.value)||1)})}/>
                    <button onClick={()=>removeLine(index)} className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                      <Trash2 size={16}/>
                    </button>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-brand-bg flex gap-2">
                <select className={inputCls} value={addProductId} onChange={e=>setAddProductId(e.target.value)}>
                  <option value="">اختر صنف لإضافته</option>
                  {products.map(product=><option key={product._id} value={product._id}>{product.name}</option>)}
                </select>
                <button onClick={addLine} disabled={!addProductId}
                  className="px-4 rounded-xl bg-brand-dark text-white font-black disabled:opacity-40 flex items-center gap-1">
                  <Plus size={15}/> إضافة
                </button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="المنتج">
                <select className={inputCls} value={form.productId} onChange={e=>setForm(f=>({...f,productId:e.target.value}))}>
                  {products.map(product=><option key={product._id} value={product._id}>{product.name}</option>)}
                </select>
              </Field>
              <Field label="الكمية">
                <input type="number" min="1" className={inputCls} value={form.quantity}
                  onChange={e=>setForm(f=>({...f,quantity:Math.max(1,Number(e.target.value)||1)}))}/>
              </Field>
              {selectedProduct && <div className="md:col-span-2 text-xs font-bold text-brand-gray">
                السعر الحالي للصنف: {formatCurrency(selectedProduct.directPrice || 0)} — السيرفر يعيد احتساب الفاتورة عند الحفظ.
              </div>}
            </div>
          )}

          {isInternal && (
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="نوع الخصم">
                <select className={inputCls} value={form.discountType} onChange={e=>setForm(f=>({...f,discountType:e.target.value}))}>
                  <option value="amount">مبلغ ثابت</option>
                  <option value="percent">نسبة %</option>
                </select>
              </Field>
              <Field label={form.discountType === 'percent' ? 'نسبة الخصم %' : 'قيمة الخصم'}>
                <input type="number" min="0" className={inputCls}
                  value={form.discountType === 'percent' ? form.discountPercent : form.discount}
                  onChange={e=>setForm(f=>({...f,[f.discountType === 'percent' ? 'discountPercent' : 'discount']:Number(e.target.value)||0}))}/>
              </Field>
              <Field label="سبب الخصم">
                <input className={inputCls} value={form.discountReason} onChange={e=>setForm(f=>({...f,discountReason:e.target.value}))}/>
              </Field>
            </div>
          )}

          <Field label="ملاحظات الطلب">
            <textarea rows="3" className={inputCls} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
          </Field>

          <div className="p-3 rounded-xl bg-amber-50 text-amber-800 text-xs font-bold leading-6">
            عند حفظ تعديل على الأصناف أو الكميات، النظام يعيد احتساب المخزون والإنفاق الاستهلاكي والإدارة المحلية وفرق الكاش تلقائياً.
          </div>

          <div className="flex gap-3">
            <button onClick={save} disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-fuchsia text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
              <Save size={16}/>{saving ? 'جاري الحفظ…' : 'حفظ تعديل الطلب'}
            </button>
            <button onClick={()=>setEditing(false)} className="px-5 py-3 rounded-xl bg-brand-bg text-brand-gray font-black">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  </Modal>
}
