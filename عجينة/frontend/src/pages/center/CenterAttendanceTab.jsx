import { useEffect, useState } from 'react'
import {
  CalendarDays, Users, Wallet, Server, CheckCircle2, AlertTriangle, XCircle,
  RefreshCw, Search, Wifi, WifiOff, Clock, Plus, Trash2, Fingerprint,
} from 'lucide-react'
import { centerPortalAPI } from '../../services/api'
import CenterEmployeesTab from './CenterEmployeesTab'
import Button from '../../components/common/Button'
import Modal from '../../components/common/Modal'
import PageHeader from '../../components/common/PageHeader'
import toast from 'react-hot-toast'

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const monthStart = () => todayKey().slice(0,8) + '01'
const hhmm = iso => iso ? new Date(iso).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : '—'
const money = n => `${Number(n||0).toLocaleString('ar-SY')} ل.س`
const hoursLabel = h => {
  const mins = Math.max(0, Math.round(Number(h||0)*60))
  const hh = Math.floor(mins/60), mm = mins%60
  return hh ? `${hh}س${mm?` ${mm}د`:''}` : `${mm}د`
}

const TABS = [
  {key:'daily',label:'الحضور اليومي',Icon:CalendarDays},
  {key:'staff',label:'الموظفين والبصمات',Icon:Users},
  {key:'reports',label:'التقارير والساعات',Icon:Wallet},
  {key:'device',label:'جهاز البصمة',Icon:Server},
]

const STATUS = {
  present:{label:'حاضر',Icon:CheckCircle2,cls:'text-green-700 bg-green-100'},
  late:{label:'متأخر',Icon:AlertTriangle,cls:'text-amber-700 bg-amber-100'},
  absent:{label:'غائب',Icon:XCircle,cls:'text-red-600 bg-red-100'},
}

