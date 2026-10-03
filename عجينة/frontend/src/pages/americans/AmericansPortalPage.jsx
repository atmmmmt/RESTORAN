import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, CalendarDays, ChevronLeft, Landmark, LogOut, Receipt, RefreshCw,
  RotateCcw, ShoppingCart, TrendingUp, WalletCards, AlertTriangle, Percent,
  Banknote, LayoutDashboard, Store,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../services/api'

const GOLD = '#C49B49'
const BG = '#0F1113'
const CARD = '#181B1E'
const LINE = 'rgba(255,255,255,.09)'

const toInputDate = date => {
  const d = new Date(date)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}

const monthRange = () => {
  const n = new Date()
  return {
    start: toInputDate(new Date(n.getFullYear(), n.getMonth(), 1)),
    end: toInputDate(new Date(n.getFullYear(), n.getMonth()+1, 1)),
  }
}

const money = (v, currency='SYP') =>
  `${new Intl.NumberFormat('ar-SY',{maximumFractionDigits:2}).format(Number(v||0))} ${currency==='SYP'?'ل.س':currency}`

function BrandMark({ size=48 }) {
  const [failed,setFailed] = useState(false)
  if (!failed) return <img src="/americans-logo.png" alt="الأميركان" onError={()=>setFailed(true)}
    style={{width:size,height:size,objectFit:'contain',borderRadius:14}} />
  return <div style={{width:size,height:size,background:'#1C2C1A',color:'white',border:'1px solid rgba(255,255,255,.5)'}}
    className="rounded-2xl flex items-center justify-center font-black text-xs">AM</div>
}

function Metric({ title, value, sub, Icon, accent=false }) {
  return (
    <div className="rounded-[22px] border p-4 sm:p-5" style={{
      background: accent ? 'linear-gradient(145deg,#C49B49,#9B7634)' : CARD,
      borderColor: accent ? 'transparent' : LINE,
      color: accent ? BG : 'white'
    }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={17} style={{color:accent?BG:GOLD}} />
        <span className="text-xs font-black opacity-60">{title}</span>
      </div>
      <div className="font-black text-xl sm:text-2xl">{value}</div>
      {sub && <div className="text-[11px] mt-1.5 font-bold opacity-55">{sub}</div>}
    </div>
  )
}

function RestaurantCard({ brand, onOpen }) {
  if (!brand.configured) {
    return (
      <div className="rounded-[26px] border p-5" style={{background:CARD,borderColor:'rgba(245,158,11,.3)'}}>
        <AlertTriangle size={20} className="text-amber-400 mb-3" />
        <div className="text-white font-black text-lg">{brand.name}</div>
        <div className="text-white/45 text-sm mt-1">{brand.warning}</div>
      </div>
    )
  }
  const s=brand.summary||{}
  return (
    <button onClick={()=>onOpen(brand.key)}
      className="text-right w-full rounded-[28px] border p-5 sm:p-6 transition hover:-translate-y-1"
      style={{background:CARD,borderColor:LINE,boxShadow:'0 18px 45px rgba(0,0,0,.18)'}}>
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 text-white font-black text-xl"><Store size={20} style={{color:GOLD}} />{brand.name}</div>
          <div className="text-white/40 text-xs font-bold mt-1">فرع {brand.center?.name || 'الأميركان'}</div>
        </div>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{background:'rgba(196,155,73,.12)'}}>
          <ChevronLeft size={19} style={{color:GOLD}} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><div className="text-white/35 text-[11px] font-bold">المقبوض</div><div className="text-white font-black mt-1">{money(s.customerCollections,brand.currency)}</div></div>
        <div><div className="text-white/35 text-[11px] font-bold">حصة الأميركان</div><div className="font-black mt-1" style={{color:GOLD}}>{money(s.investorShare,brand.currency)}</div></div>
        <div><div className="text-white/35 text-[11px] font-bold">الربح التقديري</div><div className="text-white font-black mt-1">{money(s.estimatedNetProfitAfterTax,brand.currency)}</div></div>
        <div><div className="text-white/35 text-[11px] font-bold">الطلبات</div><div className="text-white font-black mt-1">{s.ordersCount||0}</div></div>
      </div>
    </button>
  )
}

