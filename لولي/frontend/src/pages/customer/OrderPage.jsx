import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, UtensilsCrossed, Package, Wallet, MapPin, User, Phone, Truck,
  ArrowLeft, ShoppingCart, Loader2, PartyPopper, Minus, Plus, Trash2,
} from 'lucide-react'
import { ordersAPI } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import LottiePlayer, { LOTTIE_URLS } from '../../components/common/LottiePlayer'
import WhatsAppIcon from '../../components/common/WhatsAppIcon'
import { useCart } from '../../context/CartContext'
import toast from 'react-hot-toast'

const WA_NUMBER = import.meta.env.VITE_WA_NUMBER || '963XXXXXXXXX'

function StepBadge({ num, active, done }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all ${
      done ? 'bg-brand-mint text-white' : active ? 'bg-fuchsia text-white shadow-glow-fuchsia' : 'bg-brand-border text-brand-gray'
    }`}>
      {done ? <Check size={15} strokeWidth={3} /> : num}
    </div>
  )
}

export default function OrderPage() {
  const { items, setQuantity, removeItem, clearCart, totalPrice } = useCart()
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [waUrl, setWaUrl] = useState('')
  const [step, setStep] = useState(1)
  const [lastOrder, setLastOrder] = useState(null)

  const [form, setForm] = useState({
    customerName: '', customerPhone: '',
    deliveryLocation: '', deliveryMethod: 'delivery', notes: '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const total = totalPrice

  const submit = async (e) => {
    e.preventDefault()
    if (items.length === 0) return toast.error('السلة فارغة')
    if (!form.customerName?.trim() || !form.customerPhone?.trim()) return toast.error('الاسم ورقم الهاتف مطلوبان')
    setSubmitting(true)
    try {
      // One CustomerOrder record per cart line — the backend order model is
      // single-product, so a multi-item cart becomes several linked orders
      // sharing the same customer/notes, sent to WhatsApp as one message.
      await Promise.all(items.map(item => ordersAPI.create({
        productId: item.productId, quantity: item.quantity,
        customerName: form.customerName, customerPhone: form.customerPhone,
        deliveryLocation: form.deliveryLocation, notes: form.notes, channel: 'whatsapp',
      })))

      const msg = [
        `طلب جديد من لوليز`, ``,
        `الاسم: ${form.customerName}`, `الهاتف: ${form.customerPhone}`,
        ``,
        ...items.map(item => `• ${item.name} × ${item.quantity} — ${formatCurrency(item.price * item.quantity)}`),
        ``,
        `الإجمالي: ${formatCurrency(total)}`,
        form.deliveryMethod === 'delivery' ? `توصيل إلى: ${form.deliveryLocation || 'سيتم تحديده'}` : `استلام شخصي`,
        form.notes ? `ملاحظات: ${form.notes}` : null,
        ``, `شكراً لطلبك من لوليز`,
      ].filter(Boolean).join('\n')

      const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`
      setWaUrl(url)
      setLastOrder({ items: [...items], total, form })
      setSuccess(true)
      clearCart()
      // Auto-open WhatsApp
      setTimeout(() => window.open(url, '_blank'), 400)
    } catch (e) { toast.error(e.message || 'حدث خطأ، حاول مجدداً') }
    finally { setSubmitting(false) }
  }

  const resetToNewOrder = () => {
    setSuccess(false); setStep(1); setLastOrder(null)
    setForm({ customerName: '', customerPhone: '', deliveryLocation: '', deliveryMethod: 'delivery', notes: '' })
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Header */}
      <div className="bg-gradient-to-br from-fuchsia-bg via-brand-offwhite to-brand-mint-bg border-b border-brand-border">
        <div className="container-custom py-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl lg:text-4xl font-black text-brand-dark mb-2 flex items-center gap-3">
              <ShoppingCart size={30} strokeWidth={1.75} /> سلّتك
            </h1>
            <p className="text-brand-gray font-bold">سيتم تأكيد طلبك عبر واتساب في أسرع وقت</p>
          </motion.div>
        </div>
      </div>

      <div className="container-custom py-8 lg:py-12">
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div key="success"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="max-w-lg mx-auto text-center py-12">
              <LottiePlayer
                src={LOTTIE_URLS.success}
                width={200} height={200}
                loop={false}
                className="mx-auto mb-6"
                fallback={
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 0.6 }}
                    className="w-24 h-24 rounded-full bg-lolis-mint-light flex items-center justify-center mx-auto mb-6">
                    <PartyPopper size={44} strokeWidth={1.5} className="text-lolis-mint-dark" />
                  </motion.div>
                }
              />
              <h2 className="text-3xl font-black text-brand-dark mb-3">تم استلام طلبك</h2>
              <p className="text-brand-gray font-bold mb-8 text-base leading-relaxed">
                طلبك وصلنا بنجاح — أكمل التواصل عبر واتساب وسنتواصل معك فوراً لتأكيد التفاصيل
              </p>

              <div className="bg-white rounded-3xl border border-brand-border p-6 mb-6 text-right shadow-card">
                <h3 className="font-black text-brand-dark mb-4 text-base">ملخص الطلب</h3>
                <div className="space-y-3">
                  {lastOrder?.items.map(item => (
                    <div key={item.productId} className="flex justify-between items-center text-sm">
                      <span className="text-brand-gray font-bold flex items-center gap-2">
                        <UtensilsCrossed size={14} /> {item.name} × {item.quantity}
                      </span>
                      <span className="font-black text-brand-dark">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-sm border-t border-brand-border pt-3">
                    <span className="text-brand-gray font-bold flex items-center gap-2">
                      <Wallet size={14} /> الإجمالي
                    </span>
                    <span className="font-black text-brand-dark">{formatCurrency(lastOrder?.total || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-brand-gray font-bold flex items-center gap-2">
                      <MapPin size={14} /> الاستلام
                    </span>
                    <span className="font-black text-brand-dark">
                      {lastOrder?.form.deliveryMethod === 'delivery' ? `توصيل: ${lastOrder?.form.deliveryLocation || '—'}` : 'استلام شخصي'}
                    </span>
                  </div>
                </div>
              </div>

              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => window.open(waUrl, '_blank')}
                className="w-full bg-[#25D366] text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center gap-3 text-base mb-4 hover:bg-[#22C55E] transition-all">
                <WhatsAppIcon size={20} />
                أكمل الطلب على واتساب
              </motion.button>
              <button
                onClick={resetToNewOrder}
                className="text-brand-gray font-bold text-sm hover:text-fuchsia transition-colors flex items-center gap-1.5 mx-auto">
                <ArrowLeft size={14} /> طلب جديد
              </button>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="max-w-3xl mx-auto">

              {/* Steps indicator */}
              <div className="flex items-center gap-3 mb-8">
                {[1, 2, 3].map((s, i) => (
                  <>
                    <div key={s} className="flex items-center gap-2">
                      <StepBadge num={s} active={step === s} done={step > s} />
                      <span className={`text-xs font-bold hidden sm:block ${step === s ? 'text-fuchsia' : step > s ? 'text-brand-mint-dark' : 'text-brand-gray'}`}>
                        {['سلّتك', 'معلوماتك', 'تأكيد الطلب'][i]}
                      </span>
                    </div>
                    {i < 2 && <div className={`flex-1 h-0.5 rounded-full transition-all ${step > s ? 'bg-brand-mint' : 'bg-brand-border'}`} />}
                  </>
                ))}
              </div>

              <form onSubmit={submit} className="space-y-5">
                {/* Step 1: Cart */}
                <div className={`bg-white rounded-3xl border shadow-card overflow-hidden transition-all ${step >= 1 ? 'border-brand-border' : 'border-transparent opacity-50'}`}>
                  <button type="button" onClick={() => setStep(1)}
                    className="w-full p-6 flex items-center justify-between text-right hover:bg-brand-bg/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <StepBadge num={1} active={step === 1} done={step > 1} />
                      <div>
                        <div className="font-black text-brand-dark">سلّتك</div>
                        {step > 1 && items.length > 0 && (
                          <div className="text-xs text-fuchsia font-bold">{items.length} صنف — {formatCurrency(total)}</div>
                        )}
                      </div>
                    </div>
                    {step > 1 && <span className="text-brand-gray text-sm font-bold">تعديل</span>}
                  </button>

                  <AnimatePresence>
                    {step === 1 && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                        className="overflow-hidden">
                        <div className="px-6 pb-6 space-y-3">
                          {items.length === 0 ? (
                            <div className="text-center py-8">
                              <UtensilsCrossed size={40} strokeWidth={1.5} className="mx-auto mb-3 text-brand-gray-light" />
                              <div className="font-black text-brand-gray">سلّتك فاضية</div>
                              <Link to="/menu" className="mt-3 inline-flex items-center gap-1.5 text-fuchsia font-bold text-sm">
                                شوف المنيو وأضف أصنافك <ArrowLeft size={13} />
                              </Link>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-3">
                                {items.map(item => (
                                  <div key={item.productId}
                                    className="flex items-center gap-3 p-4 rounded-2xl border-2 border-brand-border">
                                    {item.image?.startsWith('http') ? (
                                      <img src={item.image} alt={item.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                                    ) : (
                                      <div className="w-12 h-12 rounded-xl bg-fuchsia-bg flex items-center justify-center flex-shrink-0 text-fuchsia/50">
                                        <UtensilsCrossed size={18} strokeWidth={1.5} />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-black text-brand-dark text-sm line-clamp-1">{item.name}</div>
                                      <div className="font-black text-fuchsia text-xs mt-0.5">{formatCurrency(item.price)}</div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <button type="button"
                                        onClick={() => setQuantity(item.productId, item.quantity - 1)}
                                        className="w-8 h-8 rounded-lg bg-brand-bg border border-brand-border flex items-center justify-center hover:border-fuchsia/40 transition-all">
                                        <Minus size={13} strokeWidth={2.5} />
                                      </button>
                                      <span className="font-black text-sm w-5 text-center">{item.quantity}</span>
                                      <button type="button"
                                        onClick={() => setQuantity(item.productId, item.quantity + 1)}
                                        className="w-8 h-8 rounded-lg bg-fuchsia text-white flex items-center justify-center hover:bg-fuchsia-dark transition-all">
                                        <Plus size={13} strokeWidth={2.5} />
                                      </button>
                                      <button type="button"
                                        onClick={() => removeItem(item.productId)}
                                        aria-label={`إزالة ${item.name}`}
                                        className="w-8 h-8 rounded-lg text-brand-gray hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all">
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <Link to="/menu" className="inline-flex items-center gap-1.5 text-fuchsia font-bold text-sm">
                                + أضف صنف آخر
                              </Link>

                              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                <div className="bg-brand-bg rounded-2xl p-4">
                                  <div className="bg-white rounded-xl px-4 py-3 flex justify-between items-center border border-brand-border">
                                    <span className="text-brand-gray font-bold text-sm">الإجمالي</span>
                                    <span className="font-black text-fuchsia text-lg">{formatCurrency(total)}</span>
                                  </div>
                                </div>
                                <motion.button type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                  onClick={() => setStep(2)}
                                  className="w-full mt-3 btn-primary text-sm flex items-center justify-center gap-2">
                                  متابعة — معلوماتك <ArrowLeft size={14} />
                                </motion.button>
                              </motion.div>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Step 2: Customer info */}
                <div className={`bg-white rounded-3xl border shadow-card overflow-hidden transition-all ${step >= 2 ? 'border-brand-border' : 'border-transparent opacity-40 pointer-events-none'}`}>
                  <button type="button" onClick={() => step > 2 && setStep(2)}
                    className="w-full p-6 flex items-center justify-between text-right">
                    <div className="flex items-center gap-3">
                      <StepBadge num={2} active={step === 2} done={step > 2} />
                      <div>
                        <div className="font-black text-brand-dark">معلوماتك</div>
                        {step > 2 && (
                          <div className="text-xs text-fuchsia font-bold">{form.customerName} — {form.customerPhone}</div>
                        )}
                      </div>
                    </div>
                    {step > 2 && <span className="text-brand-gray text-sm font-bold">تعديل</span>}
                  </button>

                  <AnimatePresence>
                    {step === 2 && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                        className="overflow-hidden">
                        <div className="px-6 pb-6 space-y-4">
                          <div className="grid sm:grid-cols-2 gap-4">
                            {[
                              { label: 'اسمك *', key: 'customerName', type: 'text', placeholder: 'اسمك الكريم', Icon: User },
                              { label: 'رقم الهاتف *', key: 'customerPhone', type: 'tel', placeholder: '09XXXXXXXX', Icon: Phone },
                            ].map(f => (
                              <div key={f.key}>
                                <label className="text-xs font-bold text-brand-gray mb-1.5 flex items-center gap-1.5">
                                  <f.Icon size={13} /> {f.label}
                                </label>
                                <input type={f.type} value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                                  className="w-full px-4 py-3.5 border-2 border-brand-border rounded-2xl focus:border-fuchsia focus:outline-none font-bold text-sm transition-all"
                                  placeholder={f.placeholder} />
                              </div>
                            ))}
                          </div>

                          <div>
                            <label className="text-xs font-bold text-brand-gray mb-1.5 block">طريقة الاستلام</label>
                            <div className="grid grid-cols-2 gap-3">
                              {[
                                ['delivery', Truck, 'توصيل', 'توصيل لباب البيت'],
                                ['pickup', MapPin, 'استلام', 'استلام شخصي'],
                              ].map(([val, Icon, label, desc]) => (
                                <button key={val} type="button" onClick={() => set('deliveryMethod', val)}
                                  className={`py-3.5 px-4 rounded-2xl font-bold text-sm text-center transition-all border-2 ${
                                    form.deliveryMethod === val
                                      ? 'bg-fuchsia text-white border-fuchsia shadow-md'
                                      : 'bg-brand-bg text-brand-gray border-brand-border hover:border-fuchsia/40'
                                  }`}>
                                  <div className="flex items-center justify-center gap-1.5"><Icon size={14} /> {label}</div>
                                  <div className={`text-xs font-bold mt-0.5 ${form.deliveryMethod === val ? 'opacity-80' : 'opacity-60'}`}>{desc}</div>
                                </button>
                              ))}
                            </div>
                          </div>

                          {form.deliveryMethod === 'delivery' && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                              <label className="text-xs font-bold text-brand-gray mb-1.5 block">عنوان التوصيل</label>
                              <input value={form.deliveryLocation} onChange={e => set('deliveryLocation', e.target.value)}
                                className="w-full px-4 py-3.5 border-2 border-brand-border rounded-2xl focus:border-fuchsia focus:outline-none font-bold text-sm transition-all"
                                placeholder="الحي، الشارع، أي تفاصيل مساعدة..." />
                            </motion.div>
                          )}

                          <div>
                            <label className="text-xs font-bold text-brand-gray mb-1.5 block">ملاحظات إضافية (اختياري)</label>
                            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                              className="w-full px-4 py-3.5 border-2 border-brand-border rounded-2xl focus:border-fuchsia focus:outline-none font-bold text-sm resize-none transition-all"
                              placeholder="أي تفضيلات أو طلبات خاصة؟" />
                          </div>

                          <motion.button type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                            onClick={() => {
                              if (!form.customerName?.trim() || !form.customerPhone?.trim()) return toast.error('الاسم ورقم الهاتف مطلوبان')
                              setStep(3)
                            }}
                            className="w-full btn-primary text-sm flex items-center justify-center gap-2">
                            مراجعة الطلب <ArrowLeft size={14} />
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Step 3: Confirm */}
                <div className={`bg-white rounded-3xl border shadow-card overflow-hidden transition-all ${step >= 3 ? 'border-brand-border' : 'border-transparent opacity-40 pointer-events-none'}`}>
                  <div className="p-6 flex items-center gap-3">
                    <StepBadge num={3} active={step === 3} done={false} />
                    <div className="font-black text-brand-dark">تأكيد وإرسال الطلب</div>
                  </div>

                  <AnimatePresence>
                    {step === 3 && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                        className="overflow-hidden">
                        <div className="px-6 pb-6 space-y-4">
                          {/* Order summary */}
                          <div className="bg-gradient-to-br from-fuchsia-bg to-brand-offwhite rounded-2xl p-5 space-y-3">
                            <h3 className="font-black text-brand-dark mb-3">ملخص طلبك</h3>
                            {items.map(item => (
                              <div key={item.productId} className="flex items-center gap-3">
                                <span className="w-6 text-brand-gray"><UtensilsCrossed size={16} /></span>
                                <span className="text-xs text-brand-gray font-bold flex-1">{item.name} × {item.quantity}</span>
                                <span className="font-black text-brand-dark text-sm">{formatCurrency(item.price * item.quantity)}</span>
                              </div>
                            ))}
                            {[
                              [Wallet, 'الإجمالي', formatCurrency(total)],
                              [User, 'الاسم', form.customerName],
                              [Phone, 'الهاتف', form.customerPhone],
                              [MapPin, 'الاستلام', form.deliveryMethod === 'delivery' ? `توصيل: ${form.deliveryLocation || '—'}` : 'استلام شخصي'],
                            ].map(([Icon, label, value]) => (
                              <div key={label} className="flex items-center gap-3 pt-3 border-t border-white/60">
                                <span className="w-6 text-brand-gray"><Icon size={16} /></span>
                                <span className="text-xs text-brand-gray font-bold w-20">{label}</span>
                                <span className="font-black text-brand-dark text-sm">{value}</span>
                              </div>
                            ))}
                          </div>

                          <motion.button type="submit" disabled={submitting}
                            whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.97 }}
                            className="w-full bg-gradient-to-l from-fuchsia to-fuchsia-dark text-white font-black py-4.5 py-4 rounded-2xl shadow-lg text-base flex items-center justify-center gap-3 disabled:opacity-60 hover:shadow-glow-fuchsia transition-all">
                            {submitting ? <Loader2 size={19} className="animate-spin" /> : <ShoppingCart size={19} />}
                            {submitting ? 'جاري الإرسال' : 'أرسل الطلب الآن'}
                          </motion.button>

                          <p className="text-xs text-brand-gray font-bold text-center">
                            بالضغط توافقين على التواصل عبر واتساب لتأكيد الطلب
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
