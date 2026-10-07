import { useEffect, useState } from 'react'
import { FileText, Printer, RefreshCw, Eye, FileDown, History, Search, X, WalletCards } from 'lucide-react'
import { api, shiftsAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import toast from 'react-hot-toast'
import { renderFinancialReport } from '../../utils/ticketRenderer'
import { printToStation } from '../../utils/printTicket'
import { exportFinancialReportPdf } from '../../utils/financialPdf'

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
  const [raster,setRaster]=useState(null)
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
    if(!report) return
    let cancelled=false
    setPreviewing(true)
    ;(async()=>{
      try{
        const rendered = await renderFinancialReport(report)
        if (!cancelled) {
          setRaster(rendered)
          setPreviewUrl(rendered.previewUrl)
        }
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
      const rendered = raster || await renderFinancialReport(report)
      toast.success(await printToStation('cashier', rendered))
    }catch(e){
      toast.error(e.message||'تعذّرت طباعة التقرير')
    }finally{
      setPrinting(false)
    }
  }

  const exportPdf=()=>{
    try{
      exportFinancialReportPdf(report,{
        brandName:'لوليز',
        logoUrl:'/brand/luliz-logo-round.png',
        fileTitle:'تقرير المالية والمبيعات',
        colors:{
          dark:'#20160F', accent:'#C18A4A', soft:'#F6EFE6',
          paper:'#FBF7F2', line:'#EAD9C2', muted:'#7A6855',
        },
        note:'نسخة PDF A4 مرتبة من اليمين إلى اليسار ومهيأة للطباعة أو الحفظ والمشاركة.',
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

    <section className="bg-white rounded-2xl shadow-card border border-brand-border p-5">
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
          <p className="text-xs text-brand-gray font-bold mt-1">لوليز · {rows.length} نقطة بيع</p>
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
            <div className="space-y-2.5">
              <button onClick={printReport} disabled={printing||loading||!rows.length}
                className="w-full px-4 py-3 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
                <Printer size={17}/>
                {printing?'جاري الإرسال للطابعة…':'طباعة حرارية'}
              </button>
              <button onClick={exportPdf} disabled={loading||!rows.length}
                className="w-full px-4 py-3 rounded-xl bg-fuchsia text-white font-black flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm">
                <FileDown size={17}/>
                تصدير PDF — A4
              </button>
            </div>
            <p className="text-[11px] text-brand-gray font-bold leading-5 mt-3">
              الحراري يطبع على طابعة الكاشير. زر PDF يفتح نسخة A4 وRTL؛ من نافذة الطباعة اختاري «حفظ بصيغة PDF» لإرسالها أو أرشفتها.
            </p>
          </div>
        </div>
      </aside>
    </div>

    <div className="p-4 rounded-2xl bg-white border border-brand-border text-xs text-brand-gray font-bold">
      الإدارة المحلية 5% محسوبة من قيمة الإنفاق الاستهلاكي، وليس من أصل قيمة الفاتورة.
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
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
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
