import { useEffect, useState } from 'react'
import { Clock3, Landmark, Percent, Save, TrendingUp, WalletCards } from 'lucide-react'
import toast from 'react-hot-toast'
import { centerPortalAPI } from '../../services/api'
import Button from '../../components/common/Button'
import PageHeader from '../../components/common/PageHeader'

const money = value => `${Number(value || 0).toLocaleString('ar-SY')} ل.س`

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'right-6' : 'right-1'}`} />
    </button>
  )
}

export default function CenterSettingsTab() {
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [settings,setSettings]=useState({
    finance:{ invoiceTax:{enabled:false,percent:0}, profitTax:{enabled:false,percent:0} },
    businessHours:{ openingTime:'10:00', closingTime:'04:00', currentDay:'' },
  })
  const [summary,setSummary]=useState({})

  const load=async()=>{
    setLoading(true)
    try{
      const r=await centerPortalAPI.getSettings()
      setSettings(r.data.settings)
      setSummary(r.data.monthSummary||{})
    }catch(e){ toast.error(e.message||'تعذر تحميل إعدادات الفرع') }
    finally{ setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  const save=async()=>{
    setSaving(true)
    try{
      const r=await centerPortalAPI.updateSettings({
        openingTime: settings.businessHours.openingTime,
        closingTime: settings.businessHours.closingTime,
        invoiceTax: {
          enabled: settings.finance.invoiceTax.enabled,
          percent: Number(settings.finance.invoiceTax.percent||0),
        },
        profitTax: {
          enabled: settings.finance.profitTax.enabled,
          percent: Number(settings.finance.profitTax.percent||0),
        },
      })
      setSettings(r.data.settings)
      toast.success('تم حفظ إعدادات الفرع')
      await load()
    }catch(e){ toast.error(e.message||'فشل حفظ إعدادات الفرع') }
    finally{ setSaving(false) }
  }

  if(loading) return <div className="h-60 bg-white rounded-2xl animate-pulse"/>

  const setFinance=(group,key,value)=>setSettings(s=>({
    ...s, finance:{...s.finance,[group]:{...s.finance[group],[key]:value}}
  }))
  const setHours=(key,value)=>setSettings(s=>({
    ...s,businessHours:{...s.businessHours,[key]:value}
  }))

  return (
    <div>
      <PageHeader title="إعدادات الفرع" subtitle="ساعات يوم العمل والنسب المالية الخاصة بهذا الفرع فقط" />

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <section className="bg-white rounded-2xl shadow-card p-5">
          <h2 className="font-black text-brand-dark flex items-center gap-2 mb-4"><Clock3 size={18}/> يوم العمل</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-brand-gray block mb-2">بداية العمل</label>
              <input type="time" value={settings.businessHours.openingTime}
                onChange={e=>setHours('openingTime',e.target.value)}
                className="w-full px-3 py-3 border-2 border-brand-border rounded-xl font-black focus:outline-none focus:border-fuchsia"/>
            </div>
            <div>
              <label className="text-xs font-bold text-brand-gray block mb-2">نهاية العمل</label>
              <input type="time" value={settings.businessHours.closingTime}
                onChange={e=>setHours('closingTime',e.target.value)}
                className="w-full px-3 py-3 border-2 border-brand-border rounded-xl font-black focus:outline-none focus:border-fuchsia"/>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-brand-bg p-3 text-sm font-black text-brand-dark">
            يوم العمل الحالي: {settings.businessHours.currentDay || '—'} ({settings.businessHours.openingTime} ← {settings.businessHours.closingTime})
          </div>
          <p className="text-xs text-brand-gray mt-2 font-bold">إذا كانت النهاية بعد منتصف الليل مثل 04:00 تبقى المبيعات ضمن نفس يوم العمل.</p>
        </section>

        <section className="bg-white rounded-2xl shadow-card p-5">
          <h2 className="font-black text-brand-dark flex items-center gap-2 mb-4"><Landmark size={18}/> المالية الخاصة بالفرع</h2>

          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div><div className="font-black text-brand-dark">نسبة الفاتورة</div><div className="text-xs text-brand-gray">تضاف على الزبون ولا تعتبر إيراداً للمطعم.</div></div>
                <Toggle checked={settings.finance.invoiceTax.enabled} onChange={v=>setFinance('invoiceTax','enabled',v)}/>
              </div>
              <div className="relative">
                <input type="number" min="0" max="100" step="0.01" value={settings.finance.invoiceTax.percent}
                  onChange={e=>setFinance('invoiceTax','percent',e.target.value)}
                  className="w-full px-3 py-3 pl-10 border-2 border-brand-border rounded-xl font-black focus:outline-none focus:border-fuchsia"/>
                <Percent size={15} className="absolute left-3 top-3.5 text-brand-gray"/>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div><div className="font-black text-brand-dark">نسبة الأرباح</div><div className="text-xs text-brand-gray">تقديرية على ربح الفرع بعد التكلفة والمصاريف.</div></div>
                <Toggle checked={settings.finance.profitTax.enabled} onChange={v=>setFinance('profitTax','enabled',v)}/>
              </div>
              <div className="relative">
                <input type="number" min="0" max="100" step="0.01" value={settings.finance.profitTax.percent}
                  onChange={e=>setFinance('profitTax','percent',e.target.value)}
                  className="w-full px-3 py-3 pl-10 border-2 border-brand-border rounded-xl font-black focus:outline-none focus:border-fuchsia"/>
                <Percent size={15} className="absolute left-3 top-3.5 text-brand-gray"/>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="bg-white rounded-2xl shadow-card p-5 mb-5">
        <h2 className="font-black text-brand-dark mb-4">ملخص مالية الفرع — الشهر الحالي</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['المقبوض',money(summary.customerCollections),WalletCards],
            ['المحصل للمالية',money(summary.invoiceTaxCollected),Landmark],
            ['المتبقي للمالية',money((summary.invoiceTaxDue||0)+(summary.profitTaxDue||0)),Landmark],
            ['الربح قبل الضريبة',money(summary.profitBeforeTax),TrendingUp],
            ['تكلفة البضاعة',money(summary.costOfGoods),WalletCards],
            ['مصاريف التشغيل',money(summary.operatingExpenses),WalletCards],
            ['ضريبة الأرباح',money(summary.profitTaxEstimate),Landmark],
            ['صافي الربح التقديري',money(summary.estimatedNetProfitAfterTax),TrendingUp],
          ].map(([label,value,Icon])=>(
            <div key={label} className="rounded-xl bg-brand-bg p-4">
              <div className="text-xs font-bold text-brand-gray flex items-center gap-1"><Icon size={13}/>{label}</div>
              <div className="font-black text-brand-dark mt-2">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving} icon={<Save size={15}/>}>حفظ إعدادات الفرع</Button>
      </div>
    </div>
  )
}
