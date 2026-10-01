import { motion } from 'framer-motion'

export default function StatCard({ label, value, icon, color = 'fuchsia', trend, sub, className = '' }) {
  const colorMap = {
    fuchsia: 'text-fuchsia bg-fuchsia-bg',
    yellow: 'text-brand-yellow-dark bg-brand-yellow-bg',
    mint: 'text-green-600 bg-brand-mint-bg',
    red: 'text-red-500 bg-red-50',
    blue: 'text-blue-600 bg-blue-50',
    purple: 'text-purple-600 bg-purple-50',
    orange: 'text-orange-500 bg-orange-50',
  }

  const colorClass = colorMap[color] || colorMap.fuchsia
  const textColor = colorClass.split(' ')[0]
  const bgColor = colorClass.split(' ')[1]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl p-5 shadow-card relative overflow-hidden ${className}`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3 ${bgColor}`}>
        {icon}
      </div>
      <div className="text-sm font-bold text-brand-gray mb-1">{label}</div>
      <div className={`text-2xl font-black mb-1 ${textColor}`}>{value}</div>
      {sub && <div className="text-xs text-brand-gray">{sub}</div>}
      {trend && (
        <div className={`text-xs font-bold mt-2 px-2 py-0.5 rounded-lg inline-block ${trend.up ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
          {trend.up ? '↑' : '↓'} {trend.label}
        </div>
      )}
    </motion.div>
  )
}
