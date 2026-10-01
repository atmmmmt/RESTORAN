import { useEffect, useState } from 'react'
import {
  Building2, Landmark, Percent, Plus, ReceiptText,
  RefreshCw, Save, Trash2, TrendingUp, WalletCards,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../../components/common/PageHeader'

const isoDate = date => date.toISOString().slice(0, 10)
const today = () => isoDate(new Date())
const monthStart = () => {
  const d = new Date()
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1))
}
const exclusiveEnd = value => {
  const d = new Date(`${value}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return isoDate(d)
}
const money = (value, currency = 'SYP') =>
  `${new Intl.NumberFormat('ar-SY', { maximumFractionDigits: 2 }).format(Number(value || 0))} ${currency}`

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50`}
    >
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'right-6' : 'right-1'}`} />
    </button>
  )
}

function RateInput({ value, onChange, disabled }) {
  return (
    <div className="relative">
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        disabled={disabled}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 pl-9 border-2 border-brand-border rounded-xl font-black bg-white focus:outline-none focus:border-fuchsia disabled:bg-slate-50"
      />
      <Percent size={15} className="absolute left-3 top-3 text-brand-gray" />
    </div>
  )
}

function Metric({ title, value, note, dark = false }) {
  return (
    <div className={`rounded-2xl border p-4 ${dark ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white border-brand-border'}`}>
      <div className={`text-xs font-black ${dark ? 'text-white/70' : 'text-brand-gray'}`}>{title}</div>
      <div className="text-xl font-black mt-2">{value}</div>
      {note && <div className={`text-xs font-bold mt-2 ${dark ? 'text-white/60' : 'text-brand-gray'}`}>{note}</div>}
    </div>
  )
}

