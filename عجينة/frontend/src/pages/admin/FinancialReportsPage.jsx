import { useEffect, useState } from 'react'
import { FileText, Printer, RefreshCw, Eye, Calculator, FileDown, History, Search, X, WalletCards } from 'lucide-react'
import { api, shiftsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import toast from 'react-hot-toast'
import { getThermalFinancialReportPreview, printThermalFinancialReport } from '../../services/thermalPrinter'
import { exportFinancialReportPdf } from '../../utils/financialPdf'

const syriaDay = (offsetDays = 0) =>
  new Date(Date.now() + (3 * 60 * 60 * 1000) + (offsetDays * 24 * 60 * 60 * 1000))
    .toISOString().slice(0,10)
const today = () => syriaDay(0)
const yesterday = () => syriaDay(-1)
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
  const [invoiceMode,setInvoiceMode]=useState('combined')
  const [legacyStart,setLegacyStart]=useState('2026-10-01')
  const [legacyEnd,setLegacyEnd]=useState(today())
  const [legacyCenter,setLegacyCenter]=useState('hq')
  const [legacyAmount,setLegacyAmount]=useState('')
  const [view,setView]=useState('finance')
  const [shifts,setShifts]=useState([])
  const [shiftLoading,setShiftLoading]=useState(false)
  const [selectedShift,setSelectedShift]=useState(null)
  const [shiftFilters,setShiftFilters]=useState({
    from:monthStart(), to:today(), status:'all', cashier:'', center:'all',
  })

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
        taxTotal:consumptionTax+localAdministration,
        investorInternal:0,
        investorExternal:0,
        investorShare:0,
        obligationsTotal:consumptionTax+localAdministration,
        grandTotal,
      }],
      totals:{
        ordersCount:null,
        foodAndBeverageValue:amount,
        consumptionTax,
        localAdministration,
        taxTotal:consumptionTax+localAdministration,
        investorInternal:0,
        investorExternal:0,
        investorShare:0,
        obligationsTotal:consumptionTax+localAdministration,
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
        const url = await getThermalFinancialReportPreview(report,invoiceMode)
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
  },[report,invoiceMode])

  const printReport=async()=>{
    if(!report) return toast.error('اعرض التقرير أولاً')
    if(!(report.rows||[]).length) return toast.error('لا توجد مبيعات ضمن الفترة')
    if(report.source==='legacy_manual'&&invoiceMode==='americans') return toast.error('المبلغ السابق لا يوضح مبيعات بالمحل والسفري، لذلك لا يمكن إصدار فاتورة الأميركان منه')
    setPrinting(true)
    try{
      await printThermalFinancialReport(report,invoiceMode)
      toast.success('تم إرسال التقرير إلى طابعة الفواتير')
    }catch(e){
      toast.error(e.message||'تعذّرت طباعة التقرير')
    }finally{
      setPrinting(false)
    }
  }

  const exportPdf=()=>{
    try{
      if(report?.source==='legacy_manual'&&invoiceMode==='americans') return toast.error('المبلغ السابق لا يوضح مبيعات بالمحل والسفري، لذلك لا يمكن إصدار فاتورة الأميركان منه')
      exportFinancialReportPdf(report,{
        brandName:'عجينة وطحينة',
        logoUrl:'/logo.png',
        mode:invoiceMode,
        fileTitle:invoiceMode==='finance'?'فاتورة المالية والضرائب':invoiceMode==='americans'?'فاتورة الأميركان':'فاتورة المالية والأميركان',
        colors:{
          dark:'#352017', accent:'#A96734', soft:'#F6EDDF',
          paper:'#FBF7F0', line:'#E7D2B7', muted:'#6B5A4A',
        },
        note:'الضريبة = الإنفاق الاستهلاكي + الإدارة المحلية. التقرير مرتب من اليمين إلى اليسار ومهيأ للطباعة أو الحفظ بصيغة PDF.',
      })
    }catch(e){
      toast.error(e.message||'تعذّر تجهيز ملف PDF')
    }
  }


  const loadShifts=async()=>{
    setShiftLoading(true)
    try{
      const params={
        from:shiftFilters.from||undefined,
        to:shiftFilters.to||undefined,
        status:shiftFilters.status==='all'?undefined:shiftFilters.status,
        cashier:shiftFilters.cashier||undefined,
        limit:500,
      }
      params.center=shiftFilters.center
      const response=await shiftsAPI.list(params)
      setShifts(response.data.shifts||[])
    }catch(e){
      toast.error(e.message||'تعذّر تحميل أرشيف الورديات')
    }finally{
      setShiftLoading(false)
    }
  }

  useEffect(()=>{
    if(view==='shifts') loadShifts()
  },[view])

  const stamp=value=>value?new Date(value).toLocaleString('ar-SY',{
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
  }):'—'
  const branchName=id=>{
    if(!id) return 'الفرع الرئيسي'
    return branches.find(b=>String(b._id)===String(id))?.name||'فرع'
  }
  const shiftTotals=shifts.reduce((acc,s)=>{
    acc.sales+=Number(s.summary?.sales||0)
    acc.expected+=Number(s.expectedCash||0)
    acc.counted+=Number(s.countedCash||0)
    acc.difference+=Number(s.difference||0)
    return acc
  },{sales:0,expected:0,counted:0,difference:0})

  const currency=report?.currency||'SYP'
  const rows=report?.rows||[]
  const totals=report?.totals||{}

  return <div className="space-y-5" dir="rtl">
    <PageHeader
      title="المالية والورديات"
      subtitle="كل المالية ونسبة الأميركان والضرائب وأرشيف الورديات في مكان واحد"
    />

    <div className="bg-white rounded-2xl border border-brand-border p-1.5 flex gap-1 shadow-card">
      <button type="button" onClick={()=>setView('finance')}
        className={`flex-1 px-4 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${view==='finance'?'bg-brand-dark text-white':'text-brand-gray hover:bg-brand-bg'}`}>
        <WalletCards size={17}/> الملخص المالي
      </button>
      <button type="button" onClick={()=>setView('shifts')}
        className={`flex-1 px-4 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${view==='shifts'?'bg-brand-dark text-white':'text-brand-gray hover:bg-brand-bg'}`}>
        <History size={17}/> أرشيف الورديات
      </button>
    </div>

    {view==='finance'&&<>

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
        <div className="mt-4 grid sm:grid-cols-5 gap-2 text-xs font-bold">
          <div className="rounded-xl bg-brand-bg p-3"><span className="text-brand-gray block mb-1">المبلغ الأساسي</span>{money(Number(legacyAmount))}</div>
          <div className="rounded-xl bg-brand-bg p-3"><span className="text-brand-gray block mb-1">إنفاق استهلاكي (5%)</span>{money(Number(legacyAmount)*0.05)}</div>
          <div className="rounded-xl bg-brand-bg p-3"><span className="text-brand-gray block mb-1">إدارة محلية (5%)</span>{money(Number(legacyAmount)*0.05*0.05)}</div>
          <div className="rounded-xl bg-brand-dark text-white p-3"><span className="text-white/60 block mb-1">الإجمالي</span>{money(Number(legacyAmount)*1.0525)}</div>
          <div className="rounded-xl bg-fuchsia/10 text-fuchsia p-3"><span className="block mb-1">الضريبة</span>{money((Number(legacyAmount)*0.05)+(Number(legacyAmount)*0.05*0.05))}</div>
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
        <div className="flex gap-2">
          <button type="button" onClick={() => { const d = yesterday(); setStart(d); setEnd(d) }}
            className="px-4 py-2.5 rounded-xl bg-brand-bg text-brand-dark font-black border border-brand-border">
            أمس
          </button>
          <button onClick={load} disabled={loading}
            className="flex-1 px-5 py-2.5 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
            <RefreshCw size={16}/>{loading?'جاري التحميل…':'عرض التقرير'}
          </button>
        </div>
      </div>
    </section>


    {!!rows.length&&<section className="space-y-3">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white border border-brand-border rounded-2xl p-4">
          <div className="text-xs font-black text-brand-gray mb-2">قيمة المبيعات قبل الضريبة</div>
          <div className="text-xl font-black text-brand-dark">{money(totals.foodAndBeverageValue,currency)}</div>
        </div>
        <div className="bg-white border border-brand-border rounded-2xl p-4">
          <div className="text-xs font-black text-brand-gray mb-2">إجمالي الضرائب</div>
          <div className="text-xl font-black text-amber-700">{money(totals.taxTotal,currency)}</div>
        </div>
        <div className="bg-white border border-brand-border rounded-2xl p-4">
          <div className="text-xs font-black text-brand-gray mb-2">إجمالي نسبة {report?.investor?.name||'الأميركان'}</div>
          <div className="text-xl font-black text-fuchsia">{money(totals.investorShare,currency)}</div>
        </div>
        <div className="bg-brand-dark text-white rounded-2xl p-4 shadow-card">
          <div className="text-xs font-black text-white/65 mb-2">إجمالي الالتزامات</div>
          <div className="text-xl font-black">{money(totals.obligationsTotal,currency)}</div>
          <div className="text-[11px] font-bold text-white/60 mt-1">الضرائب + نسبة الأميركان</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <div className="bg-white border border-brand-border rounded-2xl p-5">
          <h3 className="font-black text-brand-dark mb-4">الضرائب — مستقلة</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="font-bold text-brand-gray">الإنفاق الاستهلاكي 5%</span><b>{money(totals.consumptionTax,currency)}</b></div>
            <div className="flex justify-between"><span className="font-bold text-brand-gray">الإدارة المحلية 5%</span><b>{money(totals.localAdministration,currency)}</b></div>
            <div className="flex justify-between border-t border-brand-border pt-3"><span className="font-black">إجمالي الضريبة</span><b className="text-amber-700">{money(totals.taxTotal,currency)}</b></div>
          </div>
        </div>
        <div className="bg-white border border-brand-border rounded-2xl p-5">
          <h3 className="font-black text-brand-dark mb-4">نسبة {report?.investor?.name||'الأميركان'} — مستقلة</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="font-bold text-brand-gray">بالمحل ({report?.investor?.internalPercent??20}%)</span><b>{money(totals.investorInternal,currency)}</b></div>
            <div className="flex justify-between"><span className="font-bold text-brand-gray">سفري / توصيل ({report?.investor?.deliveryPercent??15}%)</span><b>{money(totals.investorExternal,currency)}</b></div>
            <div className="flex justify-between border-t border-brand-border pt-3"><span className="font-black">إجمالي النسبة</span><b className="text-fuchsia">{money(totals.investorShare,currency)}</b></div>
          </div>
        </div>
      </div>
    </section>}

    <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <section className="bg-white rounded-2xl shadow-card border border-brand-border overflow-hidden">
        <div className="p-5 border-b border-brand-border">
          <h2 className="font-black text-brand-dark flex items-center gap-2">
            <FileText size={18}/> إجمالي المبيعات من تاريخ {start} إلى تاريخ {end}
          </h2>
          <p className="text-xs text-brand-gray font-bold mt-1">عجينة وطحينة · {rows.length} نقطة بيع</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-brand-bg text-brand-gray">
              <tr>
                {['نقطة البيع','الفواتير','المبيعات قبل الضريبة','الضريبة','نسبة الأميركان','إجمالي الالتزامات','الإجمالي مع الضريبة']
                  .map(x=><th key={x} className="p-3 text-right font-black">{x}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row=><tr key={row.centerId||'hq'} className="border-t border-brand-border">
                <td className="p-3 font-black text-brand-dark">
                  {row.pointOfSale}
                  {row.manual&&<div className="text-[11px] text-brand-gray mt-1">مبلغ إجمالي من البرنامج السابق</div>}
                </td>
                <td className="p-3 font-bold">{row.manual?'—':row.ordersCount}</td>
                <td className="p-3 font-bold">{money(row.foodAndBeverageValue,currency)}</td>
                <td className="p-3 font-black text-amber-700">{money(row.taxTotal??(Number(row.consumptionTax||0)+Number(row.localAdministration||0)),currency)}</td>
                <td className="p-3 font-black text-fuchsia">{money(row.investorShare,currency)}</td>
                <td className="p-3 font-black">{money(row.obligationsTotal??((Number(row.consumptionTax||0)+Number(row.localAdministration||0))+Number(row.investorShare||0)),currency)}</td>
                <td className="p-3 font-black text-brand-dark">{money(row.grandTotal,currency)}</td>
              </tr>)}
              {!rows.length&&!loading&&<tr>
                <td colSpan="7" className="p-10 text-center text-brand-gray font-bold">لا توجد مبيعات ضمن الفترة</td>
              </tr>}
            </tbody>
            {!!rows.length&&<tfoot>
              <tr className="border-t-2 border-brand-dark bg-brand-bg font-black">
                <td className="p-3">الإجمالي</td>
                <td className="p-3">{totals.ordersCount??'—'}</td>
                <td className="p-3">{money(totals.foodAndBeverageValue,currency)}</td>
                <td className="p-3 text-amber-700">{money(totals.taxTotal,currency)}</td>
                <td className="p-3 text-fuchsia">{money(totals.investorShare,currency)}</td>
                <td className="p-3">{money(totals.obligationsTotal,currency)}</td>
                <td className="p-3">{money(totals.grandTotal,currency)}</td>
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
          <div className="p-4 border-b border-brand-border">
            <div className="text-xs font-black text-brand-gray mb-2">نوع الفاتورة</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['finance','المالية'],
                ['americans','الأميركان'],
                ['combined','مشتركة'],
              ].map(([value,label])=><button key={value} type="button"
                onClick={()=>setInvoiceMode(value)}
                disabled={report?.source==='legacy_manual'&&value==='americans'}
                className={`px-2 py-2.5 rounded-xl text-xs font-black border-2 transition-all disabled:opacity-35 disabled:cursor-not-allowed ${invoiceMode===value?'bg-brand-dark text-white border-brand-dark':'bg-white text-brand-gray border-brand-border hover:border-fuchsia/50'}`}>
                {label}
              </button>)}
            </div>
            <p className="text-[11px] text-brand-gray font-bold mt-2 leading-5">
              {invoiceMode==='finance'?'تطبع الضرائب والتفاصيل المالية فقط.':invoiceMode==='americans'?'تطبع مستحقات الأميركان فقط بدون الضرائب.':'تطبع المالية والأميركان معاً وإجمالي الالتزامات.'}
            </p>
            {report?.source==='legacy_manual'&&<p className="text-[10px] text-amber-700 font-black mt-1">فاتورة الأميركان غير متاحة للمبلغ السابق لأنه لا يحدد توزيع بالمحل / سفري.</p>}
          </div>

          <div className="p-4 bg-[#ece9e3] flex justify-center max-h-[650px] overflow-auto">
            {previewing ? (
              <div className="w-[300px] min-h-[420px] bg-white shadow-xl flex items-center justify-center text-brand-gray font-bold">
                جاري تجهيز المعاينة…
              </div>
            ) : previewUrl ? (
              <img src={previewUrl} alt="معاينة التقرير الحراري"
                className="block w-[310px] max-w-full h-auto object-contain bg-white shadow-xl rounded-sm"/>
            ) : (
              <div className="w-[300px] min-h-[420px] bg-white shadow-xl p-5 text-center flex items-center justify-center text-brand-gray font-bold">
                اختر الفترة واضغط عرض التقرير
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="space-y-2.5">
              <button onClick={printReport} disabled={printing||loading||!rows.length}
                className="w-full px-4 py-3 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
                <Printer size={17}/>
                {printing?'جاري الإرسال للطابعة…':`طباعة حرارية — ${invoiceMode==='finance'?'المالية':invoiceMode==='americans'?'الأميركان':'مشتركة'}`}
              </button>
              <button onClick={exportPdf} disabled={loading||!rows.length}
                className="w-full px-4 py-3 rounded-xl bg-fuchsia text-white font-black flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm">
                <FileDown size={17}/>
                PDF — {invoiceMode==='finance'?'المالية':invoiceMode==='americans'?'الأميركان':'مشتركة'}
              </button>
            </div>
            <p className="text-[11px] text-brand-gray font-bold leading-5 mt-3">
              اختاري أولاً نوع الفاتورة: مالية فقط، أميركان فقط، أو مشتركة. نفس الاختيار يطبق على الحراري والـPDF.
            </p>
          </div>
        </div>
      </aside>
    </div>

    </>}

    {view==='shifts'&&<div className="space-y-4">
      <section className="bg-white rounded-2xl shadow-card border border-brand-border p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-black text-brand-dark flex items-center gap-2"><History size={19}/> أرشيف الورديات</h2>
            <p className="text-xs text-brand-gray font-bold mt-1">كل الورديات المحفوظة مع البحث والتفاصيل والفرق بالصندوق.</p>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-brand-bg text-xs font-black text-brand-gray">{shifts.length} وردية</span>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-xs font-black text-brand-gray block mb-1">من تاريخ</label>
            <input type="date" value={shiftFilters.from} onChange={e=>setShiftFilters(f=>({...f,from:e.target.value}))}
              className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold"/>
          </div>
          <div>
            <label className="text-xs font-black text-brand-gray block mb-1">إلى تاريخ</label>
            <input type="date" value={shiftFilters.to} onChange={e=>setShiftFilters(f=>({...f,to:e.target.value}))}
              className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold"/>
          </div>
          <div>
            <label className="text-xs font-black text-brand-gray block mb-1">الحالة</label>
            <select value={shiftFilters.status} onChange={e=>setShiftFilters(f=>({...f,status:e.target.value}))}
              className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold bg-white">
              <option value="all">الكل</option>
              <option value="closed">مغلقة</option>
              <option value="open">مفتوحة</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-brand-gray block mb-1">الكاشير</label>
            <div className="relative">
              <Search size={15} className="absolute right-3 top-3 text-brand-gray"/>
              <input value={shiftFilters.cashier} onChange={e=>setShiftFilters(f=>({...f,cashier:e.target.value}))}
                placeholder="اسم الكاشير"
                className="w-full pr-9 pl-3 py-2.5 border-2 border-brand-border rounded-xl font-bold"/>
            </div>
          </div>
          <div>
            <label className="text-xs font-black text-brand-gray block mb-1">الفرع</label>
            <select value={shiftFilters.center} onChange={e=>setShiftFilters(f=>({...f,center:e.target.value}))}
              className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold bg-white">
              <option value="all">كل الفروع</option>
              {branches.map(b=><option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          <button onClick={loadShifts} disabled={shiftLoading}
            className="px-4 py-2.5 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
            <RefreshCw size={15}/>{shiftLoading?'جاري تحميل الورديات…':'بحث'}
          </button>
        </div>
      </section>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-brand-border p-4"><div className="text-xs font-black text-brand-gray">عدد الورديات</div><div className="text-xl font-black mt-2">{shifts.length}</div></div>
        <div className="bg-white rounded-2xl border border-brand-border p-4"><div className="text-xs font-black text-brand-gray">مبيعات الورديات</div><div className="text-xl font-black mt-2">{money(shiftTotals.sales)}</div></div>
        <div className="bg-white rounded-2xl border border-brand-border p-4"><div className="text-xs font-black text-brand-gray">الكاش المفروض</div><div className="text-xl font-black mt-2">{money(shiftTotals.expected)}</div></div>
        <div className="bg-brand-dark text-white rounded-2xl p-4"><div className="text-xs font-black text-white/65">صافي الفروقات</div><div className="text-xl font-black mt-2">{money(shiftTotals.difference)}</div></div>
      </div>

      <section className="bg-white rounded-2xl shadow-card border border-brand-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-brand-bg text-brand-gray">
              <tr>{['الوردية','الفرع','الفتح','الإغلاق','الكاشير','المبيعات','المفروض','المعدود','الفرق','الحالة',''].map(h=><th key={h} className="p-3 text-right font-black">{h}</th>)}</tr>
            </thead>
            <tbody>
              {shifts.map(s=>{
                const diff=Number(s.difference||0)
                return <tr key={s._id} className="border-t border-brand-border hover:bg-brand-bg/50">
                  <td className="p-3 font-black">#{s.number}</td>
                  <td className="p-3 font-bold">{branchName(s.centerId)}</td>
                  <td className="p-3 font-bold text-xs">{stamp(s.openedAt)}</td>
                  <td className="p-3 font-bold text-xs">{stamp(s.closedAt)}</td>
                  <td className="p-3 font-bold">{s.openedByName||'—'}</td>
                  <td className="p-3 font-black">{money(s.summary?.sales||0)}</td>
                  <td className="p-3 font-bold">{money(s.expectedCash||0)}</td>
                  <td className="p-3 font-bold">{s.countedCash==null?'—':money(s.countedCash)}</td>
                  <td className={`p-3 font-black ${diff===0?'text-green-600':diff>0?'text-blue-600':'text-red-500'}`}>{diff===0?'مطابق':(diff>0?'+':'−')+money(Math.abs(diff))}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded-lg text-xs font-black ${s.status==='open'?'bg-green-50 text-green-700':'bg-slate-100 text-slate-600'}`}>{s.status==='open'?'مفتوحة':'مغلقة'}</span></td>
                  <td className="p-3"><button onClick={()=>setSelectedShift(s)} className="px-3 py-1.5 rounded-lg bg-brand-dark text-white text-xs font-black">تفاصيل</button></td>
                </tr>
              })}
              {!shifts.length&&!shiftLoading&&<tr><td colSpan="11" className="p-12 text-center font-bold text-brand-gray">لا توجد ورديات ضمن الفلاتر المحددة</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selectedShift&&<div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4" onClick={()=>setSelectedShift(null)}>
        <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-auto rounded-3xl shadow-2xl" onClick={e=>e.stopPropagation()}>
          <div className="p-5 border-b border-brand-border flex items-center justify-between sticky top-0 bg-white z-10">
            <div>
              <h3 className="font-black text-xl text-brand-dark">تفاصيل الوردية #{selectedShift.number}</h3>
              <div className="text-xs font-bold text-brand-gray mt-1">{branchName(selectedShift.centerId)} · {selectedShift.businessDay||''}</div>
            </div>
            <button onClick={()=>setSelectedShift(null)} className="w-9 h-9 rounded-xl bg-brand-bg flex items-center justify-center"><X size={18}/></button>
          </div>
          <div className="p-5 space-y-5">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-brand-bg p-4"><div className="text-xs font-bold text-brand-gray">فتحت</div><div className="font-black mt-1">{stamp(selectedShift.openedAt)}</div><div className="text-xs mt-1">{selectedShift.openedByName||'—'}</div></div>
              <div className="rounded-2xl bg-brand-bg p-4"><div className="text-xs font-bold text-brand-gray">أغلقت</div><div className="font-black mt-1">{stamp(selectedShift.closedAt)}</div><div className="text-xs mt-1">{selectedShift.closedByName||'—'}</div></div>
            </div>
            <div>
              <h4 className="font-black text-brand-dark mb-3">حركة الوردية</h4>
              <div className="grid sm:grid-cols-2 gap-x-6 text-sm">
                {[
                  ['عدد الطلبات',selectedShift.summary?.ordersCount||0],
                  ['المبيعات',money(selectedShift.summary?.sales||0)],
                  ['نقداً',money(selectedShift.summary?.cashSales||0)],
                  ['بطاقة',money(selectedShift.summary?.cardSales||0)],
                  ['آجل',money(selectedShift.summary?.unpaidSales||0)],
                  ['رصيد الافتتاح',money(selectedShift.openingCash||0)],
                  ['الكاش المفروض',money(selectedShift.expectedCash||0)],
                  ['المعدود فعلياً',selectedShift.countedCash==null?'—':money(selectedShift.countedCash)],
                  ['الزيادة / النقص',money(selectedShift.difference||0)],
                  ...(selectedShift.handedOverCash!==undefined?[['المبلغ المسلّم',money(selectedShift.handedOverCash||0)]]:[]),
                  ...(selectedShift.nextOpeningCash!==undefined?[['المتبقي للوردية التالية',money(selectedShift.nextOpeningCash||0)]]:[]),
                ].map(([l,v])=><div key={l} className="flex justify-between gap-3 py-2.5 border-b border-brand-border"><span className="font-bold text-brand-gray">{l}</span><b>{v}</b></div>)}
              </div>
            </div>
            {!!selectedShift.summary?.byType?.length&&<div>
              <h4 className="font-black text-brand-dark mb-3">حسب نوع الطلب</h4>
              <div className="grid sm:grid-cols-3 gap-2">
                {selectedShift.summary.byType.map((x,i)=><div key={i} className="rounded-xl bg-brand-bg p-3"><div className="text-xs font-bold text-brand-gray">{x.orderType==='dine_in'?'بالمحل':x.orderType==='takeaway'?'سفري':x.orderType==='delivery'?'توصيل':x.orderType}</div><div className="font-black mt-1">{x.count} طلب · {money(x.total)}</div></div>)}
              </div>
            </div>}
            {selectedShift.notes&&<div className="rounded-2xl border border-brand-border p-4"><div className="text-xs font-black text-brand-gray mb-1">ملاحظات</div><div className="font-bold">{selectedShift.notes}</div></div>}
          </div>
        </div>
      </div>}
    </div>}

  </div>
}
