import { useCallback, useEffect, useState } from 'react'
import { History, Lock, Unlock, Wallet, Receipt, CalendarDays } from 'lucide-react'
import toast from 'react-hot-toast'
import { shiftsAPI } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import Button from '../common/Button'
import Modal from '../common/Modal'

const clock = iso => iso
  ? new Date(iso).toLocaleTimeString('ar-EG',{timeZone:'Asia/Damascus',hour:'2-digit',minute:'2-digit'})
  : '—'
const stamp = iso => iso
  ? new Date(iso).toLocaleString('ar-EG',{timeZone:'Asia/Damascus',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
  : '—'

export default function ShiftPanel({ tick=0, onChanged }) {
  const [shift,setShift]=useState(null)
  const [day,setDay]=useState(null)
  const [loaded,setLoaded]=useState(false)
  const [openForm,setOpenForm]=useState(null)
  const [closeForm,setCloseForm]=useState(null)
  const [history,setHistory]=useState(null)
  const [busy,setBusy]=useState(false)

  const load=useCallback(async()=>{
    try{
      const r=await shiftsAPI.current()
      setShift(r.data.shift)
      setDay(r.data.businessDay)
    }catch{} finally{ setLoaded(true) }
  },[])

  useEffect(()=>{ load() },[load,tick])

  const openShift=async()=>{
    setBusy(true)
    try{
      const r=await shiftsAPI.open({openingCash:Number(openForm.openingCash)||0})
      toast.success(r.data.message)
      setOpenForm(null); await load(); onChanged?.()
    }catch(e){toast.error(e.message)} finally{setBusy(false)}
  }

  const closeShift=async()=>{
    if(closeForm.countedCash===''||Number(closeForm.countedCash)<0) return toast.error('أدخل المبلغ الموجود في الدرج')
    setBusy(true)
    try{
      const r=await shiftsAPI.close({countedCash:Number(closeForm.countedCash),notes:closeForm.notes})
      toast.success(r.data.message)
      setCloseForm(null); await load(); onChanged?.()
    }catch(e){toast.error(e.message)} finally{setBusy(false)}
  }

  const showHistory=async()=>{
    try{
      const r=await shiftsAPI.list({limit:30})
      setHistory(r.data.shifts||[])
    }catch(e){toast.error(e.message)}
  }

  if(!loaded) return null
  const s=shift?.summary||{}
  const expected=shift?.expectedCash||0
  const counted=closeForm&&closeForm.countedCash!==''?Number(closeForm.countedCash):null
  const diff=counted===null?null:counted-expected

  return <>
    <div className={`rounded-2xl shadow-card p-4 mb-5 flex flex-wrap items-center gap-3 ${shift?'bg-white':'bg-amber-50 border-2 border-amber-200'}`}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:shift?'rgba(46,122,74,.12)':'rgba(224,152,16,.14)'}}>
        {shift?<Unlock size={18} style={{color:'#2E7A4A'}}/>:<Lock size={18} style={{color:'#E09810'}}/>}
      </div>
      <div className="flex-1 min-w-0">
        {shift?<>
          <div className="font-black text-brand-dark text-sm">الوردية رقم {shift.number} مفتوحة <span className="text-brand-gray font-bold">· منذ {clock(shift.openedAt)} · {shift.openedByName||'—'}</span></div>
          <div className="text-xs font-bold text-brand-gray mt-1 flex flex-wrap gap-3">
            <span><Receipt size={11} className="inline"/> {s.ordersCount||0} طلب</span>
            <span>المبيعات {formatCurrency(s.sales||0)}</span>
            <span><Wallet size={11} className="inline"/> المفروض بالدرج {formatCurrency(expected)}</span>
          </div>
        </>:<>
          <div className="font-black text-brand-dark text-sm">لا توجد وردية مفتوحة</div>
          <div className="text-xs text-brand-gray font-bold mt-1">ابدأ الوردية وسجّل رصيد افتتاح الدرج</div>
        </>}
        {day?.day&&<div className="text-[11px] text-brand-gray-light font-bold mt-1"><CalendarDays size={10} className="inline"/> يوم العمل {day.day} ({day.openingTime} ← {day.closingTime})</div>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={showHistory} icon={<History size={14}/>}>الورديات</Button>
        {shift
          ? <Button size="sm" onClick={()=>setCloseForm({countedCash:'',notes:''})} icon={<Lock size={14}/>}>تصفير الكاش</Button>
          : <Button size="sm" onClick={()=>setOpenForm({openingCash:''})} icon={<Unlock size={14}/>}>بداية وردية</Button>}
      </div>
    </div>

    <Modal open={!!openForm} onClose={()=>setOpenForm(null)} title="بداية وردية جديدة" size="sm">
      {openForm&&<div>
        <label className="text-xs font-bold text-brand-dark mb-2 block">المبلغ الموجود بالدرج عند البداية</label>
        <input type="number" min="0" autoFocus value={openForm.openingCash}
          onChange={e=>setOpenForm(f=>({...f,openingCash:e.target.value}))}
          className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-black"/>
        <div className="flex gap-3 mt-5">
          <Button onClick={openShift} loading={busy} className="flex-1">فتح الوردية</Button>
          <Button variant="ghost" onClick={()=>setOpenForm(null)}>إلغاء</Button>
        </div>
      </div>}
    </Modal>

    <Modal open={!!closeForm&&!!shift} onClose={()=>setCloseForm(null)} title={`تصفير الكاش — وردية ${shift?.number||''}`} size="sm">
      {closeForm&&shift&&<div>
        <div className="rounded-2xl bg-brand-bg p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="font-bold text-brand-gray">عدد الطلبات</span><span className="font-black">{s.ordersCount||0}</span></div>
          <div className="flex justify-between"><span className="font-bold text-brand-gray">المبيعات</span><span className="font-black">{formatCurrency(s.sales||0)}</span></div>
          <div className="flex justify-between"><span className="font-bold text-brand-gray">نقداً</span><span className="font-black">{formatCurrency(s.cashSales||0)}</span></div>
          <div className="flex justify-between"><span className="font-bold text-brand-gray">بطاقة</span><span className="font-black">{formatCurrency(s.cardSales||0)}</span></div>
          <div className="flex justify-between border-t border-brand-border pt-2"><span className="font-black text-brand-dark">المفروض بالدرج</span><span className="font-black text-fuchsia">{formatCurrency(expected)}</span></div>
        </div>
        <label className="text-xs font-bold text-brand-dark mt-4 mb-2 block">المبلغ المعدود فعلياً</label>
        <input type="number" min="0" autoFocus value={closeForm.countedCash}
          onChange={e=>setCloseForm(f=>({...f,countedCash:e.target.value}))}
          className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-black"/>
        {diff!==null&&<div className={`mt-2 text-sm font-black ${diff===0?'text-green-600':diff>0?'text-blue-600':'text-red-500'}`}>
          {diff===0?'الدرج مطابق':diff>0?`زيادة ${formatCurrency(diff)}`:`نقص ${formatCurrency(Math.abs(diff))}`}
        </div>}
        <input value={closeForm.notes} onChange={e=>setCloseForm(f=>({...f,notes:e.target.value}))}
          placeholder="ملاحظات (اختياري)"
          className="w-full mt-3 px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm"/>
        <div className="flex gap-3 mt-4">
          <Button onClick={closeShift} loading={busy} className="flex-1">تأكيد التصفير</Button>
          <Button variant="ghost" onClick={()=>setCloseForm(null)}>إلغاء</Button>
        </div>
      </div>}
    </Modal>

    <Modal open={!!history} onClose={()=>setHistory(null)} title="سجل الورديات" size="md">
      {history&&<div className="space-y-2">
        {!history.length&&<div className="text-center py-8 font-bold text-brand-gray">لا توجد ورديات بعد</div>}
        {history.map(h=>{
          const d=Number(h.difference)||0
          return <div key={h._id} className="rounded-2xl bg-brand-bg p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-black text-brand-dark">وردية {h.number} · {h.status==='open'?'مفتوحة':'مغلقة'}</div>
              <div className="text-xs text-brand-gray font-bold mt-1">{stamp(h.openedAt)} ← {h.closedAt?stamp(h.closedAt):'الآن'}</div>
            </div>
            {h.status==='closed'&&<div className="text-left text-xs font-bold">
              <div className="font-black">{formatCurrency(h.summary?.sales||0)}</div>
              <div className={d===0?'text-green-600':d>0?'text-blue-600':'text-red-500'}>{d===0?'مطابق':d>0?`زيادة ${formatCurrency(d)}`:`نقص ${formatCurrency(Math.abs(d))}`}</div>
            </div>}
          </div>
        })}
      </div>}
    </Modal>
  </>
}
