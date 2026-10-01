import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, Package, ShoppingCart, TrendingUp, Trash2 } from 'lucide-react'
import { reportsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import StatCard from '../../components/common/StatCard'
import LoadingState from '../../components/common/LoadingState'
import { formatCurrency, formatNumber } from '../../utils/formatters'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import dayjs from 'dayjs'

const COLORS = ['#C18A4A', '#F6B91A', '#C97B52', '#EAD9C2', '#6A4422', '#7A6855']

export default function ReportsPage() {
  const [tab, setTab] = useState('daily')
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [year, setYear] = useState(dayjs().year())
  const [month, setMonth] = useState(dayjs().month() + 1)
  const [data, setData] = useState(null)
  const [products, setProducts] = useState([])
  const [profitLoss, setProfitLoss] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setData(null)
    try {
      if (tab === 'daily') {
        const r = await reportsAPI.getDaily(date)
        setData(r.data)
      } else if (tab === 'monthly') {
        const r = await reportsAPI.getMonthly(year, month)
        setData(r.data)
      } else if (tab === 'products') {
        const r = await reportsAPI.getProducts({ startDate: date })
        setProducts(r.data.products || [])
      } else if (tab === 'profit') {
        const r = await reportsAPI.getProfitLoss({ startDate: date })
        setProfitLoss(r.data.report)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [tab, date, year, month])

  const TABS = [
    { id: 'daily', label: 'يومي' },
    { id: 'monthly', label: 'شهري' },
    { id: 'products', label: 'المنتجات' },
    { id: 'profit', label: 'الأرباح والخسائر' },
  ]

  return (
    <div>
      <PageHeader title="التقارير" subtitle="تحليل مفصل لأداء المطعم" />

      {/* Tabs */}
      <div className="flex gap-2 bg-brand-bg rounded-2xl p-1.5 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 px-4 rounded-xl font-black text-sm whitespace-nowrap transition-all ${tab === t.id ? 'bg-fuchsia text-white shadow-md' : 'text-brand-gray hover:text-brand-dark'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-card p-4 mb-5 flex flex-wrap gap-3 items-center">
        {(tab === 'daily' || tab === 'products' || tab === 'profit') && (
          <div>
            <label className="text-xs font-bold text-brand-gray mb-1 block">التاريخ</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-4 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
          </div>
        )}
        {tab === 'monthly' && (
          <>
            <div>
              <label className="text-xs font-bold text-brand-gray mb-1 block">السنة</label>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} min="2020" max="2030"
                className="w-24 px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold" />
            </div>
            <div>
              <label className="text-xs font-bold text-brand-gray mb-1 block">الشهر</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold bg-white">
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(2024, i).toLocaleString('ar-SY', { month: 'long' })}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {loading ? <LoadingState /> : (
        <>
          {/* Daily report */}
          {tab === 'daily' && data?.summary && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="إجمالي الإيراد" value={formatCurrency(data.summary.totalRevenue)} icon={Wallet} color="fuchsia" />
                <StatCard label="إجمالي التكلفة" value={formatCurrency(data.summary.totalCost)} icon={Package} color="red" />
                <StatCard label="المشتريات" value={formatCurrency(data.summary.totalPurchases)} icon={ShoppingCart} color="yellow" />
                <StatCard label="صافي الربح" value={formatCurrency(data.summary.netProfit)} icon={TrendingUp} color="mint" />
              </div>
              {data.summary.totalWasteCost > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3"><Trash2 size={22} className="text-red-500" /><span className="font-black text-red-600">تكلفة الهدر</span></div>
                  <span className="font-black text-red-600 text-lg">{formatCurrency(data.summary.totalWasteCost)}</span>
                </div>
              )}
              {data.productBreakdown?.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card p-5">
                  <h2 className="font-black text-brand-dark mb-4">مبيعات حسب المنتج</h2>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.productBreakdown} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#7A6855', fontSize: 11, fontFamily: 'Cairo' }} width={100} />
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                        <Bar dataKey="totalRevenue" radius={[0, 6, 6, 0]}>
                          {data.productBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Monthly report */}
          {tab === 'monthly' && data?.summary && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="إجمالي الإيرادات" value={formatCurrency(data.summary.totalRevenue)} icon={Wallet} color="fuchsia" />
                <StatCard label="صافي الربح" value={formatCurrency(data.summary.netProfit)} icon={TrendingUp} color="mint" />
                <StatCard label="المشتريات" value={formatCurrency(data.summary.totalPurchases)} icon={ShoppingCart} color="yellow" />
                <StatCard label="الهدر" value={formatCurrency(data.summary.totalWasteCost)} icon={Trash2} color="red" />
              </div>
              {data.dailyBreakdown?.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card p-5">
                  <h2 className="font-black text-brand-dark mb-4">المبيعات اليومية</h2>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.dailyBreakdown}>
                        <XAxis dataKey="_id" tick={{ fill: '#7A6855', fontSize: 10, fontFamily: 'Cairo' }} />
                        <YAxis hide />
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                        <Bar dataKey="revenue" fill="#C18A4A" radius={[6, 6, 0, 0]} name="الإيراد" />
                        <Bar dataKey="profit" fill="#C97B52" radius={[6, 6, 0, 0]} name="الربح" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Products report */}
          {tab === 'products' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl shadow-card overflow-hidden">
              <table className="w-full">
                <thead className="bg-brand-bg">
                  <tr>{['المنتج', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش'].map(h => (
                    <th key={h} className="text-right px-4 py-3 text-xs font-bold text-brand-gray">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.productId} className="border-t border-brand-border hover:bg-brand-bg transition-colors">
                      <td className="px-4 py-3 font-black text-brand-dark text-sm">{p.name}</td>
                      <td className="px-4 py-3 text-sm font-bold">{formatNumber(p.totalQuantity)}</td>
                      <td className="px-4 py-3 font-black text-fuchsia text-sm">{formatCurrency(p.totalRevenue)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-red-500">{formatCurrency(p.totalCost)}</td>
                      <td className="px-4 py-3 font-black text-green-600 text-sm">{formatCurrency(p.totalProfit)}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-lg font-bold ${Number(p.profitMargin) > 30 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{p.profitMargin}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}

          {/* Profit & Loss */}
          {tab === 'profit' && profitLoss && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h2 className="font-black text-brand-dark mb-5 text-lg flex items-center gap-2"><TrendingUp size={18} className="text-brand-gray-light" /> قائمة الأرباح والخسائر</h2>
                {[
                  { label: '(+) الإيرادات', val: profitLoss.revenue, color: 'text-green-600', bold: true },
                  { label: '(-) تكلفة البضاعة', val: -profitLoss.productCost, color: 'text-red-500' },
                  { label: '(-) الخصومات', val: -profitLoss.discounts, color: 'text-red-500' },
                  { label: '(-) العمولات', val: -profitLoss.commissions, color: 'text-red-500' },
                  { label: '(-) المشتريات', val: -profitLoss.purchases, color: 'text-red-500' },
                  { label: '(-) الهدر', val: -profitLoss.waste, color: 'text-red-500' },
                  { label: '(-) المصاريف', val: -profitLoss.expenses, color: 'text-red-500' },
                ].map(row => (
                  <div key={row.label} className={`flex justify-between py-3 border-b border-brand-border ${row.bold ? 'font-black' : 'font-bold'}`}>
                    <span className="text-brand-gray text-sm">{row.label}</span>
                    <span className={`text-sm ${row.color}`}>{formatCurrency(Math.abs(row.val))}</span>
                  </div>
                ))}
                <div className="flex justify-between py-4 mt-2">
                  <span className="font-black text-brand-dark text-lg">= صافي الربح</span>
                  <span className={`font-black text-xl ${profitLoss.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(profitLoss.netProfit)}</span>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}