export default function FinancePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    currency: 'SYP',
    invoiceTax: { enabled: false, percent: 0 },
    profitTax: { enabled: false, percent: 0 },
    branchOverrides: [],
  })
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [start, setStart] = useState(monthStart())
  const [end, setEnd] = useState(today())
  const [summary, setSummary] = useState(null)
  const [payments, setPayments] = useState([])
  const [branchEdit, setBranchEdit] = useState(null)
  const [payment, setPayment] = useState({
    type: 'invoice_tax',
    centerId: 'hq',
    amount: '',
    paidAt: today(),
    reference: '',
    notes: '',
  })

  const currency = summary?.currency || settings.currency || 'SYP'

  const loadSettings = async () => {
    const response = await api.get('/finance/settings')
    setSettings(response.data.settings)
    setBranches(response.data.branches || [])
  }

  const loadSummary = async () => {
    const response = await api.get('/finance/summary', {
      params: { start, end: exclusiveEnd(end), center: selectedBranch },
    })
    setSummary(response.data)
  }

  const loadPayments = async () => {
    const response = await api.get('/finance/payments', {
      params: { center: selectedBranch },
    })
    setPayments(response.data.payments || [])
  }

  const refreshReport = async () => {
    try {
      await Promise.all([loadSummary(), loadPayments()])
    } catch (error) {
      toast.error(error.message || 'تعذر تحديث التقرير')
    }
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        await Promise.all([loadSettings(), loadSummary(), loadPayments()])
      } catch (error) {
        toast.error(error.message || 'تعذر تحميل المالية')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!loading) refreshReport()
  }, [selectedBranch])

  const updateTax = (name, key, value) => {
    setSettings(current => ({
      ...current,
      [name]: { ...current[name], [key]: value },
    }))
  }

  const saveRestaurantSettings = async () => {
    setSaving(true)
    try {
      const response = await api.put('/finance/settings', {
        currency: settings.currency,
        invoiceTax: {
          enabled: settings.invoiceTax.enabled,
          percent: Number(settings.invoiceTax.percent || 0),
        },
        profitTax: {
          enabled: settings.profitTax.enabled,
          percent: Number(settings.profitTax.percent || 0),
        },
      })
      setSettings(response.data.settings)
      toast.success('تم حفظ إعدادات المطعم المالية')
      await refreshReport()
    } catch (error) {
      toast.error(error.message || 'فشل حفظ الإعدادات')
    } finally {
      setSaving(false)
    }
  }

  const editBranch = branch => {
    const override = settings.branchOverrides?.find(row => String(row.centerId) === String(branch._id))
    const resolved = branch.resolved || {}
    setBranchEdit({
      centerId: branch._id,
      name: branch.name,
      custom: Boolean(override),
      invoiceTax: { ...(override?.invoiceTax || resolved.invoiceTax || settings.invoiceTax) },
      profitTax: { ...(override?.profitTax || resolved.profitTax || settings.profitTax) },
    })
  }

  const saveBranchSettings = async () => {
    if (!branchEdit) return
    setSaving(true)
    try {
      if (!branchEdit.custom) {
        await api.delete(`/finance/settings/branches/${branchEdit.centerId}`)
        toast.success('الفرع عاد لاستخدام نسب المطعم')
      } else {
        await api.put(`/finance/settings/branches/${branchEdit.centerId}`, {
          enabled: true,
          invoiceTax: {
            enabled: branchEdit.invoiceTax.enabled,
            percent: Number(branchEdit.invoiceTax.percent || 0),
          },
          profitTax: {
            enabled: branchEdit.profitTax.enabled,
            percent: Number(branchEdit.profitTax.percent || 0),
          },
        })
        toast.success('تم حفظ نسب الفرع')
      }
      setBranchEdit(null)
      await loadSettings()
      await refreshReport()
    } catch (error) {
      toast.error(error.message || 'فشل حفظ إعداد الفرع')
    } finally {
      setSaving(false)
    }
  }

  const addPayment = async () => {
    const amount = Number(payment.amount)
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('أدخل مبلغ الدفعة')

    setSaving(true)
    try {
      await api.post('/finance/payments', {
        ...payment,
        amount,
        centerId: payment.centerId === 'hq' ? null : payment.centerId,
      })
      setPayment(current => ({ ...current, amount: '', reference: '', notes: '' }))
      toast.success('تم تسجيل الدفعة للمالية')
      await refreshReport()
    } catch (error) {
      toast.error(error.message || 'فشل تسجيل الدفعة')
    } finally {
      setSaving(false)
    }
  }

  const removePayment = async id => {
    if (!window.confirm('حذف سجل الدفعة؟')) return
    try {
      await api.delete(`/finance/payments/${id}`)
      toast.success('تم حذف الدفعة')
      await refreshReport()
    } catch (error) {
      toast.error(error.message || 'فشل حذف الدفعة')
    }
  }

  if (loading) return <div className="h-64 rounded-2xl bg-white animate-pulse" />

  const totals = summary?.totals || {}

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="المالية والضرائب"
        subtitle="نسب منفصلة للمطعم والفروع، مع متابعة المحصل والمسدد والمتبقي"
      />

      {isAdmin && (
        <section className="bg-white rounded-2xl shadow-card border border-brand-border p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-black text-brand-dark flex items-center gap-2"><Landmark size={19} /> إعدادات المطعم</h2>
              <p className="text-xs text-brand-gray font-bold mt-1">كل فرع يرث هذه النسب ما لم تعطِه إعداداً خاصاً.</p>
            </div>
            <button
              onClick={saveRestaurantSettings}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={16} /> حفظ
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="border border-brand-border rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="font-black text-brand-dark">نسبة على الفاتورة</div>
                  <div className="text-xs text-brand-gray mt-1">تُضاف على مبلغ الزبون ولا تُحسب كإيراد للمطعم.</div>
                </div>
                <Toggle checked={settings.invoiceTax.enabled} onChange={value => updateTax('invoiceTax', 'enabled', value)} />
              </div>
              <RateInput value={settings.invoiceTax.percent} disabled={!settings.invoiceTax.enabled} onChange={value => updateTax('invoiceTax', 'percent', value)} />
            </div>

            <div className="border border-brand-border rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="font-black text-brand-dark">نسبة على الأرباح</div>
                  <div className="text-xs text-brand-gray mt-1">تُحسب على ربح الفترة بعد التكلفة والمصاريف المسجلة.</div>
                </div>
                <Toggle checked={settings.profitTax.enabled} onChange={value => updateTax('profitTax', 'enabled', value)} />
              </div>
              <RateInput value={settings.profitTax.percent} disabled={!settings.profitTax.enabled} onChange={value => updateTax('profitTax', 'percent', value)} />
            </div>

            <div className="border border-brand-border rounded-2xl p-4">
              <label className="block text-sm font-black text-brand-dark mb-3">عملة التقارير</label>
              <input
                value={settings.currency}
                onChange={e => setSettings(current => ({ ...current, currency: e.target.value.toUpperCase() }))}
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl font-black focus:outline-none focus:border-fuchsia"
              />
            </div>
          </div>
        </section>
      )}

      <section className="bg-white rounded-2xl shadow-card border border-brand-border p-5">
        <h2 className="font-black text-brand-dark flex items-center gap-2"><Building2 size={19} /> الفروع</h2>
        <p className="text-xs text-brand-gray font-bold mt-1 mb-4">الفرع الرئيسي يستخدم نسب المطعم. اضغط على أي فرع آخر لتخصيص نسبه.</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {branches.map(branch => (
            <button
              key={branch._id}
              type="button"
              onClick={() => branch._id !== 'hq' && isAdmin && editBranch(branch)}
              className="text-right border border-brand-border rounded-2xl p-4 hover:border-fuchsia transition-colors"
            >
              <div className="font-black text-brand-dark">{branch.name}</div>
              <div className="flex flex-wrap gap-2 mt-3 text-xs font-black">
                <span className="px-2 py-1 rounded-lg bg-brand-bg">
                  فاتورة: {branch.resolved?.invoiceTax?.enabled ? `${branch.resolved.invoiceTax.percent}%` : 'معطلة'}
                </span>
                <span className="px-2 py-1 rounded-lg bg-brand-bg">
                  أرباح: {branch.resolved?.profitTax?.enabled ? `${branch.resolved.profitTax.percent}%` : 'معطلة'}
                </span>
                <span className="px-2 py-1 rounded-lg bg-slate-100">
                  {branch.resolved?.source === 'branch' ? 'إعداد خاص' : 'يرث المطعم'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {branchEdit && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setBranchEdit(null)}>
          <div className="w-full max-w-xl bg-white rounded-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-xl text-brand-dark">إعدادات {branchEdit.name}</h3>
            <div className="flex items-center justify-between gap-4 my-5 p-4 rounded-2xl bg-brand-bg">
              <div>
                <div className="font-black">إعداد مستقل لهذا الفرع</div>
                <div className="text-xs text-brand-gray mt-1">عند إيقافه يعود الفرع لإعداد المطعم.</div>
              </div>
              <Toggle checked={branchEdit.custom} onChange={value => setBranchEdit(current => ({ ...current, custom: value }))} />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                ['invoiceTax', 'نسبة الفاتورة'],
                ['profitTax', 'نسبة الأرباح'],
              ].map(([key, label]) => (
                <div key={key} className="border border-brand-border rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-black">{label}</span>
                    <Toggle
                      checked={branchEdit[key].enabled}
                      disabled={!branchEdit.custom}
                      onChange={value => setBranchEdit(current => ({
                        ...current,
                        [key]: { ...current[key], enabled: value },
                      }))}
                    />
                  </div>
                  <RateInput
                    value={branchEdit[key].percent}
                    disabled={!branchEdit.custom || !branchEdit[key].enabled}
                    onChange={value => setBranchEdit(current => ({
                      ...current,
                      [key]: { ...current[key], percent: value },
                    }))}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={saveBranchSettings} disabled={saving} className="flex-1 py-3 rounded-xl bg-brand-dark text-white font-black">حفظ</button>
              <button onClick={() => setBranchEdit(null)} className="px-6 py-3 rounded-xl bg-brand-bg font-black">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-4">
        <div className="bg-white rounded-2xl border border-brand-border p-4 grid md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs font-black text-brand-gray block mb-1">من</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" />
          </div>
          <div>
            <label className="text-xs font-black text-brand-gray block mb-1">إلى</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" />
          </div>
          <div>
            <label className="text-xs font-black text-brand-gray block mb-1">الفرع</label>
            <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold bg-white">
              <option value="all">كل الفروع</option>
              {branches.map(branch => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
            </select>
          </div>
          <button onClick={refreshReport} className="px-5 py-2.5 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2">
            <RefreshCw size={16} /> تحديث التقرير
          </button>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric title="ما دفعه الزبائن" value={money(totals.customerCollections, currency)} />
          <Metric title="إيراد المطعم" value={money(totals.revenueBeforeInvoiceTax, currency)} note="بعد استبعاد نسبة الفاتورة" />
          <Metric title="نسبة الفاتورة المحصلة" value={money(totals.invoiceTaxCollected, currency)} note={`المتبقي: ${money(totals.invoiceTaxDue, currency)}`} />
          <Metric title="الربح قبل الضريبة" value={money(totals.profitBeforeTax, currency)} note={`تكلفة ${money(totals.costOfGoods, currency)} · مصاريف ${money(totals.operatingExpenses, currency)}`} />
          <Metric title="ضريبة الأرباح التقديرية" value={money(totals.profitTaxEstimate, currency)} note={`المتبقي: ${money(totals.profitTaxDue, currency)}`} />
          <Metric title="المسدد — نسبة الفاتورة" value={money(totals.invoiceTaxPaid, currency)} />
          <Metric title="المسدد — ضريبة الأرباح" value={money(totals.profitTaxPaid, currency)} />
          <Metric dark title="صافي الربح بعد الضريبة" value={money(totals.estimatedNetProfitAfterTax, currency)} />
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-card border border-brand-border overflow-hidden">
        <div className="p-5 border-b border-brand-border"><h2 className="font-black text-brand-dark">تفصيل الفروع</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-brand-bg text-brand-gray">
              <tr>
                {['الفرع', 'طلبات', 'إيراد المطعم', 'نسبة الفاتورة', 'التكلفة', 'المصاريف', 'الربح', 'ضريبة الأرباح', 'الصافي'].map(label => (
                  <th key={label} className="p-3 text-right font-black">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(summary?.branches || []).map(row => (
                <tr key={row.centerId || 'hq'} className="border-t border-brand-border">
                  <td className="p-3 font-black">{row.centerName}</td>
                  <td className="p-3">{row.ordersCount}</td>
                  <td className="p-3">{money(row.revenueBeforeInvoiceTax, currency)}</td>
                  <td className="p-3">{money(row.invoiceTaxCollected, currency)}</td>
                  <td className="p-3">{money(row.costOfGoods, currency)}</td>
                  <td className="p-3">{money(row.operatingExpenses, currency)}</td>
                  <td className="p-3 font-black">{money(row.profitBeforeTax, currency)}</td>
                  <td className="p-3">{money(row.profitTaxEstimate, currency)}</td>
                  <td className="p-3 font-black">{money(row.estimatedNetProfitAfterTax, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid xl:grid-cols-5 gap-5">
        {isAdmin && (
          <div className="xl:col-span-2 bg-white rounded-2xl shadow-card border border-brand-border p-5">
            <h2 className="font-black text-brand-dark flex items-center gap-2 mb-4"><Plus size={18} /> تسجيل دفعة للمالية</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select value={payment.type} onChange={e => setPayment(current => ({ ...current, type: e.target.value }))} className="px-3 py-2.5 border-2 border-brand-border rounded-xl bg-white font-bold">
                  <option value="invoice_tax">نسبة الفاتورة</option>
                  <option value="profit_tax">ضريبة الأرباح</option>
                </select>
                <select value={payment.centerId} onChange={e => setPayment(current => ({ ...current, centerId: e.target.value }))} className="px-3 py-2.5 border-2 border-brand-border rounded-xl bg-white font-bold">
                  {branches.map(branch => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
                </select>
              </div>
              <input type="number" min="0" placeholder="المبلغ" value={payment.amount} onChange={e => setPayment(current => ({ ...current, amount: e.target.value }))} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" />
              <input type="date" value={payment.paidAt} onChange={e => setPayment(current => ({ ...current, paidAt: e.target.value }))} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" />
              <input placeholder="رقم الإيصال / المرجع" value={payment.reference} onChange={e => setPayment(current => ({ ...current, reference: e.target.value }))} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold" />
              <textarea rows={2} placeholder="ملاحظات" value={payment.notes} onChange={e => setPayment(current => ({ ...current, notes: e.target.value }))} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold resize-none" />
              <button onClick={addPayment} disabled={saving} className="w-full py-3 rounded-xl bg-brand-dark text-white font-black">تسجيل الدفعة</button>
            </div>
          </div>
        )}

        <div className={`${isAdmin ? 'xl:col-span-3' : 'xl:col-span-5'} bg-white rounded-2xl shadow-card border border-brand-border overflow-hidden`}>
          <div className="p-5 border-b border-brand-border"><h2 className="font-black text-brand-dark">دفعات المالية</h2></div>
          <div className="overflow-x-auto max-h-[430px] overflow-y-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-brand-bg sticky top-0">
                <tr>{['التاريخ', 'النوع', 'المبلغ', 'المرجع', ''].map(label => <th key={label} className="p-3 text-right font-black text-brand-gray">{label}</th>)}</tr>
              </thead>
              <tbody>
                {payments.map(row => (
                  <tr key={row._id} className="border-t border-brand-border">
                    <td className="p-3">{new Date(row.paidAt).toLocaleDateString('ar-SY')}</td>
                    <td className="p-3 font-black">{row.type === 'invoice_tax' ? 'نسبة الفاتورة' : 'ضريبة الأرباح'}</td>
                    <td className="p-3 font-black">{money(row.amount, currency)}</td>
                    <td className="p-3">{row.reference || '—'}</td>
                    <td className="p-3">{isAdmin && <button onClick={() => removePayment(row._id)} className="p-2 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>}</td>
                  </tr>
                ))}
                {payments.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-brand-gray font-bold">لا توجد دفعات مسجلة</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
