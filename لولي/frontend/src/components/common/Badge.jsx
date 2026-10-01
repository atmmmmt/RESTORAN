import { getStatusText } from '../../utils/formatters'

export default function Badge({ status, text, className = '' }) {
  const colors = {
    available: 'bg-green-100 text-green-700',
    hidden: 'bg-gray-100 text-gray-600',
    sold_out: 'bg-red-100 text-red-600',
    new: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-green-100 text-green-700',
    preparing: 'bg-yellow-100 text-yellow-700',
    delivered: 'bg-green-200 text-green-800',
    cancelled: 'bg-red-100 text-red-600',
    paid: 'bg-green-100 text-green-700',
    unpaid: 'bg-red-100 text-red-600',
    partially_paid: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
    open: 'bg-blue-100 text-blue-700',
    partially_settled: 'bg-yellow-100 text-yellow-700',
    closed: 'bg-gray-100 text-gray-600',
  }

  const color = colors[status] || 'bg-gray-100 text-gray-600'
  const displayText = text || getStatusText(status)

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold ${color} ${className}`}>
      {displayText}
    </span>
  )
}
