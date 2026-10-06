import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, CircleDollarSign, History, Save, UserRoundCheck, Wallet } from 'lucide-react'
import dayjs from 'dayjs'
import { advancesAPI, dailyWagesAPI, employeesAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import { formatCurrency } from '../../utils/formatters'
import toast from 'react-hot-toast'

const TODAY = dayjs().format('YYYY-MM-DD')
const MONTH_START = dayjs().startOf('month').format('YYYY-MM-DD')

const STATUS = {
  present: { label: 'حاضر', cls: 'bg-green-600 text-white' },
  half:    { label: 'نصف يوم', cls: 'bg-amber-500 text-white' },
  absent:  { label: 'غائب', cls: 'bg-red-500 text-white' },
  unmarked:{ label: 'غير مسجل', cls: 'bg-white text-brand-gray border border-brand-border' },
}

export default function PayrollPage() {
  const [date,setDate]=useState(TODAY)
  const [rows,setRows]=useState([])
  const [loadingDay,setLoadingDay]=useState(false)
  const [savingDay,setSavingDay]=useState(false)

  const [from,setFrom]=useState(MONTH_START)
  const [to,setTo]=useState(TODAY)
  const [summary,setSummary]=useState([])
  const [loadingSummary,setLoadingSummary]=useState(false)
  const [settling,setSettling]=useState('')

  const [employees,setEmployees]=useState([])
  const [advModal,setAdvModal]=useState(false)
  const [advEmpId,setAdvEmpId]=useState('')
  const [advAmount,setAdvAmount]=useState('')
  const [advReason,setAdvReason]=useState('')
  const [savingAdv,setSavingAdv]=useState(false)

  const [history,setHistory]=useState(null)

  const loadDay=async()=>{
    setLoadingDay(true)
    try{
      const r=await dailyWagesAPI.day(date)
      setRows(r.data.rows||[])
    }catch(e){toast.error(e.message||'تعذّر تحميل دوام اليوم')}
    finally{setLoadingDay(false)}
  }

  const loadSummary=async()=>{
    setLoadingSummary(true)
    try{
      const r=await dailyWagesAPI.summary(from,to)
      setSummary(r.data.rows||[])
    }catch(e){toast.error(e.message||'تعذّر حساب الأجور')}
    finally{setLoadingSummary(false)}
  }

  useEffect(()=>{loadDay()},[date])
  useEffect(()=>{loadSummary()},[from,to])
  useEffect(()=>{
    employeesAPI.getAll({isActive:true}).then(r=>{
      const list=(r.data.employees||[]).filter(e=>e.payMode==='daily'||Number(e.dailyWage)>0)
      setEmployees(list)
      if(!advEmpId&&list[0]) setAdvEmpId(list[0]._id)
    })
  },[])

  const update=(index,patch)=>setRows(current=>current.map((row,i)=>i===index?{...row,...patch}:row))

  const saveDay=async()=>{
    const unmarked=rows.filter(r=>r.status==='unmarked')
    if(unmarked.length && !confirm(`في ${unmarked.length} موظف بدون حالة. سيتم اعتبارهم غائبين. متابعة؟`)) return
    setSavingDay(true)
    try{
      const payload=rows.map(r=>({
        employeeId:r.employeeId,
        status:r.status==='unmarked'?'absent':r.status,
        bonus:Number(r.bonus)||0,
        deduction:Number(r.deduction)||0,
        note:r.note||'',
      }))
      const r=await dailyWagesAPI.saveDay(date,payload)
      toast.success(r.data.message||'تم حفظ الدوام')
      await loadDay()
      await loadSummary()
    }catch(e){toast.error(e.message||'تعذّر الحفظ')}
    finally{setSavingDay(false)}
  }

  const settle=async(row)=>{
    if(!(row.entriesCount>0)) return toast.error('لا توجد أيام غير محاسبة')
    if(!confirm(
      `محاسبة ${row.employeeName} من ${from} إلى ${to}؟\n`+
      `المستحق: ${formatCurrency(row.finalPay)}\nسيتم خصم المبلغ من الكاش.`
    )) return
    setSettling(row.employeeId)
    try{
      const r=await dailyWagesAPI.settle({employeeId:row.employeeId,from,to})
      toast.success(r.data.message||'تمت المحاسبة')
      await loadSummary()
      await loadDay()
    }catch(e){toast.error(e.message||'تعذّرت المحاسبة')}
    finally{setSettling('')}
  }

  const saveAdvance=async()=>{
    if(!advEmpId||!(Number(advAmount)>0)) return toast.error('اختر الموظف وأدخل مبلغ السلفة')
    setSavingAdv(true)
    try{
      await advancesAPI.create({
        employeeId:advEmpId,
        amount:Number(advAmount),
        date:TODAY,
        reason:advReason,
      })
      toast.success('تم تسجيل السلفة وخصمها من الكاش')
      setAdvAmount(''); setAdvReason(''); setAdvModal(false)
      await loadSummary()
    }catch(e){toast.error(e.message||'تعذّر تسجيل السلفة')}
    finally{setSavingAdv(false)}
  }

  const showHistory=async()=>{
    try{
      const r=await dailyWagesAPI.settlements()
      setHistory(r.data.settlements||[])
    }catch(e){toast.error(e.message||'تعذّر تحميل السجل')}
  }

  const totals=useMemo(()=>summary.reduce((a,r)=>({
    days:a.days+(Number(r.equivalentDays)||0),
    base:a.base+(Number(r.basePay)||0),
    net:a.net+(Number(r.finalPay)||0),
  }),{days:0,base:0,net:0}),[summary])

  return <div>
    <PageHeader
      title="الأجور اليومية"
      subtitle="حضور بسيط ومحاسبة مباشرة حسب الأجرة اليومية"
      actions={<div className="flex gap-2">
        <Button variant="outline" onClick={showHistory} icon={<History size={15}/>}>سجل المحاسبات</Button>
        <Button variant="outline" onClick={()=>setAdvModal(true)} icon={<Wallet size={15}/>}>سلفة</Button>
      </div>}
    />

    <section className="bg-white rounded-2xl shadow-card p-5 mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="font-black text-brand-dark flex items-center gap-2"><UserRoundCheck size={18}/> دوام اليوم</div>
          <div className="text-xs text-brand-gray font-bold mt-1">اختاري حالة كل موظف واحفظي مرة واحدة.</div>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs font-bold text-brand-gray block mb-1">التاريخ</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              className="px-3 py-2.5 border-2 border-brand-border rounded-xl font-black"/>
          </div>
          <Button onClick={saveDay} loading={savingDay} icon={<Save size={15}/>}>حفظ دوام اليوم</Button>
        </div>
      </div>

      {loadingDay ? <div className="py-10 text-center font-bold text-brand-gray">جاري التحميل…</div> :
        <div className="space-y-3">
          {!rows.length&&<div className="py-8 text-center font-bold text-brand-gray">لا يوجد موظفون يوميون — حددي الأجرة اليومية من صفحة الموظفين.</div>}
          {rows.map((row,index)=>(
            <div key={row.employeeId} className={`rounded-2xl border p-4 ${row.settled?'bg-green-50 border-green-200':'bg-brand-bg border-brand-border'}`}>
              <div className="grid lg:grid-cols-[1.1fr_1.3fr_110px_110px_1fr] gap-3 items-center">
                <div>
                  <div className="font-black text-brand-dark">{row.employeeName}</div>
                  <div className="text-xs font-bold text-fuchsia mt-1">{formatCurrency(row.dailyWage)} / يوم</div>
                  {row.settled&&<div className="text-[11px] font-black text-green-700 mt-1">تمت محاسبة هذا اليوم</div>}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {['present','half','absent'].map(status=>(
                    <button key={status} disabled={row.settled}
                      onClick={()=>update(index,{status})}
                      className={`px-2 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-60 ${row.status===status?STATUS[status].cls:'bg-white text-brand-gray border border-brand-border'}`}>
                      {STATUS[status].label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-brand-gray block mb-1">مكافأة</label>
                  <input type="number" min="0" disabled={row.settled} value={row.bonus}
                    onChange={e=>update(index,{bonus:e.target.value})}
                    className="w-full px-2 py-2 border border-brand-border rounded-xl font-bold bg-white disabled:opacity-60"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-brand-gray block mb-1">حسم</label>
                  <input type="number" min="0" disabled={row.settled} value={row.deduction}
                    onChange={e=>update(index,{deduction:e.target.value})}
                    className="w-full px-2 py-2 border border-brand-border rounded-xl font-bold bg-white disabled:opacity-60"/>
                </div>
                <input disabled={row.settled} value={row.note} onChange={e=>update(index,{note:e.target.value})}
                  placeholder="ملاحظة"
                  className="w-full px-3 py-2 border border-brand-border rounded-xl font-bold bg-white disabled:opacity-60"/>
              </div>
            </div>
          ))}
        </div>}
    </section>

    <section className="bg-white rounded-2xl shadow-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div className="font-black text-brand-dark flex items-center gap-2"><CircleDollarSign size={18}/> محاسبة فترة</div>
          <div className="text-xs text-brand-gray font-bold mt-1">يعرض فقط الأيام التي لم تتم محاسبتها بعد.</div>
        </div>
        <div className="flex gap-2">
          <div>
            <label className="text-xs font-bold text-brand-gray block mb-1">من</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
              className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold"/>
          </div>
          <div>
            <label className="text-xs font-bold text-brand-gray block mb-1">إلى</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)}
              className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold"/>
          </div>
        </div>
      </div>

      {!!summary.length&&<div className="grid sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl bg-brand-bg p-4"><div className="text-xs font-bold text-brand-gray">أيام محسوبة</div><div className="text-xl font-black text-brand-dark mt-1">{totals.days}</div></div>
        <div className="rounded-2xl bg-brand-bg p-4"><div className="text-xs font-bold text-brand-gray">الأجر قبل الحسميات</div><div className="text-xl font-black text-brand-dark mt-1">{formatCurrency(totals.base)}</div></div>
        <div className="rounded-2xl bg-fuchsia-bg p-4"><div className="text-xs font-bold text-brand-gray">إجمالي المستحق للصرف</div><div className="text-xl font-black text-fuchsia mt-1">{formatCurrency(totals.net)}</div></div>
      </div>}

      {loadingSummary?<div className="py-10 text-center font-bold text-brand-gray">جاري الحساب…</div>:
        <div className="space-y-3">
          {summary.map(row=>(
            <div key={row.employeeId} className="rounded-2xl border border-brand-border p-4">
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div>
                  <div className="font-black text-brand-dark">{row.employeeName}</div>
                  <div className="text-xs font-bold text-brand-gray mt-1">
                    حاضر {row.fullDays} · نصف يوم {row.halfDays} · غياب {row.absentDays} · المعتمد {row.equivalentDays} يوم
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-1 max-w-3xl text-center">
                  <div className="rounded-xl bg-brand-bg p-2"><div className="text-[10px] text-brand-gray font-bold">أجر الأيام</div><div className="text-xs font-black">{formatCurrency(row.basePay)}</div></div>
                  <div className="rounded-xl bg-green-50 p-2"><div className="text-[10px] text-brand-gray font-bold">مكافآت</div><div className="text-xs font-black text-green-700">+{formatCurrency(row.bonuses)}</div></div>
                  <div className="rounded-xl bg-red-50 p-2"><div className="text-[10px] text-brand-gray font-bold">حسميات</div><div className="text-xs font-black text-red-600">−{formatCurrency(row.deductions)}</div></div>
                  <div className="rounded-xl bg-amber-50 p-2"><div className="text-[10px] text-brand-gray font-bold">سلف</div><div className="text-xs font-black text-amber-700">−{formatCurrency(row.advances)}</div></div>
                  <div className="rounded-xl bg-fuchsia-bg p-2"><div className="text-[10px] text-brand-gray font-bold">المستحق</div><div className="text-xs font-black text-fuchsia">{formatCurrency(row.finalPay)}</div></div>
                </div>
                <Button disabled={!row.entriesCount||settling===row.employeeId}
                  loading={settling===row.employeeId}
                  onClick={()=>settle(row)} icon={<Check size={14}/>}>
                  محاسبة وصرف
                </Button>
              </div>
            </div>
          ))}
        </div>}
    </section>

    <Modal open={advModal} onClose={()=>setAdvModal(false)} title="تسجيل سلفة" size="sm">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-brand-gray block mb-1">الموظف</label>
          <select value={advEmpId} onChange={e=>setAdvEmpId(e.target.value)}
            className="w-full px-3 py-3 border-2 border-brand-border rounded-xl font-bold bg-white">
            {employees.map(e=><option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-brand-gray block mb-1">المبلغ</label>
          <input type="number" min="1" value={advAmount} onChange={e=>setAdvAmount(e.target.value)}
            className="w-full px-3 py-3 border-2 border-brand-border rounded-xl font-black"/>
        </div>
        <input value={advReason} onChange={e=>setAdvReason(e.target.value)}
          placeholder="سبب السلفة (اختياري)"
          className="w-full px-3 py-3 border-2 border-brand-border rounded-xl font-bold"/>
        <Button onClick={saveAdvance} loading={savingAdv} className="w-full">حفظ السلفة</Button>
      </div>
    </Modal>

    <Modal open={!!history} onClose={()=>setHistory(null)} title="سجل محاسبات الأجور" size="lg">
      {history&&<div className="space-y-2 max-h-[65vh] overflow-auto">
        {!history.length&&<div className="py-10 text-center font-bold text-brand-gray">لا توجد محاسبات بعد</div>}
        {history.map(s=>(
          <div key={s._id} className="rounded-2xl bg-brand-bg p-4 flex flex-wrap gap-3 items-center justify-between">
            <div>
              <div className="font-black text-brand-dark">{s.employeeName}</div>
              <div className="text-xs font-bold text-brand-gray mt-1">{s.from} ← {s.to} · {s.equivalentDays} يوم</div>
            </div>
            <div className="text-left">
              <div className="font-black text-fuchsia">{formatCurrency(s.finalPay)}</div>
              <div className="text-[11px] font-bold text-brand-gray">{new Date(s.paidAt).toLocaleString('ar-SY')}</div>
            </div>
          </div>
        ))}
      </div>}
    </Modal>
  </div>
}
