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
  new: 'جديد', confirmed: 'مؤكد', preparing: 'قيد التحضير', ready: 'جاهز',
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
  ready: 'text-blue-700 bg-blue-100',
  delivered: 'text-green-700 bg-green-100',
  cancelled: 'text-red-600 bg-red-50',
  paid: 'text-green-600 bg-green-50',
  unpaid: 'text-red-600 bg-red-50',
  partially_paid: 'text-yellow-600 bg-yellow-50',
}[status] || 'text-gray-500 bg-gray-100')

export const getChannelText = (channel) => ({
  direct: 'مباشر', whatsapp: 'واتساب',
  regular_center: 'فرع عادي', specialized_center: 'فرع متخصص',
}[channel] || channel)

export const getCenterTypeText = (type) => ({
  regular_price_center: 'فرع بسعر خاص',
  commission_based_specialized_center: 'فرع بنسبة عمولة',
}[type] || type)

export const calcDiscountedPrice = (price, offer) => {
  if (!offer) return price
  if (offer.discountType === 'percentage') return price * (1 - offer.discountValue / 100)
  return Math.max(0, price - offer.discountValue)
}
