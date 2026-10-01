import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, MapPin, MessageCircle, PackageCheck, Phone, ShoppingBag, Store, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { ordersAPI, centersAPI } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'

const CART_KEY = 'ajineh_menu_cart'
import { useWaNumber } from '../../hooks/useWaNumber'

function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') }
  catch { return [] }
}

function Field({ label, Icon, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-[#4C382D]">{label}</span>
      <span className="relative block">
        <Icon aria-hidden size={19} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A96734]" />
        <input {...props} className="h-14 w-full rounded-2xl border border-[#E7D2B7] bg-white pr-12 pl-4 text-base font-semibold text-[#27201C] outline-none transition focus:border-[#A96734] focus:ring-4 focus:ring-[#A96734]/10" />
      </span>
    </label>
  )
}

export default function OrderPage() {
  const wa = useWaNumber()
  const [cart, setCart] = useState(readCart)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({ customerName: '', customerPhone: '', deliveryMethod: 'delivery', deliveryLocation: '', notes: '', centerId: '' })
  const [centers, setCenters] = useState([])

  useEffect(() => {
    centersAPI.getPublic()
      .then(res => setCenters(res.data?.centers || []))
      .catch(() => {})
  }, [])

  const total = useMemo(() => cart.reduce((sum, item) => sum + (item.discountedPrice ?? item.directPrice) * item.quantity, 0), [cart])
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const submit = async event => {
    event.preventDefault()
    if (!cart.length) return toast.error('السلة فارغة')
    if (!form.customerName.trim() || !form.customerPhone.trim()) return toast.error('الاسم ورقم الهاتف مطلوبان')
    if (form.deliveryMethod === 'delivery' && !form.deliveryLocation.trim()) return toast.error('أدخل عنوان التوصيل')

    setSubmitting(true)
    try {
      await Promise.all(cart.map(item => ordersAPI.create({
        productId: item._id,
        quantity: item.quantity,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        deliveryLocation: form.deliveryMethod === 'delivery' ? form.deliveryLocation : 'استلام شخصي',
        deliveryMethod: form.deliveryMethod,
        notes: form.notes,
        channel: 'whatsapp',
        centerId: form.centerId || undefined,
      })))

      const lines = cart.map(item => `• ${item.name} × ${item.quantity} — ${formatCurrency((item.discountedPrice ?? item.directPrice) * item.quantity)}`)
      const message = [
        'طلب جديد من عجينة وطحينة', '',
        `الاسم: ${form.customerName}`,
        `الهاتف: ${form.customerPhone}`, '',
        ...lines, '',
        `الإجمالي: ${formatCurrency(total)}`,
        form.deliveryMethod === 'delivery' ? `التوصيل إلى: ${form.deliveryLocation}` : 'طريقة الاستلام: استلام شخصي',
        form.notes ? `ملاحظات: ${form.notes}` : null,
      ].filter(Boolean).join('\n')

      localStorage.removeItem(CART_KEY)
      setCart([])
      setSuccess(true)
      setTimeout(() => window.open(`https://wa.me/${wa}?text=${encodeURIComponent(message)}`, '_blank'), 300)
    } catch (error) {
      toast.error(error.message || 'تعذّر إرسال الطلب، حاول مجددًا')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) return (
    <main className="flex min-h-[75dvh] items-center justify-center bg-[#FBF7F0] px-4 py-12">
      <div className="w-full max-w-md rounded-[32px] bg-white p-7 text-center shadow-[0_16px_50px_rgba(53,32,23,.1)] border border-[#E7D2B7]/70">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-[#EEF4E5] text-[#5A7A3A]"><CheckCircle2 size={42} /></span>
        <h1 className="mt-5 text-2xl font-black text-[#27201C]">وصلنا طلبك</h1>
        <p className="mt-2 font-medium leading-7 text-[#6B5A4A]">فتحنا لك واتساب لإكمال التأكيد. سنتواصل معك بأسرع وقت.</p>
        <Link to="/menu" className="mt-6 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#352017] px-5 font-black text-white">العودة للمنيو <ChevronLeft size={18} /></Link>
      </div>
    </main>
  )

  if (!cart.length) return (
    <main className="flex min-h-[70dvh] items-center justify-center bg-[#FBF7F0] px-4 py-12">
      <div className="text-center"><span className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-[#F6EDDF] text-[#A96734]"><ShoppingBag size={36} /></span><h1 className="mt-5 text-2xl font-black">سلتك فاضية</h1><p className="mt-2 text-[#6B5A4A]">اختار التصنيف وأضف الأصناف اللي بتحبها.</p><Link to="/menu" className="mt-6 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-[#352017] px-7 font-black text-white">ابدأ الطلب <ChevronLeft size={18} /></Link></div>
    </main>
  )

  return (
    <main className="min-h-dvh bg-[#FBF7F0] pb-28">
      <header className="bg-[#352017] text-white"><div className="container-custom py-8"><div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/75"><PackageCheck size={15} /> الخطوة الأخيرة</div><h1 className="mt-3 text-3xl font-black">كمّل طلبك</h1><p className="mt-2 text-sm font-medium text-white/70">راجع السلة وأدخل معلومات التواصل.</p></div></header>
      <form onSubmit={submit} className="container-custom grid gap-5 py-6 lg:grid-cols-[1fr_420px] lg:gap-7 lg:py-9">
        <section className="rounded-[28px] bg-white p-5 shadow-[0_8px_30px_rgba(53,32,23,.07)] border border-[#E7D2B7]/60">
          <h2 className="mb-5 text-xl font-black">معلومات الطلب</h2>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="الاسم الكامل" Icon={UserRound} value={form.customerName} onChange={e=>set('customerName',e.target.value)} autoComplete="name" placeholder="شو منناديك؟" required /><Field label="رقم الهاتف" Icon={Phone} type="tel" inputMode="tel" value={form.customerPhone} onChange={e=>set('customerPhone',e.target.value)} autoComplete="tel" placeholder="09XXXXXXXX" required /></div>
          <fieldset className="mt-5"><legend className="mb-2 text-sm font-black text-[#4C382D]">طريقة الاستلام</legend><div className="grid grid-cols-2 gap-3">{[['delivery','توصيل للبيت'],['pickup','استلام شخصي']].map(([value,label])=><button key={value} type="button" onClick={()=>set('deliveryMethod',value)} className={`min-h-14 rounded-2xl border px-3 text-sm font-black transition ${form.deliveryMethod===value?'border-[#A96734] bg-[#FFF5EC] text-[#8A472C] ring-2 ring-[#A96734]/10':'border-[#E7D2B7] bg-white text-[#6B5A4A]'}`}>{label}</button>)}</div></fieldset>
          {form.deliveryMethod === 'delivery' && <div className="mt-4"><Field label="عنوان التوصيل" Icon={MapPin} value={form.deliveryLocation} onChange={e=>set('deliveryLocation',e.target.value)} autoComplete="street-address" placeholder="الحي، الشارع، أقرب نقطة دالة" required /></div>}
          {centers.length > 0 && (
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-black text-[#4C382D]">أقرب فرع إلك (اختياري)</span>
              <span className="relative block">
                <Store aria-hidden size={19} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A96734]" />
                <select value={form.centerId} onChange={e=>set('centerId',e.target.value)} className="h-14 w-full appearance-none rounded-2xl border border-[#E7D2B7] bg-white pr-12 pl-4 text-base font-semibold text-[#27201C] outline-none transition focus:border-[#A96734] focus:ring-4 focus:ring-[#A96734]/10">
                  <option value="">بدون تحديد فرع</option>
                  {centers.map(c => <option key={c._id} value={c._id}>{c.name}{c.location ? ` — ${c.location}` : ''}</option>)}
                </select>
              </span>
            </label>
          )}
          <label className="mt-4 block"><span className="mb-2 block text-sm font-black text-[#4C382D]">ملاحظات (اختياري)</span><textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={3} placeholder="مثلاً: بدون بصل، زيادة تحمير..." className="w-full resize-none rounded-2xl border border-[#E7D2B7] bg-white p-4 text-base font-semibold outline-none focus:border-[#A96734] focus:ring-4 focus:ring-[#A96734]/10" /></label>
        </section>

        <aside className="h-fit rounded-[28px] bg-white p-5 shadow-[0_8px_30px_rgba(53,32,23,.07)] border border-[#E7D2B7]/60 lg:sticky lg:top-24">
          <div className="flex items-center justify-between"><h2 className="text-xl font-black">ملخص السلة</h2><Link to="/menu" className="min-h-11 px-2 flex items-center text-sm font-black text-[#A96734]">تعديل</Link></div>
          <div className="my-4 space-y-3 border-y border-[#E7D2B7] py-4">{cart.map(item=><div key={item._id} className="flex items-start gap-3"><span className="flex h-8 min-w-8 items-center justify-center rounded-xl bg-[#F6EDDF] text-xs font-black text-[#8A472C]">{item.quantity}×</span><div className="min-w-0 flex-1"><div className="text-sm font-black text-[#27201C]">{item.name}</div><div className="mt-0.5 text-xs font-bold text-[#7A6855]">{formatCurrency((item.discountedPrice ?? item.directPrice)*item.quantity)}</div></div></div>)}</div>
          <div className="flex items-center justify-between"><span className="font-bold text-[#6B5A4A]">الإجمالي</span><span className="text-2xl font-black tabular-nums text-[#8A472C]">{formatCurrency(total)}</span></div>
          <button type="submit" disabled={submitting} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25A85A] px-5 font-black text-white shadow-[0_8px_24px_rgba(37,168,90,.25)] active:scale-[.99] disabled:opacity-60"><MessageCircle size={20} />{submitting ? 'جاري الإرسال...' : 'تأكيد عبر واتساب'}</button>
          <p className="mt-3 text-center text-xs font-medium leading-5 text-[#7A6855]">يُرسل الطلب للوحة الإدارة ثم يفتح واتساب لتأكيد التفاصيل.</p>
        </aside>
      </form>
    </main>
  )
}
