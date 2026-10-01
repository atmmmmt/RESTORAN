import { useEffect, useMemo, useState } from 'react'
import { Building2, Landmark, Percent, Plus, ReceiptText, RefreshCw, Save, Trash2, TrendingUp, WalletCards } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/common/PageHeader'

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const nextDay = value => {
  const d = new Date(`${value}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
const money = (value, currency = 'SYP') => `${new Intl.NumberFormat('ar-SY', { maximumFractionDigits: 2 }).format(Number(value || 0))} ${currency}`
const pct = value => `${Number(value || 0)}%`

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50`}>
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'right-6' : 'right-1'}`} />
    </button>
  )
}

function RateField({ title, value, setValue, disabled }) {
  return (
    <div>
      <label className="block text-xs font-black text-brand-gray mb-1.5">{title}</label>
      <div className="relative">
        <input type="number" min="0" max="100" step="0.01" disabled={disabled}
          value={value} onChange={e => setValue(e.target.value)}
          className="w-full px-3 py-2.5 pl-9 border-2 border-brand-border rounded-xl font-black bg-white focus:outline-none focus:border-fuchsia disabled:bg-slate-50" />
        <Percent size={15} className="absolute left-3 top-3 text-brand-gray" />
      </div>
    </div>
  )
}

function SummaryCard({ title, value, subtitle, Icon = WalletCards, strong = false }) {
  return (
    <div className={`rounded-2xl border p-5 ${strong ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white border-brand-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-xs font-black ${strong ? 'text-white/70' : 'text-brand-gray'}`}>{title}</div>
          <div className="text-xl md:text-2xl font-black mt-2">{value}</div>
          {subtitle && <div className={`text-xs font-bold mt-2 ${strong ? 'text-white/60' : 'text-brand-gray'}`}>{subtitle}</div>}
        </div>
        <div className={`p-2.5 rounded-xl ${strong ? 'bg-white/10' : 'bg-brand-bg'}`}><Icon size={20} /></div>
      </div>
    </div>
  )
}

export default function FinancePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({ currency: 'SYP', invoiceTax: { enabled: false, percent: 0 }, profitTax: { enabled: false, percent: 0 }, branchOverrides: [] })
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [start, setStart] = useState(monthStart())
  const [end, setEnd] = useState(today())
  const [summary, setSummary] = useState(null)
  const [payments, setPayments] = useState([])
  const [payment, setPayment] = useState({ type: 'invoice_tax', centerId: 'hq', amount: '', paidAt: today(), reference: '', notes: '' })
  const [branchEdit, setBranchEdit] = useState(null)

  const currency = summary?.currency || settings.currency || 'SYP'
  useMemo(() => branches.filter(b => b._id !== 'hq'), [branches])

  const loadSettings = async () => {
    const r = await api.get('/finance/settings')
    setSettings(r.data.settings)
    setBranches(r.data.branches || [])
  }

  const loadSummary = async () => {
    const r = await api.get('/finance/summary', { params: { start, end: nextDay(end), center: selectedBranch } })
    setSummary(r.data)
  }

  const loadPayments = async () => {
    const r = await api.get('/finance/payments', { params: { center: selectedBranch } })
    setPayments(r.data.payments || [])
  }

  const loadAll = async () => {
    setLoading(true)
    try { await Promise.all([loadSettings(), loadSummary(), loadPayments()]) }
    catch (e) { toast.error(e.message || 'تعذر تحميل المالية') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [])
  useEffect(() => {
    if (!loading) Promise.all([loadSummary(), loadPayments()]).catch(e => toast.error(e.message || 'تعذر تحديث التقرير'))
  }, [selectedBranch])

  const setTax = (kind, key, value) => setSettings(s => ({ ...s, [kind]: { ...s[kind], [key]: value } }))

  const saveRestaurant = async () => {
    setSaving(true)
    try {
      const r = await api.put('/finance/settings', {
        currency: settings.currency,
        invoiceTax: { enabled: settings.invoiceTax.enabled, percent: Number(settings.invoiceTax.percent || 0) },
        profitTax: { enabled: settings.profitTax.enabled, percent: Number(settings.profitTax.percent || 0) },
      })
      setSettings(r.data.settings)
      toast.success('تم حفظ نسب المطعم')
      await loadSummary()
    } catch (e) { toast.error(e.message || 'فشل حفظ الإعدادات') }
    finally { setSaving(false) }
  }

  const openBranch = branch => {
    const override = settings.branchOverrides?.find(x => String(x.centerId) === String(branch._id))
    const resolved = branch.resolved || {}
    setBranchEdit({
      centerId: branch._id,
      name: branch.name,
      custom: !!override,
      invoiceTax: { ...(override?.invoiceTax || resolved.invoiceTax || settings.invoiceTax) },
      profitTax: { ...(override?.profitTax || resolved.profitTax || settings.profitTax) },
    })
  }

  const saveBranch = async () => {
    if (!branchEdit) return
    setSaving(true)
    try {
      if (!branchEdit.custom) {
        await api.delete(`/finance/settings/branches/${branchEdit.centerId}`)
        toast.success('الفرع عاد يرث نسب المطعم')
      } else {
        await api.put(`/finance/settings/branches/${branchEdit.centerId}`, {
          enabled: true,
          invoiceTax: { enabled: branchEdit.invoiceTax.enabled, percent: Number(branchEdit.invoiceTax.percent || 0) },
          profitTax: { enabled: branchEdit.profitTax.enabled, percent: Number(branchEdit.profitTax.percent || 0) },
        })
        toast.success('تم حفظ نسب الفرع')
      }
      await loadSettings()
      await loadSummary()
      setBranchEdit(null)
    } catch (e) { toast.error(e.message || 'فشل حفظ إعداد الفرع') }
    finally { setSaving(false) }
  }

  const addPayment = async () => {
    const amount = Number(payment.amount)
    if (!amount || amount <= 0) return toast.error('أدخل مبلغ الدفعة')
    setSaving(true)
    try {
      await api.post('/finance/payments', { ...payment, amount, centerId: payment.centerId === 'hq' ? null : payment.centerId })
      toast.success('تم تسجيل الدفعة للمالية')
      setPayment(p => ({ ...p, amount: '', reference: '', notes: '' }))
      await Promise.all([loadPayments(), loadSummary()])
    } catch (e) { toast.error(e.message || 'فشل تسجيل الدفعة') }
    finally { setSaving(false) }
  }

  const removePayment = async id => {
    if (!confirm('حذف سجل الدفعة؟')) return
    try {
      await api.delete(`/finance/payments/${id}`)
      await Promise.all([loadPayments(), loadSummary()])
      toast.success('تم حذف الدفعة')
    } catch (e) { toast.error(e.message || 'فشل الحذف') }
  }

  if (loading) return <div className="h-64 rounded-2xl bg-white animate-pulse" />
  const t = summary?.totals || {}

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader title="المالية والضرائب" subtitle="نسب مستقلة للمطعم والفروع، ومتابعة ما جُمع وما سُدد للمالية" />

      {isAdmin && (
        <section className="bg-white rounded-2xl shadow-card border border-brand-border p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div><h2 className="font-black text-brand-dark flex items-center gap-2"><Landmark size={19} /> إعدادات المطعم المالية</h2><p className="text-xs text-brand-gray font-bold mt-1">أي فرع بدون إعداد خاص يرث هذه النسب تلقائياً.</p></div>
            <button onClick={saveRestaurant} disabled={saving} className="px-5 py-2.5 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2 disabled:opacity-50"><Save size={16} /> حفظ الإعدادات</button>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border border-brand-border rounded-2xl p-4"><div className="flex items-center justify-between mb-4"><div><div className="font-black text-brand-dark">نسبة على الفاتورة</div><div className="text-xs text-brand-gray mt-1">تُضاف فوق مبلغ الزبون وليست إيراداً للمطعم</div></div><Toggle checked={settings.invoiceTax.enabled} onChange={v => setTax('invoiceTax', 'enabled', v)} /></div><RateField title="النسبة" value={settings.invoiceTax.percent} setValue={v => setTax('invoiceTax', 'percent', v)} disabled={!settings.invoiceTax.enabled} /></div>
            <div className="border border-brand-border rounded-2xl p-4"><div className="flex items-center justify-between mb-4"><div><div className="font-black text-brand-dark">نسبة على الأرباح</div><div className="text-xs text-brand-gray mt-1">تقديرية على ربح الفترة بعد التكلفة والمصاريف المسجلة</div></div><Toggle checked={settings.profitTax.enabled} onChange={v => setTax('profitTax', 'enabled', v)} /></div><RateField title="النسبة" value={settings.profitTax.percent} setValue={v => setTax('profitTax', 'percent', v)} disabled={!settings.profitTax.enabled} /></div>
            <div className="border border-brand-border rounded-2xl p-4"><label className="block font-black text-brand-dark mb-3">عملة التقارير</label><input value={settings.currency} onChange={e => setSettings(s => ({ ...s, currency: e.target.value.toUpperCase() }))} className="w-full px-4 py-3 border-2 border-brand-border rounded-xl font-black focus:outline-none focus:border-fuchsia" /><p className="text-xs text-brand-gray mt-2 font-bold">مثال: SYP</p></div>
          </div>
        </section>
      )}

      <section className="bg-white rounded-2xl shadow-card border border-brand-border p-5 md:p-6">
        <div className="mb-5"><h2 className="font-black text-brand-dark flex items-center gap-2"><Building2 size={19} /> إعدادات الفروع</h2><p className="text-xs text-brand-gray mt-1 font-bold">الفرع الرئيسي يستخدم إعداد المطعم. ويمكن تخصيص أي فرع آخر.</p></div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {branches.map(branch => <button key={branch._id} onClick={() => branch._id !== 'hq' && isAdmin && openBranch(branch)} className="text-right border border-brand-border rounded-2xl p-4 hover:border-fuchsia transition-colors"><div className="font-black text-brand-dark">{branch.name}</div><div className="flex flex-wrap gap-2 mt-3 text-xs font-black"><span className="px-2.5 py-1 rounded-lg bg-brand-bg">فاتورة: {branch.resolved?.invoiceTax?.enabled ? pct(branch.resolved.invoiceTax.percent) : 'معطلة'}</span><span className="px-2.5 py-1 rounded-lg bg-brand-bg">أرباح: {branch.resolved?.profitTax?.enabled ? pct(branch.resolved.profitTax.percent) : 'معطلة'}</span><span className="px-2.5 py-1 rounded-lg bg-slate-100">{branch.resolved?.source === 'branch' ? 'إعداد خاص' : 'يرث المطعم'}</span></div></button>)}
        </div>
      </section>

      {branchEdit && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setBranchEdit(null)}><div className="w-full max-w-xl bg-white rounded-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}><h3 className="font-black text-xl text-brand-dark">إعدادات {branchEdit.name}</h3><div className="flex items-center justify-between my-5 p-4 rounded-2xl bg-brand-bg"><div><div className="font-black">نسب خاصة لهذا الفرع</div><div className="text-xs text-brand-gray mt-1">إذا أوقفتها، يعود الفرع لإعداد المطعم.</div></div><Toggle checked={branchEdit.custom} onChange={v => setBranchEdit(b => ({ ...b, custom: v }))} /></div><div className="grid sm:grid-cols-2 gap-4">{['invoiceTax', 'profitTax'].map(kind => <div key={kind} className="border border-brand-border rounded-2xl p-4"><div className="flex justify-between items-center mb-4"><span className="font-black">{kind === 'invoiceTax' ? 'نسبة الفاتورة' : 'نسبة الأرباح'}</span><Toggle checked={branchEdit[kind].enabled} disabled={!branchEdit.custom} onChange={v => setBranchEdit(b => ({ ...b, [kind]: { ...b[kind], enabled: v } }))} /></div><RateField title="النسبة" value={branchEdit[kind].percent} disabled={!branchEdit.custom || !branchEdit[kind].enabled} setValue={v => setBranchEdit(b => ({ ...b, [kind]: { ...b[kind], percent: v } }))} /></div>)}</div><div className="flex gap-3 mt-6"><button onClick={saveBranch} disabled={saving} className="flex-1 py-3 rounded-xl bg-brand-dark text-white font-black">حفظ</button><button onClick={() => setBranchEdit(null)} className="px-6 py-3 rounded-xl bg-brand-bg font-black">إلغاء</button></div></div></div>}

      <section className="space-y-4">
        <div className="bg-white rounded-2xl border border-brand-border p-4 flex flex-col lg:flex-row lg:items-end gap-3"><div className="flex-1"><label className="text-xs font-black text-brand-gray block mb-1">من</label><input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" /></div><div className="flex-1"><label className="text-xs font-black text-brand-gray block mb-1">إلى</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" /></div><div className="flex-1"><label className="text-xs font-black text-brand-gray block mb-1">الفرع</label><select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold bg-white"><option value="all">كل الفروع</option>{branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></div><button onClick={() => Promise.all([loadSummary(), loadPayments()]).catch(e => toast.error(e.message)} className="px-5 py-2.5 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2"><RefreshCw size={16} /> تحديث</button></div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3"><SummaryCard title="إجمالي ما دفعه الزبائن" value={money(t.customerCollections, currency)} Icon={ReceiptText} /><SummaryCard title="إيراد المطعم قبل ضريبة الأرباح" value={money(t.revenueBeforeInvoiceTax, currency)} subtitle="بعد استبعاد نسبة الفاتورة" Icon={TrendingUp} /><SummaryCard title="مجموع نسبة الفاتورة المحصلة" value={money(t.invoiceTaxCollected, currency)} subtitle={`المتبقي للمالية: ${money(t.invoiceTaxDue, currency)}`} Icon={Landmark} /><SummaryCard title="الربح قبل الضريبة" value={money(t.profitBeforeTax, currency)} subtitle={`تكلفة: ${money(t.costOfGoods, currency)} · مصاريف: ${money(t.operatingExpenses, currency)}`} Icon={WalletCards} /><SummaryCard title="ضريبة الأرباح التقديرية" value={money(t.profitTaxEstimate, currency)} subtitle={`المتبقي: ${money(t.profitTaxDue, currency)}`} Icon={Percent} /><SummaryCard title="المسدد للمالية — فواتير" value={money(t.invoiceTaxPaid, currency)} Icon={Landmark} /><SummaryCard title="المسدد للمالية — أرباح" value={money(t.profitTaxPaid, currency)} Icon={Landmark} /><SummaryCard strong title="صافي الربح التقديري بعد الضريبة" value={money(t.estimatedNetProfitAfterTax, currency)} Icon={TrendingUp} /></div>
      </section>

      <section className="bg-white rounded-2xl shadow-card border border-brand-border overflow-hidden"><div className="p-5 border-b border-brand-border"><h2 className="font-black text-brand-dark">تفصيل الفروع</h2></div><div className="overflow-x-auto"><table className="w-full text-sm min-w-[900px]"><thead className="bg-brand-bg text-brand-gray"><tr>{['الفرع','الطلبات','دخل المطعم','نسبة الفاتورة','التكلفة','المصاريف','الربح','ضريبة الأرباح','صافي بعد الضريبة'].map(h => <th key={h} className="p-3 text-right font-black">{h}</th>)}</tr></thead><tbody>{(summary?.branches || []).map(row => <tr key={row.centerId || 'hq'} className="border-t border-brand-border"><td className="p-3 font-black">{row.centerName}</td><td className="p-3">{row.ordersCount}</td><td className="p-3">{money(row.revenueBeforeInvoiceTax, currency)}</td><td className="p-3">{money(row.invoiceTaxCollected, currency)}</td><td className="p-3">{money(row.costOfGoods, currency)}</td><td className="p-3">{money(row.operatingExpenses, currency)}</td><td className="p-3 font-black">{money(row.profitBeforeTax, currency)}</td><td className="p-3">{money(row.profitTaxEstimate, currency)}</td><td className="p-3 font-black">{money(row.estimatedNetProfitAfterTax, currency)}</td></tr>)}</tbody></table></div></section>

      <section className="grid xl:grid-cols-5 gap-5">{isAdmin && <div className="xl:col-span-2 bg-white rounded-2xl shadow-card border border-brand-border p-5"><h2 className="font-black text-brand-dark flex items-center gap-2 mb-5"><Plus size={18} /> تسجيل دفعة للمالية</h2><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><select value={payment.type} onChange={e => setPayment(p => ({ ...p, type: e.target.value }))} className="px-3 py-2.5 border-2 border-brand-border rounded-xl bg-white font-bold"><option value="invoice_tax">نسبة الفاتورة</option><option value="profit_tax">ضريبة الأرباح</option></select><select value={payment.centerId} onChange={e => setPayment(p => ({ ...p, centerId: e.target.value }))} className="px-3 py-2.5 border-2 border-brand-border rounded-xl bg-white font-bold">{branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></div><input type="number" min="0" placeholder="المبلغ" value={payment.amount} onChange={e => setPayment(p => ({ ...p, amount: e.target.value }))} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" /><input type="date" value={payment.paidAt} onChange={e => setPayment(p => ({ ...p, paidAt: e.target.value }))} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" /><input placeholder="رقم الإيصال / المرجع" value={payment.reference} onChange={e => setPayment(p => ({ ...p, reference: e.target.value }))} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" /><textarea rows={2} placeholder="ملاحظات" value={payment.notes} onChange={e => setPayment(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold resize-none" /><button onClick={addPayment} disabled={saving} className="w-full py-3 rounded-xl bg-brand-dark text-white font-black">تسجيل الدفعة</button></div></div>}<div className={`${isAdmin ? 'xl:col-span-3' : 'xl:col-span-5'} bg-white rounded-2xl shadow-card border border-brand-border overflow-hidden`}><div className="p-5 border-b border-brand-border"><h2 className="font-black text-brand-dark">دفعات المالية</h2></div><div className="overflow-x-auto max-h-[440px] overflow-y-auto"><table className="w-full text-sm min-w-[650px]"><thead className="bg-brand-bg sticky top-0"><tr>{['التاريخ','النوع','المبلغ','المرجع',''].map(h => <th key={h} className="p-3 text-right font-black text-brand-gray">{h}</th>)}</tr></thead><tbody>{payments.map(p => <tr key={p._id} className="border-t border-brand-border"><td className="p-3">{new Date(p.paidAt).toLocaleDateString('ar-SY')}</td><td className="p-3 font-black">{p.type === 'invoice_tax' ? 'نسبة الفاتورة' : 'ضريبة الأرباح'}</td><td className="p-3 font-black">{money(p.amount, currency)}</td><td className="p-3">{p.reference || '—'}</td><td className="p-3">{isAdmin && <button onClick={() => removePayment(p._id)} className="p-2 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>}</td></tr>)}{payments.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-brand-gray font-bold">لا توجد دفعات مسجلة</td></tr>}</tbody></table></div></div></section>
    </div>
  )
}
