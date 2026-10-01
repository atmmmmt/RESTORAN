import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Store, Landmark } from 'lucide-react'
import { reportsAPI, centersAPI } from '../../services/api'
import StatCard from '../../components/common/StatCard'
import LoadingState from '../../components/common/LoadingState'
import { formatCurrency } from '../../utils/formatters'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lowStockAlerts, setLowStockAlerts] = useState([])

  useEffect(() => {
    Promise.all([
      reportsAPI.getDashboard().then(r => setData(r.data)),
      centersAPI.getLowStockAlerts().then(r => setLowStockAlerts(r.data.alerts || [])).catch(() => {}),
    ]).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (!data) return null

  const { sales = {}, purchases = {}, waste = {}, cashBalance = 0, activeOffersCount = 0,
    centers = [], centersBreakdown = [], cashByCenter = null, salesBySource = null } = data

  /* Only split the cash card when money genuinely sits in more than one
     place — a single-site business shouldn't see a breakdown of one row. */
  const cashSplit = cashByCenter?.breakdown?.filter(b => b.balance !== 0) || []
  const showCashSplit = cashSplit.length > 1

  const showSourceSplit = salesBySource
    && salesBySource.internal.revenue > 0
    && salesBySource.recorded.revenue > 0

  const chartColors = ['#D72B6A', '#F6B91A', '#78C8A6', '#F7A7C4']

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">لوحة التحكم 📊</h1>
          <p className="text-brand-gray text-sm font-bold mt-1">
            {new Date().toLocaleDateString('ar-SY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link to="/admin/daily-closing">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="bg-gradient-to-l from-fuchsia to-fuchsia-dark text-white px-5 py-2.5 rounded-2xl font-black text-sm shadow-lg">
            🔒 إغلاق اليوم
          </motion.button>
        </Link>
      </motion.div>

      {/* Main Stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="مبيعات اليوم" value={formatCurrency(sales.totalRevenue)} icon="💰" color="fuchsia"
          sub={`${sales.count || 0} عملية بيع`} />
        <StatCard label="أرباح اليوم" value={formatCurrency(sales.totalProfit)} icon="📈" color="mint"
          sub={sales.totalRevenue > 0 ? `${((sales.totalProfit / sales.totalRevenue) * 100).toFixed(0)}% هامش` : undefined} />
        <StatCard label="مشتريات اليوم" value={formatCurrency(purchases.total)} icon="🛒" color="yellow" />
        <StatCard label="هدر اليوم" value={formatCurrency(waste.totalCost)} icon="🗑️" color="red" />
      </motion.div>

      {/* Cash & Offers */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-brand-dark">رصيد الكاش 💵</h2>
            <Link to="/admin/cash" className="text-fuchsia text-sm font-bold hover:underline">عرض الكل</Link>
          </div>
          <div className="text-4xl font-black text-fuchsia mb-1">{formatCurrency(cashBalance)}</div>
          <p className="text-brand-gray text-sm font-bold">
            {showCashSplit ? 'إجمالي كل الصناديق — التفصيل بالأسفل' : 'إجمالي الكاش المتاح الآن'}
          </p>

          {/* Where the cash actually sits. One combined number tells an owner
              with branches very little on its own. */}
          {showCashSplit && (
            <div className="mt-4 space-y-2">
              {cashSplit.map(b => (
                <div key={b.key} className="flex items-center justify-between px-3 py-2 rounded-xl bg-brand-bg">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-brand-dark">
                    {b.centerId ? <Store size={12} className="text-fuchsia" /> : <Landmark size={12} className="text-fuchsia" />}
                    {b.name}
                  </span>
                  <span className={`text-sm font-black ${b.balance < 0 ? 'text-red-500' : 'text-brand-dark'}`}>
                    {formatCurrency(b.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-brand-mint-bg rounded-xl p-3">
              <div className="text-xs text-brand-gray font-bold mb-1">إيرادات اليوم</div>
              <div className="text-lg font-black text-green-600">{formatCurrency(sales.totalRevenue)}</div>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <div className="text-xs text-brand-gray font-bold mb-1">مصروفات اليوم</div>
              <div className="text-lg font-black text-red-500">{formatCurrency(purchases.total)}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-brand-dark">عروض نشطة 🏷️</h2>
            <Link to="/admin/offers" className="text-fuchsia text-sm font-bold hover:underline">إدارة</Link>
          </div>
          <div className="text-5xl font-black text-brand-yellow text-center my-4">{activeOffersCount}</div>
          <p className="text-brand-gray text-sm font-bold text-center">عرض نشط حالياً</p>
        </div>
      </motion.div>

      {/* Sales breakdown chart */}
      {sales.totalRevenue > 0 && (
        <motion.div variants={fadeUp} className="bg-white rounded-2xl p-6 shadow-card">
          <h2 className="text-lg font-black text-brand-dark mb-4">ملخص المبيعات 📊</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'الإيراد الكلي', value: formatCurrency(sales.totalRevenue), color: 'text-fuchsia' },
              { label: 'التكلفة الكلية', value: formatCurrency(sales.totalCost), color: 'text-red-500' },
              { label: 'صافي الربح', value: formatCurrency(sales.totalProfit), color: 'text-green-600' },
            ].map(item => (
              <div key={item.label} className="bg-brand-bg rounded-xl p-3">
                <div className="text-xs text-brand-gray font-bold mb-1">{item.label}</div>
                <div className={`text-base font-black ${item.color}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Low stock alerts */}
      {lowStockAlerts.length > 0 && (
        <motion.div variants={fadeUp} className="bg-amber-50 border border-amber-300 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-black text-amber-800">⚠️ تنبيهات مخزون الفروع</h2>
            <Link to="/admin/centers" className="text-amber-700 text-sm font-bold hover:underline">عرض الفروع</Link>
          </div>
          <div className="space-y-2">
            {lowStockAlerts.map((alert, i) => (
              <Link key={i} to={`/admin/centers/${alert.centerId}`}>
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-amber-200 hover:border-amber-400 transition-colors">
                  <div>
                    <div className="font-black text-sm text-gray-800">{alert.centerName}</div>
                    <div className="text-xs text-amber-700 font-bold">{alert.productName}</div>
                  </div>
                  <div className="text-left">
                    <div className={`font-black text-base ${alert.quantity === 0 ? 'text-red-600' : 'text-amber-700'}`}>
                      {alert.quantity === 0 ? 'نفدت' : `متبقي ${alert.quantity}`}
                    </div>
                    <div className="text-xs text-gray-400">الحد الأدنى: {alert.threshold}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* Centers balances */}
      {centers.length > 0 && (
        <motion.div variants={fadeUp} className="bg-white rounded-2xl p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-brand-dark">أرصدة فروع البيع 🏪</h2>
            <Link to="/admin/centers" className="text-fuchsia text-sm font-bold hover:underline">عرض الكل</Link>
          </div>
          <div className="space-y-3">
            {centers.map((c, i) => (
              <div key={c._id} className="flex items-center justify-between p-3 bg-brand-bg rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg"
                    style={{ background: chartColors[i % chartColors.length] + '20' }}>
                    🏪
                  </div>
                  <div>
                    <div className="font-black text-sm text-brand-dark">{c.name}</div>
                    <div className="text-xs text-brand-gray">الرصيد المتبقي</div>
                  </div>
                </div>
                <div className="font-black text-fuchsia text-sm">{formatCurrency(c.currentBalance)}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Per-center breakdown */}
      {centersBreakdown.length > 0 && (
        <motion.div variants={fadeUp} className="bg-white rounded-2xl p-6 shadow-card">
          <h2 className="text-lg font-black text-brand-dark mb-4">تفصيل فروع البيع 🏪</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="border-b border-brand-bg text-brand-gray font-bold">
                  <th className="py-2 px-2">الفرع</th>
                  <th className="py-2 px-2">الموظفون</th>
                  <th className="py-2 px-2">الرواتب</th>
                  <th className="py-2 px-2">المصاريف</th>
                  <th className="py-2 px-2">المبيعات</th>
                  <th className="py-2 px-2">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {centersBreakdown.map(c => (
                  <tr key={c.centerId} className="border-b border-brand-bg/60">
                    <td className="py-2 px-2 font-black text-brand-dark">{c.name}</td>
                    <td className="py-2 px-2">{c.employeesCount}</td>
                    <td className="py-2 px-2 text-red-500 font-bold">{formatCurrency(c.payrollCost)}</td>
                    <td className="py-2 px-2 text-red-500 font-bold">{formatCurrency(c.expenses)}</td>
                    <td className="py-2 px-2 text-green-600 font-bold">{formatCurrency(c.sales)}</td>
                    <td className={`py-2 px-2 font-black ${c.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(c.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Quick links */}
      <motion.div variants={fadeUp}>
        <h2 className="text-lg font-black text-brand-dark mb-3">وصول سريع ⚡</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/admin/sales', icon: '💰', label: 'تسجيل بيع', color: 'from-fuchsia to-fuchsia-dark' },
            { to: '/admin/production', icon: '🍳', label: 'دفعة إنتاج', color: 'from-brand-yellow to-amber-500' },
            { to: '/admin/purchases', icon: '🛒', label: 'مشتريات', color: 'from-brand-mint to-green-600' },
            { to: '/admin/orders', icon: '📋', label: 'الطلبات', color: 'from-purple-500 to-purple-700' },
          ].map(item => (
            <Link key={item.to} to={item.to}>
              <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                className={`bg-gradient-to-br ${item.color} text-white rounded-2xl p-4 text-center shadow-md cursor-pointer`}>
                <div className="text-3xl mb-2">{item.icon}</div>
                <div className="font-black text-sm">{item.label}</div>
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
