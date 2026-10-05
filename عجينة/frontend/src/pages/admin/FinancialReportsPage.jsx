import { useEffect, useState } from 'react'
import { FileText, Printer, RefreshCw, Eye, Calculator } from 'lucide-react'
import { api } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import toast from 'react-hot-toast'
import { getThermalFinancialReportPreview, printThermalFinancialReport } from '../../services/thermalPrinter'

const today = () => new Date().toISOString().slice(0,10)
const monthStart = () => today().slice(0,8) + '01'
const nextDay = value => {
  const d = new Date(value + 'T00:00:00')
  d.setDate(d.getDate()+1)
  return d.toISOString().slice(0,10)
}
const money = (value,currency='SYP') =>
  new Intl.NumberFormat('ar-SY',{maximumFractionDigits:2}).format(Number(value||0)) + (currency==='SYP'?' ل.س':' '+currency)

export default function FinancialReportsPage(){
  const [start,setStart]=useState(monthStart())
  const [end,setEnd]=useState(today())
  const [center,setCenter]=useState('all')
  const [branches,setBranches]=useState([])
  const [report,setReport]=useState(null)
  const [loading,setLoading]=useState(true)
  const [printing,setPrinting]=useState(false)
  const [previewUrl,setPreviewUrl]=useState('')
  const [previewing,setPreviewing]=useState(false)
  const [legacyStart,setLegacyStart]=useState('2026-10-01')
  const [legacyEnd,setLegacyEnd]=useState(today())
  const [legacyCenter,setLegacyCenter]=useState('hq')
  const [legacyAmount,setLegacyAmount]=useState('')

  const load=async()=>{
    setLoading(true)
    try{
      const [s,r]=await Promise.all([
        api.get('/finance/settings'),
        api.get('/finance/report',{params:{start,end:nextDay(end),center}}),
      ])
      setBranches(s.data.branches||[])
      setReport(r.data)
    }catch(e){
      toast.error(e.message||'تعذّر تحميل تقرير المالية')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{load()},[])

  useEffect(()=>{
    if (branches.length && !branches.some(b => String(b._id) === String(legacyCenter))) {
      setLegacyCenter(String(branches[0]._id))
    }
  },[branches,legacyCenter])

  const buildLegacyReport=()=>{
    const amount=Number(String(legacyAmount).replace(/,/g,''))
    if(!Number.isFinite(amount)||amount<=0) return toast.error('اكتب مبلغ المبيعات السابق بشكل صحيح')
    if(!legacyStart||!legacyEnd) return toast.error('حدد بداية ونهاية الفترة')
    if(new Date(legacyEnd)<new Date(legacyStart)) return toast.error('تاريخ النهاية يجب أن يكون بعد البداية')

    const branch=branches.find(b=>String(b._id)===String(legacyCenter))
    const pointOfSale=branch?.name||'الفرع الرئيسي'
    const consumptionTax=Math.round(amount*0.05*100)/100
    const localAdministration=Math.round(consumptionTax*0.05*100)/100
    const grandTotal=Math.round((amount+consumptionTax+localAdministration)*100)/100

    setStart(legacyStart)
    setEnd(legacyEnd)
    setCenter(legacyCenter)
    setReport({
      success:true,
      title:'إجمالي المبيعات',
      source:'legacy_manual',
      period:{
        start:new Date(legacyStart+'T00:00:00').toISOString(),
        end:new Date(nextDay(legacyEnd)+'T00:00:00').toISOString(),
      },
      rates:{consumptionTaxPercent:5,localAdminPercent:5,localAdminBase:'consumption_tax'},
      currency:'SYP',
      rows:[{
        centerId:legacyCenter==='hq'?null:legacyCenter,
        pointOfSale,
        ordersCount:null,
        manual:true,
        foodAndBeverageValue:amount,
        consumptionTax,
        localAdministration,
        grandTotal,
      }],
      totals:{
        ordersCount:null,
        foodAndBeverageValue:amount,
        consumptionTax,
        localAdministration,
        grandTotal,
      },
    })
    toast.success('تم تجهيز فاتورة المالية من المبلغ السابق')
  }

  useEffect(()=>{
    if(!report) return
    let cancelled=false
    setPreviewing(true)
    ;(async()=>{
      try{
        const url = await getThermalFinancialReportPreview(report)
        if (!cancelled) setPreviewUrl(url)
      }catch(e){
        if(!cancelled) {
          setPreviewUrl('')
          toast.error(e.message||'تعذّر تجهيز معاينة الطباعة')
        }
      }finally{
        if(!cancelled) setPreviewing(false)
      }
    })()
    return()=>{cancelled=true}
  },[report])

  const printReport=async()=>{
    if(!report) return toast.error('اعرض التقرير أولاً')
    if(!(report.rows||[]).length) return toast.error('لا توجد مبيعات ضمن الفترة')
    setPrinting(true)
    try{
      await printThermalFinancialReport(report)
      toast.success('تم إرسال التقرير إلى طابعة الفواتير')
    }catch(e){
      toast.error(e.message||'تعذّرت طباعة التقرير')
    }finally{
      setPrinting(false)
    }
  }

  const currency=report?.currency||'SYP'
  const rows=report?.rows||[]
  const totals=report?.totals||{}

  return <div className="space-y-5" dir="rtl">
    <PageHeader
      title="تقارير المالية"
      subtitle="كشف المبيعات والضريبة — يطبع على نفس طابعة الفواتير"
    />

    <section className="bg-white rounded-2xl shadow-card border-2 border-fuchsia/20 p-5">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-fuchsia/10 text-fuchsia flex items-center justify-center shrink-0">
          <Calculator size={19}/>
        </div>
        <div>
          <h2 className="font-black text-brand-dark">إصدار فاتورة مالية من مبلغ مبيعات سابق</h2>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-3 items-end">
        <div>
          <label className="text-xs font-black text-brand-gray block mb-1">من تاريخ</label>
          <input type="date" value={legacyStart} onChange={e=>setLegacyStart(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold"/>
        </div>
        <div>
          <label className="text-xs font-black text-brand-gray block mb-1">إلى تاريخ</label>
          <input type="date" value={legacyEnd} onChange={e=>setLegacyEnd(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold"/>
        </div>
        <div>
          <label className="text-xs font-black text-brand-gray block mb-1">نقطة البيع</label>
          <select value={legacyCenter} onChange={e=>setLegacyCenter(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold bg-white">
            {branches.map(b=><option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-black text-brand-gray block mb-1">مبلغ المبيعات السابق</label>
          <input type="number" min="0" step="1" value={legacyAmount} onChange={e=>setLegacyAmount(e.target.value)}
            placeholder="مثال: 10000000"
            className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-black"/>
        </div>
        <button onClick={buildLegacyReport}
          className="px-5 py-2.5 rounded-xl bg-fuchsia text-white font-black flex items-center justify-center gap-2">
          <FileText size={16}/> إنشاء فاتورة المالية
        </button>
      </div>
      {!!legacyAmount && Number(legacyAmount)>0 && (
        <div className="mt-4 grid sm:grid-cols-3 gap-2 text-xs font-bold">
          <div className="rounded-xl bg-brand-bg p-3"><span className="text-brand-gray block mb-1">المبلغ الأساسي</span>{money(Number(legacyAmount))}</div>
          <div className="rounded-xl bg-brand-bg p-3"><span className="text-brand-gray block mb-1">الضريبة</span>{money((Number(legacyAmount)*0.05)+(Number(legacyAmount)*0.05*0.05))}</div>
          <div className="rounded-xl bg-brand-dark text-white p-3"><span className="text-white/60 block mb-1">الإجمالي</span>{money(Number(legacyAmount)*1.0525)}</div>
        </div>
      )}
    </section>

    <section className="bg-white rounded-2xl shadow-card border border-brand-border p-5">
      <div className="mb-4">
        <h2 className="font-black text-brand-dark">تقرير المبيعات المسجلة على النظام</h2>
        <p className="text-xs text-brand-gray font-bold mt-1">للاطلاع على المبيعات الموجودة فعلياً داخل عجينة وطحينة.</p>
      </div>
      <div className="grid md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs font-black text-brand-gray block mb-1">من تاريخ</label>
          <input type="date" value={start} onChange={e=>setStart(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold"/>
        </div>
        <div>
          <label className="text-xs font-black text-brand-gray block mb-1">إلى تاريخ</label>
          <input type="date" value={end} onChange={e=>setEnd(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold"/>
        </div>
        <div>
          <label className="text-xs font-black text-brand-gray block mb-1">نقطة البيع</label>
          <select value={center} onChange={e=>setCenter(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold bg-white">
            <option value="all">كل نقاط البيع</option>
            {branches.map(b=><option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        <button onClick={load} disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
          <RefreshCw size={16}/>{loading?'جاري التحميل…':'عرض التقرير'}
        </button>
      </div>
    </section>

    <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <section className="bg-white rounded-2xl shadow-card border border-brand-border overflow-hidden">
        <div className="p-5 border-b border-brand-border">
          <h2 className="font-black text-brand-dark flex items-center gap-2">
            <FileText size={18}/> إجمالي المبيعات من تاريخ {start} إلى تاريخ {end}
          </h2>
          <p className="text-xs text-brand-gray font-bold mt-1">عجينة وطحينة · {rows.length} نقطة بيع</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-brand-bg text-brand-gray">
              <tr>
                {['اسم نقطة البيع','قيمة المأكولات والمشروبات','الضريبة','المجموع']
                  .map(x=><th key={x} className="p-3 text-right font-black">{x}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row=><tr key={row.centerId||'hq'} className="border-t border-brand-border">
                <td className="p-3 font-black text-brand-dark">
                  {row.pointOfSale}
                  <div className="text-[11px] text-brand-gray mt-1">{row.manual ? 'مبلغ إجمالي من البرنامج السابق' : `${row.ordersCount} فاتورة`}</div>
                </td>
                <td className="p-3 font-bold">{money(row.foodAndBeverageValue,currency)}</td>
                <td className="p-3 font-bold">{money(Number(row.consumptionTax||0)+Number(row.localAdministration||0),currency)}</td>
                <td className="p-3 font-black text-fuchsia">{money(row.grandTotal,currency)}</td>
              </tr>)}
              {!rows.length&&!loading&&<tr>
                <td colSpan="4" className="p-10 text-center text-brand-gray font-bold">لا توجد مبيعات ضمن الفترة</td>
              </tr>}
            </tbody>
            {!!rows.length&&<tfoot>
              <tr className="border-t-2 border-brand-dark bg-brand-bg font-black">
                <td className="p-3">الإجمالي</td>
                <td className="p-3">{money(totals.foodAndBeverageValue,currency)}</td>
                <td className="p-3">{money(Number(totals.consumptionTax||0)+Number(totals.localAdministration||0),currency)}</td>
                <td className="p-3 text-fuchsia">{money(totals.grandTotal,currency)}</td>
              </tr>
            </tfoot>}
          </table>
        </div>
      </section>

      <aside className="xl:sticky xl:top-5">
        <div className="bg-white rounded-2xl shadow-card border border-brand-border overflow-hidden">
          <div className="p-4 border-b border-brand-border flex items-center gap-2">
            <Eye size={17} className="text-fuchsia"/>
            <div>
              <div className="font-black text-brand-dark">معاينة الطباعة الحرارية</div>
              <div className="text-[11px] text-brand-gray font-bold">هذا الشكل يخرج من طابعة الفواتير</div>
            </div>
          </div>

          <div className="p-4 bg-[#ece9e3] flex justify-center max-h-[650px] overflow-auto">
            {previewing ? (
              <div className="w-[300px] min-h-[420px] bg-white shadow-xl flex items-center justify-center text-brand-gray font-bold">
                جاري تجهيز المعاينة…
              </div>
            ) : previewUrl ? (
              <img src={previewUrl} alt="معاينة التقرير الحراري"
                className="w-full max-w-[330px] h-auto bg-white shadow-xl"/>
            ) : (
              <div className="w-[300px] min-h-[420px] bg-white shadow-xl p-5 text-center flex items-center justify-center text-brand-gray font-bold">
                اختر الفترة واضغط عرض التقرير
              </div>
            )}
          </div>

          <div className="p-4">
            <button onClick={printReport} disabled={printing||loading||!rows.length}
              className="w-full px-4 py-3 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
              <Printer size={17}/>
              {printing?'جاري الإرسال للطابعة…':'طباعة على طابعة الفواتير'}
            </button>
            <p className="text-[11px] text-brand-gray font-bold leading-5 mt-3">
              يستخدم نفس طابعة الكاشير ونفس إعداداتها. إذا اخترت كل نقاط البيع، يظهر كل فرع بقسم مستقل ثم الإجمالي العام.
            </p>
          </div>
        </div>
      </aside>
    </div>

  </div>
}
