import { useEffect, useMemo, useState } from 'react'
import { FileText, Printer, RefreshCw } from 'lucide-react'
import { api } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import toast from 'react-hot-toast'

const today = () => new Date().toISOString().slice(0,10)
const monthStart = () => today().slice(0,8) + '01'
const nextDay = value => { const d = new Date(value + 'T00:00:00'); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10) }
const money = (value,currency='SYP') =>
  new Intl.NumberFormat('ar-SY',{maximumFractionDigits:2}).format(Number(value||0)) + (currency==='SYP'?' ل.س':' '+currency)

export default function FinancialReportsPage(){
  const [start,setStart]=useState(monthStart())
  const [end,setEnd]=useState(today())
  const [center,setCenter]=useState('all')
  const [branches,setBranches]=useState([])
  const [report,setReport]=useState(null)
  const [loading,setLoading]=useState(true)

  const load=async()=>{
    setLoading(true)
    try{
      const [s,r]=await Promise.all([
        api.get('/finance/settings'),
        api.get('/finance/report',{params:{start,end:nextDay(end),center}}),
      ])
      setBranches(s.data.branches||[])
      setReport(r.data)
    }catch(e){toast.error(e.message||'تعذّر تحميل تقرير المالية')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])

  const currency=report?.currency||'SYP'
  const rows=report?.rows||[]
  const totals=report?.totals||{}

  const printableRows=useMemo(()=>rows.map((row,i)=>`
    <tr>
      <td>${i+1}</td><td class="name">${row.pointOfSale}</td>
      <td>${money(row.foodAndBeverageValue,currency)}</td>
      <td>${money(row.consumptionTax,currency)}</td>
      <td>${money(row.localAdministration,currency)}</td>
      <td class="strong">${money(row.grandTotal,currency)}</td>
    </tr>`).join(''),[rows,currency])

  const printReport=()=>{
    const w=window.open('','_blank','width=1100,height=800')
    if(!w) return toast.error('المتصفح منع نافذة الطباعة')
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
      <title>تقارير المالية - عجينة وطحينة</title>
      <style>
        *{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#111;margin:28px;direction:rtl}
        .head{text-align:center;margin-bottom:22px}.brand{font-size:20px;font-weight:800;margin-bottom:6px}
        h1{font-size:22px;margin:8px 0}.period{font-size:15px;font-weight:700}
        table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
        th,td{border:1px solid #222;padding:10px 8px;text-align:center}
        th{background:#efefef;font-weight:800}.name{text-align:right;font-weight:700}.strong{font-weight:900}
        tfoot td{font-weight:900;background:#f5f5f5}.notes{margin-top:18px;font-size:12px;line-height:1.8}
        @media print{body{margin:10mm}}
      </style></head><body>
      <div class="head"><div class="brand">عجينة وطحينة</div>
        <h1>إجمالي المبيعات من تاريخ ${start} إلى تاريخ ${end}</h1>
        <div class="period">تقرير نقاط البيع</div>
      </div>
      <table><thead><tr>
        <th>#</th><th>اسم نقطة البيع</th><th>قيمة المأكولات والمشروبات</th>
        <th>الإنفاق الاستهلاكي 5%</th><th>الإدارة المحلية 5%</th><th>المجموع</th>
      </tr></thead><tbody>${printableRows||'<tr><td colspan="6">لا توجد مبيعات ضمن الفترة</td></tr>'}</tbody>
      <tfoot><tr><td colspan="2">الإجمالي</td>
        <td>${money(totals.foodAndBeverageValue,currency)}</td>
        <td>${money(totals.consumptionTax,currency)}</td>
        <td>${money(totals.localAdministration,currency)}</td>
        <td>${money(totals.grandTotal,currency)}</td>
      </tr></tfoot></table>
      <div class="notes">الإنفاق الاستهلاكي: 5% من قيمة المأكولات والمشروبات.<br>
      الإدارة المحلية: 5% من قيمة الإنفاق الاستهلاكي.</div>
      <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  return <div className="space-y-5" dir="rtl">
    <PageHeader title="تقارير المالية" subtitle="كشف المبيعات والإنفاق الاستهلاكي والإدارة المحلية حسب نقطة البيع"/>

    <section className="bg-white rounded-2xl shadow-card border border-brand-border p-5">
      <div className="grid md:grid-cols-4 gap-3 items-end">
        <div><label className="text-xs font-black text-brand-gray block mb-1">من تاريخ</label><input type="date" value={start} onChange={e=>setStart(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold"/></div>
        <div><label className="text-xs font-black text-brand-gray block mb-1">إلى تاريخ</label><input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold"/></div>
        <div><label className="text-xs font-black text-brand-gray block mb-1">نقطة البيع</label>
          <select value={center} onChange={e=>setCenter(e.target.value)} className="w-full px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold bg-white">
            <option value="all">كل نقاط البيع</option>
            {branches.map(b=><option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        <button onClick={load} disabled={loading} className="px-5 py-2.5 rounded-xl bg-brand-dark text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
          <RefreshCw size={16}/>{loading?'جاري التحميل…':'عرض التقرير'}
        </button>
      </div>
    </section>

    <section className="bg-white rounded-2xl shadow-card border border-brand-border overflow-hidden">
      <div className="p-5 border-b border-brand-border flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-black text-brand-dark flex items-center gap-2"><FileText size={18}/> إجمالي المبيعات من تاريخ {start} إلى تاريخ {end}</h2>
          <p className="text-xs text-brand-gray font-bold mt-1">عجينة وطحينة · {rows.length} نقطة بيع</p></div>
        <button onClick={printReport} className="px-4 py-2.5 rounded-xl bg-brand-dark text-white font-black flex items-center gap-2"><Printer size={16}/> طباعة / حفظ PDF</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-brand-bg text-brand-gray"><tr>
            {['اسم نقطة البيع','قيمة المأكولات والمشروبات','الإنفاق الاستهلاكي 5%','الإدارة المحلية 5%','المجموع'].map(x=><th key={x} className="p-3 text-right font-black">{x}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(row=><tr key={row.centerId||'hq'} className="border-t border-brand-border">
              <td className="p-3 font-black text-brand-dark">{row.pointOfSale}<div className="text-[11px] text-brand-gray mt-1">{row.ordersCount} فاتورة</div></td>
              <td className="p-3 font-bold">{money(row.foodAndBeverageValue,currency)}</td>
              <td className="p-3 font-bold">{money(row.consumptionTax,currency)}</td>
              <td className="p-3 font-bold">{money(row.localAdministration,currency)}</td>
              <td className="p-3 font-black text-fuchsia">{money(row.grandTotal,currency)}</td>
            </tr>)}
            {!rows.length&&!loading&&<tr><td colSpan="5" className="p-10 text-center text-brand-gray font-bold">لا توجد مبيعات ضمن الفترة</td></tr>}
          </tbody>
          {!!rows.length&&<tfoot><tr className="border-t-2 border-brand-dark bg-brand-bg font-black">
            <td className="p-3">الإجمالي</td>
            <td className="p-3">{money(totals.foodAndBeverageValue,currency)}</td>
            <td className="p-3">{money(totals.consumptionTax,currency)}</td>
            <td className="p-3">{money(totals.localAdministration,currency)}</td>
            <td className="p-3 text-fuchsia">{money(totals.grandTotal,currency)}</td>
          </tr></tfoot>}
        </table>
      </div>
      <div className="p-4 text-xs text-brand-gray font-bold border-t border-brand-border">
        الإدارة المحلية 5% محسوبة من قيمة الإنفاق الاستهلاكي، وليس من أصل قيمة الفاتورة.
      </div>
    </section>
  </div>
}
