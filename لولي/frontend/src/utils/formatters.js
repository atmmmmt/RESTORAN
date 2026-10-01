import dayjs from 'dayjs'

export const isImageUrl = (value) =>
  typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/'))

export const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '—'
  return `${Number(amount).toLocaleString('ar-SY')} ل.س`
}

export const formatNumber = (n) => Number(n).toLocaleString('ar-SY')

export const formatDate = (date, format = 'DD/MM/YYYY') => {
  if (!date) return '—'
  return dayjs(date).format(format)
}

export const formatDateTime = (date) => {
  if (!date) return '—'
  return dayjs(date).format('DD/MM/YYYY HH:mm')
}

export const getStatusText = (status) => ({
  available: 'متاح', hidden: 'مخفي', sold_out: 'نفدت',
  new: 'جديد', confirmed: 'مؤكد', preparing: 'قيد التحضير',
  delivered: 'تم التوصيل', cancelled: 'ملغي',
  paid: 'مدفوع', unpaid: 'غير مدفوع', partially_paid: 'جزئي',
  open: 'مفتوح', partially_settled: 'جزئي', closed: 'مغلق',
  active: 'نشط', inactive: 'غير نشط',
}[status] || status)

export const getStatusColor = (status) => ({
  available: 'text-green-600 bg-green-50',
  hidden: 'text-gray-500 bg-gray-100',
  sold_out: 'text-red-600 bg-red-50',
  new: 'text-blue-600 bg-blue-50',
  confirmed: 'text-green-600 bg-green-50',
  preparing: 'text-yellow-600 bg-yellow-50',
  delivered: 'text-green-700 bg-green-100',
  cancelled: 'text-red-600 bg-red-50',
  paid: 'text-green-600 bg-green-50',
  unpaid: 'text-red-600 bg-red-50',
  partially_paid: 'text-yellow-600 bg-yellow-50',
}[status] || 'text-gray-500 bg-gray-100')

export const getChannelText = (channel) => ({
  direct: 'مباشر', whatsapp: 'واتساب',
  regular_center: 'مركز عادي', specialized_center: 'مركز متخصص',
}[channel] || channel)

export const getCenterTypeText = (type) => ({
  regular_price_center: 'مركز بسعر خاص',
  commission_based_specialized_center: 'مركز بنسبة عمولة',
}[type] || type)

export const calcDiscountedPrice = (price, offer) => {
  if (!offer) return price
  if (offer.discountType === 'percentage') return price * (1 - offer.discountValue / 100)
  return Math.max(0, price - offer.discountValue)
}

/* ── POS / receipt times ─────────────────────────────────────
   Pinned to Damascus time and Latin digits so a ticket shows the shop's
   real clock no matter how the cashier device's timezone/locale is set. */
const SHOP_TZ = 'Asia/Damascus'
const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']

function shopParts(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: SHOP_TZ, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).formatToParts(d).map(p => [p.type, p.value]),
  )
  return parts
}

/** "10:40 ص" */
export const formatShopTime = iso => {
  const p = shopParts(iso)
  if (!p) return '—'
  return `${p.hour}:${p.minute} ${p.dayPeriod === 'AM' ? 'ص' : 'م'}`
}

/** "17 أيلول 2026 · 10:40 ص" */
export const formatShopDateTime = iso => {
  const p = shopParts(iso)
  if (!p) return '—'
  return `${p.day} ${AR_MONTHS[Number(p.month) - 1]} ${p.year} · ${formatShopTime(iso)}`
}
