import { useEffect, useState } from 'react'
import { FileText, Printer, RefreshCw, Eye } from 'lucide-react'
import { api } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import toast from 'react-hot-toast'
import { renderFinancialReport } from '../../utils/ticketRenderer'
import { printToStation } from '../../utils/printTicket'

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

  const currency=report?.currency||'SYP'
  const rows=report?.rows||[]
  const totals=report?.totals||{}

  return <div className="space-y-5" dir="rtl">
    <PageHeader
      title="تقارير المالية"
      subtitle="كشف المبيعات والإنفاق الاستهلاكي والإدارة المحلية — يطبع على نفس طابعة الفواتير"
    />

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

    <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <section className="bg-white rounded-2xl shadow-card border border-brand-border overflow-hidden">
        <div className="p-5 border-b border-brand-border">
          <h2 className="font-black text-brand-dark flex items-center gap-2">
            <FileText size={18}/> إجمالي المبيعات من تاريخ {start} إلى تاريخ {end}
          </h2>
          <p className="text-xs text-brand-gray font-bold mt-1">لوليز · {rows.length} نقطة بيع</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-brand-bg text-brand-gray">
              <tr>
                {['اسم نقطة البيع','قيمة المأكولات والمشروبات','الإنفاق الاستهلاكي 5%','الإدارة المحلية 5%','المجموع']
                  .map(x=><th key={x} className="p-3 text-right font-black">{x}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row=><tr key={row.centerId||'hq'} className="border-t border-brand-border">
                <td className="p-3 font-black text-brand-dark">
                  {row.pointOfSale}
                  <div className="text-[11px] text-brand-gray mt-1">{row.ordersCount} فاتورة</div>
                </td>
                <td className="p-3 font-bold">{money(row.foodAndBeverageValue,currency)}</td>
                <td className="p-3 font-bold">{money(row.consumptionTax,currency)}</td>
                <td className="p-3 font-bold">{money(row.localAdministration,currency)}</td>
                <td className="p-3 font-black text-fuchsia">{money(row.grandTotal,currency)}</td>
              </tr>)}
              {!rows.length&&!loading&&<tr>
                <td colSpan="5" className="p-10 text-center text-brand-gray font-bold">لا توجد مبيعات ضمن الفترة</td>
              </tr>}
            </tbody>
            {!!rows.length&&<tfoot>
              <tr className="border-t-2 border-brand-dark bg-brand-bg font-black">
                <td className="p-3">الإجمالي</td>
                <td className="p-3">{money(totals.foodAndBeverageValue,currency)}</td>
                <td className="p-3">{money(totals.consumptionTax,currency)}</td>
                <td className="p-3">{money(totals.localAdministration,currency)}</td>
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

    <div className="p-4 rounded-2xl bg-white border border-brand-border text-xs text-brand-gray font-bold">
      الإدارة المحلية 5% محسوبة من قيمة الإنفاق الاستهلاكي، وليس من أصل قيمة الفاتورة.
    </div>
  </div>
}
