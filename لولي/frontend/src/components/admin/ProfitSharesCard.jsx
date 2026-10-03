import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PieChart, Plus, Trash2, Save, Calculator, Printer, Users } from 'lucide-react'
import { profitSharesAPI } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import Button from '../common/Button'
import toast from 'react-hot-toast'

const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']

/**
 * Admin settings card: who takes what % of net profit, and the month's
 * settlement computed from the same net-profit figure as the P&L report.
 */
export default function ProfitSharesCard() {
  const now = new Date()
  const [partners, setPartners] = useState([])
  const [saving, setSaving] = useState(false)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [settlement, setSettlement] = useState(null)
  const [loadingSettlement, setLoadingSettlement] = useState(false)
  const [investor, setInvestor] = useState({ enabled: true, name: 'الأميركان', internalPercent: 20, deliveryPercent: 15 })
  const [savingInvestor, setSavingInvestor] = useState(false)

  useEffect(() => {
    profitSharesAPI.get()
      .then(r => { setPartners(r.data.partners || []); if (r.data.investor) setInvestor(i => ({ ...i, ...r.data.investor })) })
      .catch(() => toast.error('تعذّر تحميل نسب الأرباح'))
  }, [])

  const loadSettlement = () => {
    setLoadingSettlement(true)
    profitSharesAPI.monthly(year, month)
      .then(r => setSettlement(r.data))
      .catch(e => toast.error(e.message || 'تعذّر حساب التسوية'))
      .finally(() => setLoadingSettlement(false))
  }

  useEffect(loadSettlement, [year, month])

  const total = useMemo(() => partners.reduce((s, p) => s + (Number(p.percent) || 0), 0), [partners])

  const update = (i, key, value) =>
    setPartners(list => list.map((p, idx) => idx === i ? { ...p, [key]: value } : p))

  const save = async () => {
    if (partners.some(p => !String(p.name || '').trim())) return toast.error('اكتب اسم كل شريك')
    if (total > 100) return toast.error(`مجموع النسب ${total}% — لازم ما يتجاوز 100%`)
    setSaving(true)
    try {
      const r = await profitSharesAPI.save(partners.map(p => ({ name: p.name, percent: Number(p.percent) || 0 })))
      setPartners(r.data.partners)
      toast.success('تم حفظ النسب')
      loadSettlement()
    } catch (e) {
      toast.error(e.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const saveInvestor = async () => {
    setSavingInvestor(true)
    try {
      const r = await profitSharesAPI.saveInvestor({ ...investor, internalPercent: Number(investor.internalPercent), deliveryPercent: Number(investor.deliveryPercent) })
      setInvestor(r.data.investor)
      toast.success(r.data.message)
    } catch (e) { toast.error(e.message || 'فشل الحفظ') }
    finally { setSavingInvestor(false) }
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      className="bg-white rounded-2xl shadow-card p-6 lg:col-span-2">
      <h2 className="font-black text-brand-dark mb-1 flex items-center gap-2">
        <PieChart size={18} className="text-fuchsia" /> نسب صافي الربح والتسوية الشهرية
      </h2>
      <p className="text-sm text-brand-gray font-bold mb-5">
        حدّد نسبة كل شريك من صافي الربح. الحساب الشهري يستخدم نفس صافي الربح الظاهر بتقرير الأرباح والخسائر
        (الإيرادات − تكلفة المنتجات − الهدر − المصاريف).
      </p>

      {/* ── Investor's cut of takings ── */}
      <div className="border-2 border-fuchsia/30 bg-fuchsia-bg/40 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="font-black text-brand-dark flex items-center gap-2"><Users size={17} className="text-fuchsia" /> نسبة الشريك من الصندوق</div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs font-bold text-brand-gray">مفعّلة</span>
            <input type="checkbox" checked={investor.enabled !== false} onChange={e => setInvestor(i => ({ ...i, enabled: e.target.checked }))} className="w-5 h-5 accent-fuchsia" />
          </label>
        </div>
        <p className="text-xs text-brand-gray font-bold mb-4">
          نسبة من مبلغ كل طلب (مو من صافي الربح) — بتنحسب على كل طلب وبتنطبع بفاتورة «طباعة طلبات اليوم» مع المجموع.
        </p>
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="text-xs font-bold text-brand-dark mb-1.5 block">اسم الشريك</label>
            <input value={investor.name || ''} onChange={e => setInvestor(i => ({ ...i, name: e.target.value }))}
              className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm bg-white" />
          </div>
          {[['internalPercent', 'الداخلي / السفري %'], ['deliveryPercent', 'التوصيل %']].map(([k, label]) => (
            <div key={k}>
              <label className="text-xs font-bold text-brand-dark mb-1.5 block">{label}</label>
              <input type="number" min="0" max="100" step="0.5" value={investor[k] ?? ''} onChange={e => setInvestor(i => ({ ...i, [k]: e.target.value }))}
                className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-black text-sm bg-white" />
            </div>
          ))}
        </div>
        <Button onClick={saveInvestor} loading={savingInvestor} size="sm" className="mt-4">
          <Save size={14} /> حفظ نسبة الشريك
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Partners editor ── */}
        <div>
          <div className="space-y-2">
            {partners.length === 0 && (
              <div className="text-sm text-brand-gray font-bold py-4 text-center border-2 border-dashed border-brand-border rounded-xl">
                ما في شركاء مضافين بعد
              </div>
            )}
            {partners.map((p, i) => (
              <div key={p._id || i} className="flex items-center gap-2">
                <input value={p.name} onChange={e => update(i, 'name', e.target.value)}
                  placeholder="اسم الشريك / الجهة"
                  className="flex-1 min-w-0 px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
                <div className="relative w-28 flex-shrink-0">
                  <input type="number" min="0" max="100" step="0.5" value={p.percent}
                    onChange={e => update(i, 'percent', e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-black text-sm" />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray font-black text-sm">%</span>
                </div>
                <button type="button" onClick={() => setPartners(list => list.filter((_, idx) => idx !== i))}
                  aria-label="حذف الشريك"
                  className="w-10 h-10 flex-shrink-0 rounded-xl text-brand-gray hover:text-red-500 hover:bg-red-50 flex items-center justify-center">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-3">
            <button type="button" onClick={() => setPartners(list => [...list, { name: '', percent: 0 }])}
              className="text-fuchsia font-black text-sm flex items-center gap-1.5">
              <Plus size={15} /> إضافة شريك
            </button>
            <span className={`text-sm font-black ${total > 100 ? 'text-red-500' : 'text-brand-dark'}`}>
              المجموع: {total}%
            </span>
          </div>

          <Button onClick={save} loading={saving} className="w-full mt-4">
            <Save size={16} /> حفظ النسب
          </Button>
        </div>

        {/* ── Monthly settlement ── */}
        <div className="bg-brand-bg rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Calculator size={16} className="text-fuchsia" />
            <span className="font-black text-brand-dark text-sm">تسوية شهر</span>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold text-sm bg-white">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold text-sm bg-white">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" onClick={() => window.print()}
              className="mr-auto text-brand-gray hover:text-fuchsia font-bold text-sm flex items-center gap-1">
              <Printer size={15} /> طباعة
            </button>
          </div>

          {loadingSettlement || !settlement ? (
            <div className="text-sm text-brand-gray font-bold py-8 text-center">جاري الحساب…</div>
          ) : (
            <>
              <div className="space-y-1.5 text-sm mb-4">
                {[
                  ['الإيرادات', settlement.report.revenue],
                  ['تكلفة المنتجات', -settlement.report.productCost],
                  ['الهدر', -settlement.report.waste],
                  ['المصاريف', -settlement.report.expenses],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-brand-gray font-bold">{label}</span>
                    <span className="font-black text-brand-dark" dir="ltr">{formatCurrency(val)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 mt-2 border-t-2 border-brand-border">
                  <span className="font-black text-brand-dark">صافي الربح</span>
                  <span className={`font-black ${settlement.netProfit < 0 ? 'text-red-500' : 'text-fuchsia'}`} dir="ltr">
                    {formatCurrency(settlement.netProfit)}
                  </span>
                </div>
              </div>

              {settlement.netProfit < 0 && (
                <div className="text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">
                  الشهر خاسر — ما في أرباح للتوزيع.
                </div>
              )}

              <div className="bg-white rounded-xl border border-brand-border divide-y divide-brand-border">
                {settlement.shares.length === 0 ? (
                  <div className="text-sm text-brand-gray font-bold p-4 text-center">أضف الشركاء ونسبهم ليظهر التوزيع</div>
                ) : settlement.shares.map(s => (
                  <div key={s.name} className="flex items-center justify-between px-4 py-3">
                    <span className="font-black text-brand-dark text-sm">{s.name} <span className="text-brand-gray">({s.percent}%)</span></span>
                    <span className="font-black text-fuchsia" dir="ltr">{formatCurrency(s.amount)}</span>
                  </div>
                ))}
                {settlement.shares.length > 0 && settlement.allocatedPercent < 100 && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="font-bold text-brand-gray text-sm">غير موزّع ({100 - settlement.allocatedPercent}%)</span>
                    <span className="font-black text-brand-gray" dir="ltr">{formatCurrency(settlement.unallocated)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