function RestaurantDetail({ brand, onBack }) {
  const s=brand.summary||{}, currency=brand.currency||'SYP'
  return (
    <div>
      <button onClick={onBack} className="mb-5 flex items-center gap-2 text-sm font-black" style={{color:GOLD}}>
        <ArrowLeft size={17}/> كل المطاعم
      </button>
      <div className="rounded-[28px] border p-5 sm:p-7 mb-5" style={{background:CARD,borderColor:LINE}}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-white/40 text-xs font-black">المطعم</div>
            <h2 className="text-white text-2xl font-black mt-1">{brand.name}</h2>
            <div className="text-white/40 text-sm mt-1">فرع {brand.center?.name||'الأميركان'}</div>
          </div>
          <div className="px-4 py-2 rounded-2xl text-sm font-black" style={{background:'rgba(196,155,73,.12)',color:GOLD}}>{s.ordersCount||0} طلب</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <Metric title="إجمالي المقبوض" value={money(s.customerCollections,currency)} Icon={Receipt}/>
        <Metric title="حصة إدارة الأميركان" value={money(s.investorShare,currency)} Icon={Percent} accent/>
        <Metric title="إيراد المطعم" value={money(s.revenueBeforeInvoiceTax,currency)} sub="بعد فصل المبلغ المحصل للمالية" Icon={TrendingUp}/>
        <Metric title="المستحق للمالية" value={money((s.invoiceTaxDue||0)+(s.profitTaxDue||0),currency)} Icon={Landmark}/>
        <Metric title="المرتجعات" value={money(s.refunds,currency)} sub={`الصافي: ${money(s.netCollectionsAfterRefunds,currency)}`} Icon={RotateCcw}/>
        <Metric title="تكلفة البضاعة" value={money(s.costOfGoods,currency)} Icon={ShoppingCart}/>
        <Metric title="مصاريف التشغيل" value={money(s.operatingExpenses,currency)} Icon={WalletCards}/>
        <Metric title="مشتريات من الصندوق" value={money(s.purchaseCashOut,currency)} Icon={Banknote}/>
        <Metric title="الربح قبل الضريبة" value={money(s.profitBeforeTax,currency)} Icon={TrendingUp}/>
        <Metric title="ضريبة الأرباح التقديرية" value={money(s.profitTaxEstimate,currency)} Icon={Landmark}/>
        <Metric title="المحصل لصالح المالية" value={money(s.invoiceTaxCollected,currency)} sub={`المتبقي: ${money(s.invoiceTaxDue,currency)}`} Icon={Landmark}/>
        <Metric title="صافي الربح التقديري" value={money(s.estimatedNetProfitAfterTax,currency)} Icon={TrendingUp} accent/>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <div className="rounded-[26px] border p-5" style={{background:CARD,borderColor:LINE}}>
          <h3 className="text-white font-black mb-4">آخر الطلبات</h3>
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {(brand.recentOrders||[]).slice(0,20).map((r,i)=>(
              <div key={i} className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3" style={{background:'rgba(255,255,255,.035)'}}>
                <div><div className="text-white font-black text-sm">{r.number}</div><div className="text-white/35 text-[11px] mt-1">{r.at?new Date(r.at).toLocaleString('ar-SY'):''}</div></div>
                <div className="text-left"><div className="text-white font-black text-sm">{money(r.amount,currency)}</div>{r.tax>0&&<div className="text-[11px] mt-1" style={{color:GOLD}}>مالية {money(r.tax,currency)}</div>}</div>
              </div>
            ))}
            {!brand.recentOrders?.length&&<div className="text-white/35 text-sm">لا توجد طلبات ضمن الفترة.</div>}
          </div>
        </div>
        <div className="rounded-[26px] border p-5" style={{background:CARD,borderColor:LINE}}>
          <h3 className="text-white font-black mb-4">الحركات المالية</h3>
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {(brand.recentCash||[]).slice(0,20).map(r=>(
              <div key={r.id} className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3" style={{background:'rgba(255,255,255,.035)'}}>
                <div><div className="text-white font-black text-sm">{r.description||r.type}</div><div className="text-white/35 text-[11px] mt-1">{r.at?new Date(r.at).toLocaleString('ar-SY'):''}</div></div>
                <div className="font-black text-sm" style={{color:r.direction==='out'?'#F87171':'#6EE7A8'}}>{r.direction==='out'?'−':'+'} {money(r.amount,currency)}</div>
              </div>
            ))}
            {!brand.recentCash?.length&&<div className="text-white/35 text-sm">لا توجد حركات ضمن الفترة.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AmericansPortalPage() {
  const { user, loading: authLoading, token, logout } = useAuth()
  const navigate=useNavigate()
  const initial=useMemo(monthRange,[])
  const [start,setStart]=useState(initial.start), [end,setEnd]=useState(initial.end)
  const [data,setData]=useState(null), [loading,setLoading]=useState(true), [selected,setSelected]=useState(null)

  const load=async()=>{
    setLoading(true)
    try{
      const res = await api.get('/americans-management/summary',{params:{start,end}})
      setData(res.data)
    } catch(e){
      toast.error(e.message||'تعذّر تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ if(token && user?.role==='americans_manager') load() },[token,user])

  if(authLoading && token) return <div className="min-h-screen flex items-center justify-center text-white font-black" style={{background:BG}}>جاري تحميل الحساب…</div>
  if(!token || !user) return <Navigate to="/americans/login" replace/>
  if(user.role!=='americans_manager') return <Navigate to="/admin/dashboard" replace/>

  const signOut=()=>{ logout(); navigate('/americans/login',{replace:true}) }
  const totals=data?.totals||{}
  const selectedBrand=(data?.brands||[]).find(b=>b.key===selected)

  return (
    <div className="min-h-screen" dir="rtl" style={{background:BG,fontFamily:'Tajawal, Cairo, sans-serif'}}>
      <header className="sticky top-0 z-30 border-b" style={{background:'rgba(15,17,19,.94)',borderColor:LINE,backdropFilter:'blur(18px)'}}>
        <div className="max-w-[1540px] mx-auto px-4 sm:px-6 flex items-center justify-between gap-4" style={{minHeight:68}}>
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark/>
            <div className="min-w-0"><div className="text-white font-black truncate">إدارة الأميركان</div><div className="text-[11px] font-bold truncate" style={{color:GOLD}}>الإدارة المالية للمطاعم</div></div>
          </div>
          <button onClick={signOut} className="flex items-center gap-2 rounded-xl px-3 py-2 text-white/60 hover:text-white font-black text-sm"><LogOut size={16}/> خروج</button>
        </div>
      </header>

      <main className="max-w-[1540px] mx-auto p-4 sm:p-6">
        {!selectedBrand && <>
          <div className="mb-6">
            <div className="text-white/35 text-xs font-black mb-2 flex items-center gap-2"><LayoutDashboard size={14}/> النظرة العامة</div>
            <h1 className="text-white text-2xl sm:text-3xl font-black">المحفظة المالية للمطاعم</h1>
            <p className="text-white/40 text-sm mt-2">كل مطعم مضاف يظهر بشكل مستقل، مع إجمالي موحّد للإدارة.</p>
          </div>

          <div className="rounded-[24px] border p-4 mb-5 flex flex-col lg:flex-row lg:items-end gap-3" style={{background:CARD,borderColor:LINE}}>
            <div className="flex-1"><label className="text-white/40 text-xs font-black block mb-2">من</label><input type="date" value={start} onChange={e=>setStart(e.target.value)} className="w-full rounded-xl px-3 text-white outline-none" style={{height:44,background:'#101214',border:`1px solid ${LINE}`}}/></div>
            <div className="flex-1"><label className="text-white/40 text-xs font-black block mb-2">إلى</label><input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="w-full rounded-xl px-3 text-white outline-none" style={{height:44,background:'#101214',border:`1px solid ${LINE}`}}/></div>
            <button onClick={load} disabled={loading} className="rounded-xl px-5 font-black flex items-center justify-center gap-2 disabled:opacity-50" style={{height:44,background:GOLD,color:BG}}><RefreshCw size={16} className={loading?'animate-spin':''}/> تحديث</button>
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            <Metric title="إجمالي المقبوض للمطاعم" value={money(totals.customerCollections)} sub={`${totals.ordersCount||0} طلب`} Icon={Receipt}/>
            <Metric title="حصة إدارة الأميركان" value={money(totals.investorShare)} Icon={Percent} accent/>
            <Metric title="المستحق للمالية" value={money((totals.invoiceTaxDue||0)+(totals.profitTaxDue||0))} Icon={Landmark}/>
            <Metric title="صافي الربح التقديري" value={money(totals.estimatedNetProfitAfterTax)} Icon={TrendingUp}/>
          </div>

          <div className="flex items-center gap-2 text-white/35 text-xs font-bold mb-4"><CalendarDays size={14}/> الفترة المحددة تنطبق على جميع المطاعم أدناه.</div>
          <div className="grid lg:grid-cols-2 gap-4">
            {(data?.brands||[]).map(b=><RestaurantCard key={b.key} brand={b} onOpen={setSelected}/>)}
          </div>
          {loading&&!data&&<div className="text-white/40 text-center py-16 font-black">جاري تحميل المطاعم…</div>}
        </>}

        {selectedBrand && <RestaurantDetail brand={selectedBrand} onBack={()=>setSelected(null)}/>}
      </main>
    </div>
  )
}