export default function CenterAttendanceTab(){
  const [tab,setTab]=useState('daily')
  const [date,setDate]=useState(todayKey())
  const [board,setBoard]=useState(null)
  const [loading,setLoading]=useState(false)
  const [range,setRange]=useState({from:monthStart(),to:todayKey()})
  const [summary,setSummary]=useState([])
  const [device,setDevice]=useState(null)
  const [deviceLoading,setDeviceLoading]=useState(false)
  const [manualFor,setManualFor]=useState(null)
  const [manualAt,setManualAt]=useState('')
  const [manualNotes,setManualNotes]=useState('')
  const [busy,setBusy]=useState('')

  const loadDaily=async()=>{
    setLoading(true)
    try{
      const r=await centerPortalAPI.getAttendanceDaily(date)
      setBoard(r.data)
    }catch(e){toast.error(e.message||'تعذر تحميل الحضور')}
    finally{setLoading(false)}
  }

  const loadReports=async()=>{
    setLoading(true)
    try{
      const r=await centerPortalAPI.getAttendanceSummary(range.from,range.to)
      setSummary(r.data.rows||[])
    }catch(e){toast.error(e.message||'تعذر تحميل التقارير')}
    finally{setLoading(false)}
  }

  const loadDevice=async()=>{
    setDeviceLoading(true)
    try{
      const r=await centerPortalAPI.getAttendanceDevice()
      setDevice(r.data.device||null)
    }catch(e){toast.error(e.message||'تعذر تحميل حالة الجهاز')}
    finally{setDeviceLoading(false)}
  }

  useEffect(()=>{ if(tab==='daily') loadDaily() },[tab,date])
  useEffect(()=>{ if(tab==='reports') loadReports() },[tab])
  useEffect(()=>{
    if(tab!=='device') return
    loadDevice()
    const t=setInterval(loadDevice,15000)
    return()=>clearInterval(t)
  },[tab])

  const saveManual=async()=>{
    if(!manualFor||!manualAt) return toast.error('حدد التوقيت')
    setBusy('manual')
    try{
      await centerPortalAPI.manualAttendancePunch({
        employeeId:manualFor.employeeId,
        at:new Date(manualAt).toISOString(),
        notes:manualNotes,
      })
      toast.success('تم تسجيل الحركة')
      setManualFor(null); setManualAt(''); setManualNotes('')
      loadDaily()
    }catch(e){toast.error(e.message||'تعذر تسجيل الحركة')}
    finally{setBusy('')}
  }

  const removePunch=async(id)=>{
    if(!confirm('حذف حركة البصمة اليدوية وإعادة احتساب اليوم؟')) return
    try{
      await centerPortalAPI.deleteAttendancePunch(id)
      toast.success('تم حذف الحركة')
      loadDaily()
    }catch(e){toast.error(e.message||'تعذر حذف الحركة')}
  }

  const deviceAction=async(kind)=>{
    setBusy(kind)
    try{
      const r=kind==='scan'
        ? await centerPortalAPI.scanAttendanceDevice()
        : await centerPortalAPI.refreshAttendanceDevice()
      toast.success(r.data.message||'تم إرسال الطلب')
      setTimeout(loadDevice,3000)
    }catch(e){toast.error(e.message||'تعذر تنفيذ الطلب')}
    finally{setBusy('')}
  }

  const totals=board?.totals||{}
  const rows=board?.rows||[]

  return <div>
    <PageHeader title="الحضور والبصمة" subtitle="إدارة موظفي وحضور وجهاز بصمة هذا الفرع فقط" />

    <div className="flex flex-wrap gap-2 mb-5">
      {TABS.map(({key,label,Icon})=><button key={key} onClick={()=>setTab(key)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${tab===key?'bg-fuchsia text-white shadow-md':'bg-white text-brand-gray shadow-card'}`}>
        <Icon size={15}/>{label}
      </button>)}
    </div>

    {tab==='daily'&&<div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-black text-brand-dark">الحضور اليومي</div>
          <div className="text-xs text-brand-gray font-bold mt-1">دخول، خروج، ساعات العمل والحركات اليدوية.</div>
        </div>
        <div className="flex gap-2">
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold"/>
          <Button size="sm" variant="ghost" onClick={loadDaily} icon={<RefreshCw size={14}/>}>تحديث</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ['حاضر',totals.present||0,'text-green-700'],['متأخر',totals.late||0,'text-amber-700'],
          ['غائب',totals.absent||0,'text-red-600'],['الساعات',hoursLabel(totals.hours||0),'text-brand-dark'],
          ['تكلفة الساعات',money(totals.pay||0),'text-fuchsia'],
        ].map(([label,value,cls])=><div key={label} className="bg-white rounded-2xl shadow-card p-4">
          <div className="text-xs font-bold text-brand-gray">{label}</div><div className={`text-xl font-black mt-1 ${cls}`}>{value}</div>
        </div>)}
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-x-auto">
        {loading?<div className="p-10 text-center font-bold text-brand-gray">جاري التحميل…</div>:
        !rows.length?<div className="p-10 text-center font-bold text-brand-gray">لا يوجد موظفون في الفرع</div>:
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="text-right text-brand-gray text-xs border-b border-brand-border">
            <th className="p-3">الموظف</th><th className="p-3">الحالة</th><th className="p-3">دخول</th><th className="p-3">خروج</th>
            <th className="p-3">الساعات</th><th className="p-3">الحركات</th><th className="p-3">إجراء</th>
          </tr></thead>
          <tbody>{rows.map(row=>{
            const st=STATUS[row.status]||STATUS.absent
            return <tr key={row.employeeId} className="border-b border-brand-border/60">
              <td className="p-3"><div className="font-black text-brand-dark">{row.name}</div><div className="text-[11px] text-brand-gray">{row.role||'—'}</div></td>
              <td className="p-3"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-black ${st.cls}`}><st.Icon size={11}/>{st.label}</span></td>
              <td className="p-3 font-bold">{hhmm(row.checkIn)}</td><td className="p-3 font-bold">{hhmm(row.checkOut)}</td>
              <td className="p-3 font-black">{hoursLabel(row.workedHours)}</td>
              <td className="p-3"><div className="flex flex-wrap gap-1">
                {(row.punches||[]).map(p=><span key={p.id} className="group text-[10px] font-bold bg-brand-bg px-2 py-1 rounded-lg">
                  {p.direction==='in'?'دخول':'خروج'} {hhmm(p.at)}
                  {p.source==='manual'&&<button onClick={()=>removePunch(p.id)} className="mr-1 text-red-500"><Trash2 size={9}/></button>}
                </span>)}
              </div></td>
              <td className="p-3"><button onClick={()=>{setManualFor(row);setManualAt(`${date}T${new Date().toTimeString().slice(0,5)}`)}}
                className="text-xs font-black text-fuchsia flex items-center gap-1"><Plus size={12}/> حركة يدوية</button></td>
            </tr>
          })}</tbody>
        </table>}
      </div>
    </div>}

    {tab==='staff'&&<CenterEmployeesTab/>}

    {tab==='reports'&&<div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-card p-4 flex flex-wrap items-end gap-3">
        <div><label className="text-xs font-bold text-brand-gray block mb-1">من</label><input type="date" value={range.from} onChange={e=>setRange(x=>({...x,from:e.target.value}))} className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold"/></div>
        <div><label className="text-xs font-bold text-brand-gray block mb-1">إلى</label><input type="date" value={range.to} onChange={e=>setRange(x=>({...x,to:e.target.value}))} className="px-3 py-2 border-2 border-brand-border rounded-xl font-bold"/></div>
        <Button onClick={loadReports} loading={loading} icon={<Search size={14}/>}>عرض التقرير</Button>
      </div>
      <div className="bg-white rounded-2xl shadow-card overflow-x-auto">
        {!summary.length?<div className="p-10 text-center font-bold text-brand-gray">لا توجد بيانات ضمن الفترة</div>:
        <table className="w-full min-w-[720px] text-sm"><thead><tr className="text-right text-xs text-brand-gray border-b border-brand-border">
          <th className="p-3">الموظف</th><th className="p-3">أيام الحضور</th><th className="p-3">الساعات</th><th className="p-3">ساعات التأخر</th><th className="p-3">قيمة الساعات</th>
        </tr></thead><tbody>{summary.map(row=><tr key={row.id} className="border-b border-brand-border/60">
          <td className="p-3 font-black text-brand-dark">{row.name}</td><td className="p-3 font-bold">{row.daysAttended}</td>
          <td className="p-3 font-bold">{hoursLabel(row.totalHours)}</td><td className="p-3 font-bold text-amber-700">{hoursLabel(row.lateHours)}</td>
          <td className="p-3 font-black text-fuchsia">{money(row.totalPay)}</td>
        </tr>)}</tbody></table>}
      </div>
    </div>}

    {tab==='device'&&<div className="max-w-3xl space-y-4">
      <div className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div><div className="font-black text-brand-dark flex items-center gap-2"><Fingerprint size={18}/> جهاز بصمة الفرع</div><div className="text-xs text-brand-gray mt-1 font-bold">الحالة من الـAttendance Agent الموجود على لابتوب الفرع.</div></div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={()=>deviceAction('scan')} loading={busy==='scan'}>بحث عن الأجهزة</Button>
            <Button size="sm" onClick={()=>deviceAction('refresh')} loading={busy==='refresh'} icon={<RefreshCw size={13}/>}>تحديث الجهاز</Button>
          </div>
        </div>
        {deviceLoading?<div className="py-8 text-center font-bold text-brand-gray">جاري التحميل…</div>:
        !device?<div className="py-8 text-center"><WifiOff className="mx-auto text-red-400 mb-2"/><div className="font-black text-brand-dark">لا يوجد جهاز بصمة مربوط بهذا الفرع</div><div className="text-xs text-brand-gray mt-1">الأدمن الرئيسي يضيف الجهاز ومفتاح الـAgent أول مرة.</div></div>:
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-brand-bg p-4"><div className="text-xs font-bold text-brand-gray">الوكيل</div><div className={`font-black mt-1 flex items-center gap-2 ${device.lastSeenAt?'text-green-700':'text-red-600'}`}>{device.lastSeenAt?<Wifi size={15}/>:<WifiOff size={15}/>} {device.lastSeenAt?'متصل':'غير متصل'}</div><div className="text-[11px] text-brand-gray mt-1">{device.lastSeenAt?new Date(device.lastSeenAt).toLocaleString('ar-SY'):'—'}</div></div>
          <div className="rounded-xl bg-brand-bg p-4"><div className="text-xs font-bold text-brand-gray">جهاز البصمة</div><div className={`font-black mt-1 ${device.deviceReachable?'text-green-700':'text-red-600'}`}>{device.deviceReachable?'الجهاز يستجيب':'الجهاز لا يستجيب'}</div><div className="text-[11px] text-brand-gray mt-1">{device.deviceIp}:{device.devicePort}</div></div>
          <div className="rounded-xl bg-brand-bg p-4"><div className="text-xs font-bold text-brand-gray">آخر مزامنة</div><div className="font-black mt-1 text-brand-dark">{device.lastSyncAt?new Date(device.lastSyncAt).toLocaleString('ar-SY'):'—'}</div><div className="text-[11px] text-brand-gray mt-1">{device.lastSyncCount||0} حركة جديدة</div></div>
          <div className="rounded-xl bg-brand-bg p-4"><div className="text-xs font-bold text-brand-gray">الإصدار / المهام</div><div className="font-black mt-1 text-brand-dark">Agent {device.agentVersion||'—'}</div><div className="text-[11px] text-brand-gray mt-1">{device.pendingCommands||0} مهمة بانتظار التنفيذ</div></div>
        </div>}
        {device?.lastError&&<div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-bold">{device.lastError}</div>}
        {!!device?.discovered?.length&&<div className="mt-4 p-3 rounded-xl bg-brand-bg"><div className="text-xs font-black text-brand-dark mb-2">أجهزة ظهرت على الشبكة</div><div className="flex flex-wrap gap-2">{device.discovered.map(ip=><span key={ip} className="px-2 py-1 rounded-lg bg-white text-xs font-black">{ip}</span>)}</div></div>}
      </div>
    </div>}

    <Modal open={!!manualFor} onClose={()=>setManualFor(null)} title={`حركة يدوية — ${manualFor?.name||''}`} size="sm">
      {manualFor&&<div className="space-y-4">
        <div><label className="text-xs font-bold text-brand-gray block mb-2">التاريخ والوقت</label><input type="datetime-local" value={manualAt} onChange={e=>setManualAt(e.target.value)} className="w-full px-3 py-3 border-2 border-brand-border rounded-xl font-bold"/></div>
        <div><label className="text-xs font-bold text-brand-gray block mb-2">ملاحظة</label><input value={manualNotes} onChange={e=>setManualNotes(e.target.value)} className="w-full px-3 py-3 border-2 border-brand-border rounded-xl font-bold" placeholder="مثال: نسي البصمة"/></div>
        <Button onClick={saveManual} loading={busy==='manual'} className="w-full">حفظ الحركة</Button>
      </div>}
    </Modal>
  </div>
}
