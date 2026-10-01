import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CreditCard, Package, CheckCircle2, BarChart3, KeyRound, Truck, Wallet, CreditCard as CardIcon, AlertTriangle, X, CheckCheck } from 'lucide-react'
import { centersAPI, deliveriesAPI, settlementsAPI, productsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import StatCard from '../../components/common/StatCard'
import LoadingState from '../../components/common/LoadingState'
import { formatCurrency, formatDate, getCenterTypeText } from '../../utils/formatters'
import toast from 'react-hot-toast'

export default function CenterDetailPage() {
  const { id } = useParams()
  const [center, setCenter] = useState(null)
  const [deliveries, setDeliveries] = useState([])
  const [settlements, setSettlements] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [deliveryModal, setDeliveryModal] = useState(false)
  const [settlementModal, setSettlementModal] = useState(false)
  const [portalModal, setPortalModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [delivItems, setDelivItems] = useState([{ productId: '', quantityDelivered: 1 }])
  const [settlAmount, setSettlAmount] = useState('')
  const [settlNotes, setSettlNotes] = useState('')
  const [portalForm, setPortalForm] = useState({ username: '', password: '', threshold: 5 })

  const [computed, setComputed] = useState({ totalDelivered: 0, totalCollected: 0, currentBalance: 0 })

  const load = () => {
    setLoading(true)
    Promise.all([
      centersAPI.getById(id).then(r => {
        setCenter(r.data.center)
        setDeliveries(r.data.recentDeliveries || [])
        setSettlements(r.data.recentSettlements || [])
        if (r.data.computed) setComputed(r.data.computed)
      }),
      productsAPI.getAll({ status: 'available' }).then(r => setProducts(r.data.products || [])),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const addDelivItem = () => setDelivItems(p => [...p, { productId: products[0]?._id || '', quantityDelivered: 1 }])
  const updDelivItem = (i, k, v) => setDelivItems(p => { const n = [...p]; n[i] = { ...n[i], [k]: v }; return n })
  const remDelivItem = (i) => setDelivItems(p => p.filter((_, idx) => idx !== i))

  const saveDelivery = async () => {
    const valid = delivItems.filter(i => i.productId && i.quantityDelivered > 0)
    if (!valid.length) return toast.error('أضف عنصراً واحداً على الأقل')
    setSaving(true)
    try {
      const items = valid.map(it => {
        const prod = products.find(p => p._id === it.productId)
        const isCommission = center?.type === 'commission_based_specialized_center'
        const unitPrice = isCommission ? (prod?.directPrice || 0) : (prod?.regularCenterPrice || 0)
        return {
          productId: it.productId,
          productNameSnapshot: prod?.name || '',
          quantityDelivered: Number(it.quantityDelivered),
          priceType: isCommission ? 'commission_percentage' : 'regular_center_price',
          unitPrice,
          commissionPercent: isCommission ? (center.commissionPercent || 20) : 0,
          expectedGrossAmount: unitPrice * it.quantityDelivered,
        }
      })
      await deliveriesAPI.create({ centerId: id, items })
      toast.success('تم تسجيل التوصيل')
      setDeliveryModal(false)
      load()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const saveSettlement = async () => {
    if (!settlAmount || Number(settlAmount) <= 0) return toast.error('أدخل المبلغ المحصل')
    setSaving(true)
    try {
      await settlementsAPI.create({ centerId: id, amountCollected: Number(settlAmount), notes: settlNotes })
      toast.success('تم تسجيل التسوية بنجاح')
      setSettlementModal(false)
      setSettlAmount('')
      setSettlNotes('')
      load()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const openPortalModal = () => {
    setPortalForm({
      username: center?.portalUsername || '',
      password: '',
      threshold: center?.lowStockThreshold || 5,
    })
    setPortalModal(true)
  }

  const savePortal = async () => {
    if (!portalForm.username || !portalForm.password) return toast.error('اسم المستخدم وكلمة السر مطلوبان')
    setSaving(true)
    try {
      await centersAPI.setPortal(id, {
        username: portalForm.username,
        password: portalForm.password,
        lowStockThreshold: Number(portalForm.threshold),
      })
      toast.success('تم حفظ بيانات البوابة')
      setPortalModal(false)
      load()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return <LoadingState />
  if (!center) return <div className="text-center py-16 text-brand-gray font-bold">المركز غير موجود</div>

  const inventory = center.inventory || []
  const lowStockItems = inventory.filter(i => i.quantity < (center.lowStockThreshold || 5))

  return (
    <div>
      <PageHeader
        title={center.name}
        breadcrumb="مراكزنا"
        subtitle={getCenterTypeText(center.type)}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={openPortalModal} icon={<KeyRound size={16} />}>بوابة المركز</Button>
            <Button variant="mint" onClick={() => { setDelivItems([{ productId: products[0]?._id || '', quantityDelivered: 1 }]); setDeliveryModal(true) }} icon={<Truck size={16} />}>توصيل بضاعة</Button>
            <Button onClick={() => setSettlementModal(true)} icon={<Wallet size={16} />}>تسوية</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="الرصيد المتبقي" value={formatCurrency(computed.currentBalance)} icon={CreditCard} color="fuchsia" />
        <StatCard label="إجمالي البضاعة الموصّلة" value={formatCurrency(computed.totalDelivered)} icon={Package} color="mint" />
        <StatCard label="إجمالي المحصل" value={formatCurrency(computed.totalCollected)} icon={CheckCircle2} color="blue" />
        <StatCard label="نسبة التحصيل" value={computed.totalDelivered > 0 ? `${Math.round((computed.totalCollected / computed.totalDelivered) * 100)}%` : '0%'} icon={BarChart3} color="yellow" />
      </div>

      {/* Summary bar */}
      {computed.totalDelivered > 0 && (
        <div className="bg-gradient-to-r from-fuchsia-bg to-brand-offwhite border border-brand-border rounded-2xl p-4 mb-6">
          <div className="flex flex-wrap gap-6 items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={26} className="text-fuchsia" />
              <div>
                <div className="text-xs text-brand-gray font-bold">البضاعة الموصّلة</div>
                <div className="font-black text-fuchsia text-lg">{formatCurrency(computed.totalDelivered)}</div>
              </div>
            </div>
            <div className="text-2xl text-brand-border font-black">−</div>
            <div className="flex items-center gap-2">
              <CheckCheck size={26} className="text-green-600" />
              <div>
                <div className="text-xs text-brand-gray font-bold">المحصّل</div>
                <div className="font-black text-green-600 text-lg">{formatCurrency(computed.totalCollected)}</div>
              </div>
            </div>
            <div className="text-2xl text-brand-border font-black">=</div>
            <div className="flex items-center gap-2">
              <CardIcon size={26} className="text-brand-gray" />
              <div>
                <div className="text-xs text-brand-gray font-bold">متبقي عند المركز</div>
                <div className={`font-black text-lg ${computed.currentBalance > 0 ? 'text-fuchsia' : 'text-green-600'}`}>
                  {formatCurrency(computed.currentBalance)}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-brand-gray font-bold mb-1">
              <span>نسبة التحصيل</span>
              <span>{Math.round((computed.totalCollected / computed.totalDelivered) * 100)}%</span>
            </div>
            <div className="h-2 bg-brand-border rounded-full overflow-hidden">
              <div className="h-full bg-fuchsia rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round((computed.totalCollected / computed.totalDelivered) * 100))}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Inventory */}
      <div className="bg-white rounded-2xl shadow-card p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-brand-dark flex items-center gap-2"><Package size={18} className="text-brand-gray-light" /> مخزون المركز</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-brand-gray font-bold">حد التنبيه: {center.lowStockThreshold || 5}</span>
            {center.portalUsername && (
              <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                <KeyRound size={12} /> {center.portalUsername}
              </span>
            )}
          </div>
        </div>

        {/* Low stock alert */}
        {lowStockItems.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <span className="font-black text-amber-800 text-sm">مخزون منخفض — يحتاج تزويد</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map(item => (
                <span key={item.productId} className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded-lg">
                  {item.productNameSnapshot}: {item.quantity}
                </span>
              ))}
            </div>
          </div>
        )}

        {inventory.length === 0 ? (
          <div className="text-center py-8 text-brand-gray font-bold">لم يتم تسجيل أي توصيلات بعد</div>
        ) : (
          <div className="space-y-2">
            {inventory.map(item => {
              const isLow   = item.quantity < (center.lowStockThreshold || 5)
              const isEmpty = item.quantity === 0
              return (
                <div key={item.productId}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${
                    isEmpty ? 'bg-red-50' : isLow ? 'bg-amber-50' : 'bg-brand-bg'
                  }`}>
                  <span className="font-bold text-sm text-brand-dark">{item.productNameSnapshot}</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-black text-base ${isEmpty ? 'text-red-600' : isLow ? 'text-amber-700' : 'text-green-700'}`}>
                      {item.quantity}
                    </span>
                    {isEmpty && <span className="text-xs font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded-lg">نفدت</span>}
                    {isLow && !isEmpty && <span className="text-xs font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-lg">منخفض</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Deliveries */}
      <div className="bg-white rounded-2xl shadow-card p-5 mb-5">
        <h2 className="font-black text-brand-dark mb-4 flex items-center gap-2"><Truck size={18} className="text-brand-gray-light" /> آخر التوصيلات</h2>
        {deliveries.length === 0 ? (
          <div className="text-center py-8 text-brand-gray font-bold">لا توجد توصيلات بعد</div>
        ) : (
          <div className="space-y-3">
            {deliveries.map((d, i) => (
              <motion.div key={d._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className="p-4 bg-brand-bg rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-black text-sm text-brand-dark">{formatDate(d.deliveryDate)}</div>
                    <div className="text-xs text-brand-gray font-bold">{d.items?.length || 0} منتج</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-base font-black text-fuchsia">{formatCurrency(d.totalExpectedGross || d.totalValue || 0)}</div>
                    <span className={`text-xs px-2 py-1 rounded-lg font-bold ${d.status === 'closed' ? 'bg-green-50 text-green-600' : 'bg-brand-yellow/20 text-amber-700'}`}>
                      {d.status === 'closed' ? 'مغلق' : d.status === 'partially_settled' ? 'جزئي' : 'مفتوح'}
                    </span>
                  </div>
                </div>
                {d.items?.map((it, j) => (
                  <div key={j} className="flex justify-between text-xs bg-white rounded-lg px-3 py-1.5">
                    <span className="font-bold text-brand-dark">{it.productNameSnapshot}</span>
                    <span className="text-brand-gray font-medium">
                      {it.quantityDelivered} × {formatCurrency(it.unitPrice)} =
                      <span className="font-black text-fuchsia mr-1">{formatCurrency(it.expectedGrossAmount || it.unitPrice * it.quantityDelivered)}</span>
                    </span>
                  </div>
                ))}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Settlements */}
      <div className="bg-white rounded-2xl shadow-card p-5">
        <h2 className="font-black text-brand-dark mb-4 flex items-center gap-2"><Wallet size={18} className="text-brand-gray-light" /> سجل التسويات</h2>
        {settlements.length === 0 ? (
          <div className="text-center py-8 text-brand-gray font-bold">لا توجد تسويات بعد</div>
        ) : (
          <div className="space-y-3">
            {settlements.map((s, i) => (
              <motion.div key={s._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
                <div>
                  <div className="font-black text-sm text-brand-dark">{formatDate(s.settlementDate)}</div>
                  <div className="text-xs text-brand-gray">{s.notes || '—'}</div>
                </div>
                <div className="text-lg font-black text-green-600">+{formatCurrency(s.amountCollected)}</div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Delivery Modal */}
      <Modal open={deliveryModal} onClose={() => setDeliveryModal(false)} title="توصيل بضاعة للمركز">
        <div className="space-y-4">
          {delivItems.map((it, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-8">
                <select value={it.productId} onChange={e => updDelivItem(i, 'productId', e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white text-sm">
                  {products.map(p => <option key={p._id} value={p._id}>{p.name} (متاح: {p.availableQuantity})</option>)}
                </select>
              </div>
              <div className="col-span-3">
                <input type="number" min="1" value={it.quantityDelivered} onChange={e => updDelivItem(i, 'quantityDelivered', Number(e.target.value))}
                  className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
              </div>
              <button onClick={() => remDelivItem(i)} disabled={delivItems.length === 1} className="col-span-1 w-9 h-9 rounded-xl bg-red-50 text-red-500 font-bold disabled:opacity-30 flex items-center justify-center"><X size={16} /></button>
            </motion.div>
          ))}
          <button onClick={addDelivItem} className="text-sm text-fuchsia font-bold hover:underline">+ إضافة منتج</button>
          <div className="flex gap-3">
            <Button onClick={saveDelivery} loading={saving} className="flex-1">تسجيل التوصيل</Button>
            <Button variant="outline" onClick={() => setDeliveryModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>

      {/* Settlement Modal */}
      <Modal open={settlementModal} onClose={() => setSettlementModal(false)} title={<span className="flex items-center gap-2"><Wallet size={18} /> تسوية مع المركز</span>}>
        <div className="space-y-4">
          <div className="bg-fuchsia-bg rounded-xl p-4 flex justify-between">
            <span className="font-bold text-brand-gray">الرصيد المتبقي</span>
            <span className="font-black text-fuchsia">{formatCurrency(center.currentBalance)}</span>
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">المبلغ المحصل *</label>
            <input type="number" value={settlAmount} onChange={e => setSettlAmount(e.target.value)}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-lg" />
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">ملاحظات</label>
            <textarea value={settlNotes} onChange={e => setSettlNotes(e.target.value)} rows={2}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold resize-none" />
          </div>
          <div className="flex gap-3">
            <Button onClick={saveSettlement} loading={saving} className="flex-1">تسجيل التسوية</Button>
            <Button variant="outline" onClick={() => setSettlementModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>

      {/* Portal Credentials Modal */}
      <Modal open={portalModal} onClose={() => setPortalModal(false)} title={<span className="flex items-center gap-2"><KeyRound size={18} /> بوابة مركز البيع</span>}>
        <div className="space-y-4">
          <p className="text-sm text-brand-gray font-bold">
            أنشئ حساباً لصاحب المركز ليتمكن من متابعة مخزونه وتسجيل مبيعاته عبر البوابة.
          </p>
          {center.portalUsername && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm font-bold text-green-800 flex items-start gap-1.5">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> المركز لديه حساب نشط: <span className="font-black">{center.portalUsername}</span>
              <span className="block text-xs text-green-600 mt-1">
                رابط البوابة: /center-portal/login
              </span>
            </div>
          )}
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">اسم المستخدم *</label>
            <input
              type="text"
              value={portalForm.username}
              onChange={e => setPortalForm(p => ({ ...p, username: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
              placeholder="مثال: center_damascus"
            />
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">
              كلمة السر * {center.portalUsername && <span className="text-brand-gray font-normal text-xs">(اتركها فارغة لعدم التغيير)</span>}
            </label>
            <input
              type="password"
              value={portalForm.password}
              onChange={e => setPortalForm(p => ({ ...p, password: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
              placeholder="6 أحرف على الأقل"
            />
          </div>
          <div>
            <label className="text-sm font-bold text-brand-dark mb-1.5 block">حد التنبيه للمخزون</label>
            <input
              type="number"
              min="1"
              value={portalForm.threshold}
              onChange={e => setPortalForm(p => ({ ...p, threshold: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
            />
            <p className="text-xs text-brand-gray mt-1">ينبّهك عندما يصل مخزون أي صنف إلى هذا العدد</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={savePortal} loading={saving} className="flex-1">حفظ البيانات</Button>
            <Button variant="outline" onClick={() => setPortalModal(false)} className="flex-1">إلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
