import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, CheckCircle2, XCircle } from 'lucide-react'
import { dailyClosingAPI, reportsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import LoadingState from '../../components/common/LoadingState'
import { formatCurrency, formatDate } from '../../utils/formatters'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'

export default function DailyClosingPage() {
  const [closings, setClosings] = useState([])
  const [todayData, setTodayData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [notes, setNotes] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      dailyClosingAPI.getAll().then(r => setClosings(r.data.closings || [])),
      reportsAPI.getDaily().then(r => setTodayData(r.data)),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const todayStr = dayjs().format('YYYY-MM-DD')
  const alreadyClosed = closings.some(c => c.date === todayStr)

  const doClose = async () => {
    if (!confirm(`تأكيد إغلاق يوم ${todayStr}؟ لا يمكن التراجع.`)) return
    setClosing(true)
    try {
      const r = await dailyClosingAPI.create({ date: todayStr, notes })
      toast.success(r.data.message || 'تم إغلاق اليوم بنجاح')
      setNotes('')
      load()
    } catch (e) { toast.error(e.message || 'حدث خطأ') }
    finally { setClosing(false) }
  }

  if (loading) return <LoadingState />

  const s = todayData?.summary || {}

  return (
    <div>
      <PageHeader title="إغلاق اليوم" subtitle={`جرد ومحاسبة يوم ${todayStr}`} />

      {/* Today summary */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-card p-6 mb-6">
        <h2 className="font-black text-brand-dark text-lg mb-4">ملخص اليوم</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {[
            { label: 'إجمالي الإيراد', val: s.totalRevenue, color: 'text-fuchsia' },
            { label: 'إجمالي التكلفة', val: s.totalCost, color: 'text-red-500' },
            { label: 'المشتريات', val: s.totalPurchases, color: 'text-brand-yellow' },
            { label: 'الهدر', val: s.totalWasteCost, color: 'text-red-400' },
          ].map(item => (
            <div key={item.label} className="bg-brand-bg rounded-xl p-4">
              <div className="text-xs text-brand-gray font-bold mb-1">{item.label}</div>
              <div className={`text-lg font-black ${item.color}`}>{formatCurrency(item.val)}</div>
            </div>
          ))}
        </div>

        {/* Net profit highlight */}
        <div className={`rounded-2xl p-5 flex items-center justify-between ${s.netProfit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div>
            <div className={`font-black text-lg flex items-center gap-1.5 ${s.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {s.netProfit >= 0 ? <><CheckCircle2 size={18} /> صافي الربح</> : <><XCircle size={18} /> صافي الخسارة</>}
            </div>
            <div className="text-xs text-brand-gray font-bold mt-1">رصيد الكاش: {formatCurrency(s.cashBalance)}</div>
          </div>
          <div className={`text-4xl font-black ${s.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(Math.abs(s.netProfit || 0))}
          </div>
        </div>

        {!alreadyClosed && (
          <div className="mt-5 space-y-3">
            <div>
              <label className="text-sm font-bold text-brand-dark mb-1.5 block">ملاحظات اليوم</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold resize-none"
                placeholder="أي ملاحظات أو تفاصيل إضافية..." />
            </div>
            <Button onClick={doClose} loading={closing} className="w-full text-lg py-4" icon={<Lock size={18} />}>
              إغلاق يوم {todayStr}
            </Button>
          </div>
        )}

        {alreadyClosed && (
          <div className="mt-5 bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
            <CheckCircle2 size={26} className="mx-auto mb-1 text-green-600" />
            <div className="font-black text-green-700">تم إغلاق هذا اليوم بنجاح</div>
          </div>
        )}
      </motion.div>

      {/* History */}
      <div className="bg-white rounded-2xl shadow-card p-5">
        <h2 className="font-black text-brand-dark mb-4">سجل الإغلاقات</h2>
        {closings.length === 0 ? (
          <div className="text-center py-8 text-brand-gray font-bold">لا توجد إغلاقات مسجلة</div>
        ) : (
          <div className="space-y-3">
            {closings.map((c, i) => (
              <motion.div key={c._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between p-4 bg-brand-bg rounded-xl">
                <div>
                  <div className="font-black text-brand-dark">{formatDate(c.date)}</div>
                  <div className="text-xs text-brand-gray font-bold">إيراد: {formatCurrency(c.totalRevenue)}</div>
                </div>
                <div className={`font-black text-lg ${c.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {c.netProfit >= 0 ? '+' : ''}{formatCurrency(c.netProfit)}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
