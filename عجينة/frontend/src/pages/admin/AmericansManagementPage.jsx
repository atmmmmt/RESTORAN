import { useEffect, useMemo, useState } from 'react'
import {
  Building2, CalendarDays, Landmark, ReceiptText, RefreshCw, RotateCcw,
  ShoppingCart, TrendingUp, WalletCards, AlertTriangle, Percent, Banknote,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'

const toInputDate = date => {
  const d = new Date(date)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const monthRange = () => {
  const now = new Date()
  return {
    start: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: toInputDate(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
  }
}

const money = (value, currency = 'SYP') => {
  const amount = Number(value || 0)
  return `${new Intl.NumberFormat('ar-SY', { maximumFractionDigits: 2 }).format(amount)} ${currency === 'SYP' ? 'ل.س' : currency}`
}

function Stat({ title, value, subtitle, Icon, strong = false }) {
  return (
    <div className={`rounded-2xl p-4 border ${strong ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white border-brand-border'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={17} className={strong ? 'text-white' : 'text-fuchsia'} />
        <span className={`text-xs font-black ${strong ? 'text-white/70' : 'text-brand-gray'}`}>{title}</span>
      </div>
      <div className="font-black text-lg leading-tight">{value}</div>
      {subtitle && <div className={`text-xs mt-1 font-bold ${strong ? 'text-white/60' : 'text-brand-gray-light'}`}>{subtitle}</div>}
    </div>
  )
}

function BrandBlock({ brand }) {
  if (!brand.configured) {
    return (
      <div className="bg-white rounded-3xl border border-amber-200 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-amber-600 mt-0.5" size={20} />
          <div>
            <div className="font-black text-brand-dark">{brand.name}</div>
            <div className="text-sm text-brand-gray mt-1">{brand.warning}</div>
          </div>
        </div>
      </div>
    )
  }

  const s = brand.summary || {}
  const currency = brand.currency || 'SYP'

  return (
    <section className="bg-white rounded-3xl border border-brand-border shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-brand-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-black text-brand-dark text-lg flex items-center gap-2">
            <Building2 size={19} className="text-fuchsia" /> {brand.name}
          </div>
          <div className="text-xs text-brand-gray font-bold mt-1">الفرع: {brand.center?.name || 'الأميركان'}</div>
        </div>
        <div className="text-xs font-black px-3 py-1.5 rounded-xl bg-brand-bg text-brand-gray">
          {s.ordersCount || 0} طلب
        </div>
      </div>

      <div className="p-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat title="إجمالي المقبوض من الزبائن" value={money(s.customerCollections, currency)} Icon={ReceiptText} />
        <Stat title="المرتجعات" value={money(s.refunds, currency)} subtitle={`الصافي بعد المرتجعات: ${money(s.netCollectionsAfterRefunds, currency)}`} Icon={RotateCcw} />
        <Stat title="إيراد المطعم قبل ضريبة الأرباح" value={money(s.revenueBeforeInvoiceTax, currency)} subtitle="بدون المبلغ المحصل لصالح المالية" Icon={TrendingUp} />
        <Stat title="المحصل لصالح المالية" value={money(s.invoiceTaxCollected, currency)} subtitle={`المتبقي: ${money(s.invoiceTaxDue, currency)}`} Icon={Landmark} />
        <Stat title="تكلفة البضاعة" value={money(s.costOfGoods, currency)} Icon={ShoppingCart} />
        <Stat title="مصاريف التشغيل" value={money(s.operatingExpenses, currency)} Icon={WalletCards} />
        <Stat title="مشتريات مدفوعة من الصندوق" value={money(s.purchaseCashOut, currency)} subtitle="حركة نقدية وليست مصروف ربح مباشر" Icon={Banknote} />
        <Stat title="حصة إدارة الأميركان" value={money(s.investorShare, currency)} Icon={Percent} />
        <Stat title="الربح قبل الضريبة" value={money(s.profitBeforeTax, currency)} Icon={TrendingUp} />
        <Stat title="ضريبة الأرباح التقديرية" value={money(s.profitTaxEstimate, currency)} subtitle={`المتبقي: ${money(s.profitTaxDue, currency)}`} Icon={Landmark} />
        <Stat title="حركة الصندوق" value={money(s.cashMovementNet, currency)} subtitle={`داخل ${money(s.cashIn, currency)} · خارج ${money(s.cashOut, currency)}`} Icon={WalletCards} />
        <Stat strong title="صافي الربح التقديري" value={money(s.estimatedNetProfitAfterTax, currency)} Icon={TrendingUp} />
      </div>

      <div className="grid xl:grid-cols-2 border-t border-brand-border">
        <div className="p-5 xl:border-l border-brand-border">
          <h3 className="font-black text-brand-dark mb-3">آخر الحركات المالية</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(brand.recentCash || []).slice(0, 12).map(row => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-brand-bg px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-black text-brand-dark truncate">{row.description || row.type}</div>
                  <div className="text-[11px] text-brand-gray">{row.at ? new Date(row.at).toLocaleString('ar-SY') : ''}</div>
                </div>
                <div className={`font-black text-sm whitespace-nowrap ${row.direction === 'out' ? 'text-red-500' : 'text-green-700'}`}>
                  {row.direction === 'out' ? '−' : '+'} {money(row.amount, currency)}
                </div>
              </div>
            ))}
            {!brand.recentCash?.length && <div className="text-sm text-brand-gray">لا توجد حركات ضمن الفترة.</div>}
          </div>
        </div>

        <div className="p-5">
          <h3 className="font-black text-brand-dark mb-3">آخر الطلبات</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(brand.recentOrders || []).slice(0, 12).map((row, index) => (
              <div key={`${row.number}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-brand-bg px-3 py-2.5">
                <div>
                  <div className="text-sm font-black text-brand-dark">{row.number}</div>
                  <div className="text-[11px] text-brand-gray">{row.at ? new Date(row.at).toLocaleString('ar-SY') : ''}</div>
                </div>
                <div className="text-left">
                  <div className="font-black text-sm text-brand-dark">{money(row.amount, currency)}</div>
                  {row.tax > 0 && <div className="text-[11px] text-brand-gray">منها مالية {money(row.tax, currency)}</div>}
                </div>
              </div>
            ))}
            {!brand.recentOrders?.length && <div className="text-sm text-brand-gray">لا توجد طلبات ضمن الفترة.</div>}
          </div>
        </div>
      </div>
    </section>
  )
}

export default function AmericansManagementPage() {
  const initial = useMemo(monthRange, [])
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/americans-management/summary', { params: { start, end } })
      setData(res.data)
    } catch (e) {
      toast.error(e.message || 'تعذّر تحميل لوحة إدارة الأميركان')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const totals = data?.totals || {}

  return (
    <div>
      <PageHeader
        title="إدارة الأميركان"
        subtitle="لوحة مالية موحّدة لفرع الأميركان في لوليز وعجينة وطحينة"
      />

      <div className="bg-white rounded-2xl border border-brand-border p-4 mb-5 flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="flex-1">
          <label className="text-xs font-black text-brand-gray block mb-1">من</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-black text-brand-gray block mb-1">إلى</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" />
        </div>
        <button onClick={load} disabled={loading} className="px-5 py-2.5 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2 disabled:opacity-60">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> تحديث التقرير
        </button>
      </div>

      {loading && !data ? (
        <div className="bg-white rounded-3xl p-12 text-center font-bold text-brand-gray">جاري تحميل البيانات المالية…</div>
      ) : (
        <>
          <div className="mb-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Stat title="إجمالي المحلين" value={money(totals.customerCollections)} subtitle={`${totals.ordersCount || 0} طلب`} Icon={ReceiptText} />
            <Stat title="حصة إدارة الأميركان" value={money(totals.investorShare)} subtitle="من المحلين ضمن الفترة" Icon={Percent} />
            <Stat title="إجمالي المستحق للمالية" value={money((totals.invoiceTaxDue || 0) + (totals.profitTaxDue || 0))} Icon={Landmark} />
            <Stat strong title="صافي الربح التقديري للمحلين" value={money(totals.estimatedNetProfitAfterTax)} Icon={TrendingUp} />
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-brand-gray mb-4">
            <CalendarDays size={14} />
            الأرقام محصورة بفرع الأميركان فقط، ولا تمنح هذا الحساب صلاحية تعديل إعدادات المطاعم.
          </div>

          <div className="space-y-5">
            {(data?.brands || []).map(brand => <BrandBlock key={brand.key} brand={brand} />)}
          </div>
        </>
      )}
    </div>
  )
}
