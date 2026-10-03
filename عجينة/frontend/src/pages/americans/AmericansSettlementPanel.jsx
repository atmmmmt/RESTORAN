import { useState } from 'react'
import { CheckCircle2, HandCoins, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../../services/api'

const GOLD = '#C49B49'
const BG = '#0F1113'
const CARD = '#181B1E'
const LINE = 'rgba(255,255,255,.09)'
const money = (v, currency='SYP') =>
  new Intl.NumberFormat('ar-SY',{maximumFractionDigits:2}).format(Number(v||0)) + ' ' + (currency==='SYP'?'ل.س':currency)

export default function AmericansSettlementPanel({ brand, periodStart, periodEnd, onSettled }) {
  const s = brand.summary || {}
  const currency = brand.currency || 'SYP'
  const [form,setForm] = useState(null)
  const [saving,setSaving] = useState(false)

  const rows = [
    { type:'investor_share', title:'حصة إدارة الأميركان', accrued:+(s.investorShare||0), paid:+(s.investorSharePaid||0), due:+(s.investorShareDue||0) },
    { type:'invoice_tax', title:'مالية الفاتورة', accrued:+(s.invoiceTaxCollected||0), paid:+(s.invoiceTaxPaid||0), due:+(s.invoiceTaxDue||0) },
    { type:'profit_tax', title:'ضريبة الأرباح', accrued:+(s.profitTaxEstimate||0), paid:+(s.profitTaxPaid||0), due:+(s.profitTaxDue||0) },
  ]

  const save = async () => {
    const amount = Number(form?.amount)
    if (!(amount > 0)) return toast.error('أدخل مبلغ القبضة')
    setSaving(true)
    try {
      await api.post('/americans-management/settlements', {
        brand: brand.key, type: form.type, amount, periodStart, periodEnd, notes: form.notes || '',
      })
      toast.success('تمت المحاسبة وتحديث المستحقات')
      setForm(null)
      await onSettled?.()
    } catch (e) {
      toast.error(e.message || 'تعذّر تسجيل المحاسبة')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <div className="rounded-[28px] border p-5 sm:p-6 mb-5" style={{background:CARD,borderColor:LINE}}>
      <div className="flex items-center gap-2 mb-4">
        <HandCoins size={19} style={{color:GOLD}} />
        <div>
          <h3 className="text-white font-black">المحاسبة والتسويات</h3>
          <p className="text-white/35 text-xs mt-1">سجّل ما استلمته الإدارة فعلياً من هذا المطعم.</p>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {rows.map(row => <div key={row.type} className="rounded-2xl border p-4" style={{borderColor:LINE,background:'rgba(255,255,255,.025)'}}>
          <div className="text-white font-black text-sm">{row.title}</div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div><div className="text-[10px] text-white/35 font-bold">المستحق</div><div className="text-white text-xs font-black mt-1">{money(row.accrued,currency)}</div></div>
            <div><div className="text-[10px] text-white/35 font-bold">تمت محاسبته</div><div className="text-emerald-400 text-xs font-black mt-1">{money(row.paid,currency)}</div></div>
            <div><div className="text-[10px] text-white/35 font-bold">المتبقي</div><div className="text-xs font-black mt-1" style={{color:row.due>0?GOLD:'#6EE7A8'}}>{money(row.due,currency)}</div></div>
          </div>
          {row.due > 0
            ? <button onClick={()=>setForm({type:row.type,title:row.title,amount:row.due,notes:''})}
                className="w-full mt-4 rounded-xl py-2.5 font-black text-sm flex items-center justify-center gap-2" style={{background:GOLD,color:BG}}>
                <CheckCircle2 size={15}/> تسجيل قبضة / تمت المحاسبة
              </button>
            : <div className="mt-4 rounded-xl py-2.5 text-center text-emerald-400 bg-emerald-500/10 font-black text-sm">✓ تمت المحاسبة</div>}
        </div>)}
      </div>
    </div>

    {form && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,.72)'}}>
      <div className="w-full max-w-md rounded-[26px] border p-5" style={{background:CARD,borderColor:LINE}}>
        <div className="flex items-center justify-between mb-5">
          <div><div className="text-white font-black text-lg">{form.title}</div><div className="text-white/35 text-xs mt-1">{brand.name} · {brand.center?.name}</div></div>
          <button onClick={()=>setForm(null)} className="text-white/50"><X size={20}/></button>
        </div>
        <label className="text-white/50 text-xs font-black block mb-2">المبلغ المستلم</label>
        <input type="number" min="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
          className="w-full rounded-xl px-4 text-white outline-none mb-4" style={{height:48,background:'#101214',border:'1px solid '+LINE}}/>
        <label className="text-white/50 text-xs font-black block mb-2">ملاحظة / رقم إيصال</label>
        <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
          className="w-full rounded-xl px-4 text-white outline-none mb-5" style={{height:48,background:'#101214',border:'1px solid '+LINE}} placeholder="مثال: محاسبة يومية"/>
        <button onClick={save} disabled={saving} className="w-full rounded-xl py-3 font-black disabled:opacity-50" style={{background:GOLD,color:BG}}>
          {saving?'جاري التسجيل…':'تأكيد القبضة وتحديث المحاسبة'}
        </button>
      </div>
    </div>}
  </>
}
