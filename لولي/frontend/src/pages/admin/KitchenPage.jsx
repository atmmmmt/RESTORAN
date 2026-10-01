import { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ChefHat, CheckCircle2, Clock, Receipt, ArrowLeft,
  Maximize2, Minimize2, Volume2, VolumeX, Bike, Store, ShoppingBag,
  CalendarClock,
} from 'lucide-react'
import { internalOrdersAPI } from '../../services/api'

/**
 * Kitchen display — meant to live full-screen on a tablet by the pass.
 *
 * Deliberately not styled like the rest of the dashboard: dark, huge type,
 * touch-sized targets, readable across a hot kitchen at arm's length.
 */

const TYPE_META = {
  dine_in:  { label: 'بالمحل', Icon: Store },
  takeaway: { label: 'سفري',   Icon: ShoppingBag },
  delivery: { label: 'توصيل',  Icon: Bike },
}

const COLUMNS = [
  { key: 'new',       title: 'طلبات جديدة', accent: '#5B8DEF', next: 'preparing', nextLabel: 'ابدأ التجهيز' },
  { key: 'preparing', title: 'قيد التجهيز', accent: '#F6B91A', next: 'ready',     nextLabel: 'جاهز' },
  { key: 'ready',     title: 'جاهز للتسليم', accent: '#3FA96A', next: 'delivered', nextLabel: 'تم التسليم' },
]

/** How long until a scheduled order comes onto the board. Beyond this it
 *  sits in the "later today" strip instead of cluttering the columns. */
const LEAD_MINUTES = 90

/** The moment the order is actually wanted. */
const dueAtOf = o =>
  o.fulfillmentType === 'scheduled' && o.scheduledFor
    ? new Date(o.scheduledFor)
    : new Date(o.createdAt)

/** Minutes past the due moment. Negative means it isn't due yet. */
const minutesPastDue = o => Math.floor((Date.now() - dueAtOf(o).getTime()) / 60000)

/**
 * One scale for both kinds of ticket, measured against when it's *wanted*:
 * an ASAP order ages from the moment it was rung up, a scheduled one from
 * its appointment — so a pre-order for tonight never shows up as "late".
 */
function urgency(pastDue) {
  if (pastDue < 0)   return { color: '#5B8DEF', pulse: false, waiting: true }
  if (pastDue >= 20) return { color: '#FF6B6B', pulse: true,  waiting: false }
  if (pastDue >= 10) return { color: '#F6B91A', pulse: false, waiting: false }
  return { color: '#8A9BA8', pulse: false, waiting: false }
}

/** "35د" · "2س 10د" — compact enough for a glance across the kitchen. */
function durationLabel(mins) {
  const m = Math.abs(mins)
  if (m < 60) return `${m}د`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}س ${rem}د` : `${h}س`
}

const clockLabel = d =>
  new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

const isToday = d => {
  const x = new Date(d), n = new Date()
  return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() && x.getDate() === n.getDate()
}

export default function KitchenPage() {
  const [orders,  setOrders]  = useState([])
  const [sound,   setSound]   = useState(true)
  const [full,    setFull]    = useState(false)
  const [, setTick] = useState(0)          // forces the elapsed timers to re-render

  const knownIds = useRef(new Set())
  const firstLoad = useRef(true)

  /** Short beep for a new ticket — no asset file needed. */
  const chime = useCallback(() => {
    if (!sound) return
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start(); osc.stop(ctx.currentTime + 0.35)
      setTimeout(() => ctx.close(), 600)
    } catch { /* audio is a nicety */ }
  }, [sound])

  const load = useCallback(async () => {
    try {
      const res = await internalOrdersAPI.getAll({ limit: 200 })
      const live = (res.data.orders || []).filter(o => ['new', 'preparing', 'ready'].includes(o.status))

      // Ring only for tickets that appeared after the initial paint.
      if (!firstLoad.current) {
        const fresh = live.some(o => o.status === 'new' && !knownIds.current.has(o._id))
        if (fresh) chime()
      }
      knownIds.current = new Set(live.map(o => o._id))
      firstLoad.current = false

      setOrders(live)
    } catch { /* keep the last board on a blip rather than blanking the screen */ }
  }, [chime])

  useEffect(() => {
    load()
    const poll = setInterval(load, 10000)   // the kitchen can tolerate 10s
    const timer = setInterval(() => setTick(t => t + 1), 30000)
    return () => { clearInterval(poll); clearInterval(timer) }
  }, [load])

  const advance = async (order, next) => {
    // Optimistic — the cook shouldn't wait on a round trip mid-service.
    setOrders(o => next === 'delivered'
      ? o.filter(x => x._id !== order._id)
      : o.map(x => x._id === order._id ? { ...x, status: next } : x))
    try {
      await internalOrdersAPI.setStatus(order._id, next)
    } catch {
      load()   // reconcile if the server disagreed
    }
  }

  const toggleFull = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setFull(true)).catch(() => {})
    } else {
      document.exitFullscreen?.().then(() => setFull(false)).catch(() => {})
    }
  }

  /* A scheduled ticket only joins the columns once it's within the lead
     window; until then it waits in the strip above. Anything already being
     worked on stays on the board regardless of its clock. */
  const upcoming = orders
    .filter(o => o.status === 'new'
      && o.fulfillmentType === 'scheduled'
      && minutesPastDue(o) < -LEAD_MINUTES)
    .sort((a, b) => dueAtOf(a) - dueAtOf(b))

  const upcomingIds = new Set(upcoming.map(o => o._id))
  const active = orders.filter(o => !upcomingIds.has(o._id))

  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ background: '#241318', direction: 'rtl' }}>
      {/* Bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4"
        style={{ background: '#1F1915', borderBottom: '1px solid rgba(231,210,183,0.15)' }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(169,103,52,0.25)' }}>
            <ChefHat size={22} style={{ color: '#EAD9C2' }} />
          </div>
          <div>
            <div className="font-black text-xl" style={{ color: '#F6EFE6' }}>شاشة المطبخ</div>
            <div className="text-xs font-bold" style={{ color: 'rgba(231,210,183,0.55)' }}>
              {active.length} طلب على الخط
              {upcoming.length > 0 && ` · ${upcoming.length} مجدول لاحقاً`}
              {' · تحديث تلقائي كل 10 ثوانٍ'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setSound(s => !s)} title={sound ? 'كتم الصوت' : 'تشغيل الصوت'}
            className="w-11 h-11 rounded-2xl flex items-center justify-center transition-colors"
            style={{ background: 'rgba(231,210,183,0.1)', color: '#EAD9C2' }}>
            {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <button onClick={toggleFull} title="ملء الشاشة"
            className="w-11 h-11 rounded-2xl flex items-center justify-center transition-colors"
            style={{ background: 'rgba(231,210,183,0.1)', color: '#EAD9C2' }}>
            {full ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </button>
          <Link to="/admin/pos"
            className="h-11 px-4 rounded-2xl flex items-center gap-2 font-black text-sm transition-colors"
            style={{ background: 'rgba(231,210,183,0.1)', color: '#EAD9C2' }}>
            الكاشير <ArrowLeft size={16} />
          </Link>
        </div>
      </div>

      {/* Pre-orders that aren't close enough to start yet — kept out of the
          columns so the line only sees what it can actually act on. */}
      {upcoming.length > 0 && (
        <div className="mx-5 mt-5 rounded-2xl px-4 py-3"
          style={{ background: 'rgba(91,141,239,0.1)', border: '1px solid rgba(91,141,239,0.3)' }}>
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock size={16} style={{ color: '#5B8DEF' }} />
            <span className="font-black text-sm" style={{ color: '#5B8DEF' }}>
              طلبات مجدولة لاحقاً ({upcoming.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.map(o => (
              <span key={o._id} className="px-3 py-1.5 rounded-xl text-sm font-bold"
                style={{ background: 'rgba(91,141,239,0.15)', color: '#BBD0F5' }}>
                <span dir="ltr">{o.orderNumber.split('-').pop()}</span>
                {' · '}
                {isToday(dueAtOf(o)) ? clockLabel(dueAtOf(o))
                  : new Date(dueAtOf(o)).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' · '}{o.items.reduce((s, i) => s + i.quantity, 0)} صنف
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Board */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {COLUMNS.map(col => {
          // Soonest-wanted first, which for ASAP tickets is the same as oldest-first.
          const list = active
            .filter(o => o.status === col.key)
            .sort((a, b) => dueAtOf(a) - dueAtOf(b))

          return (
            <div key={col.key}>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: col.accent }} />
                  <span className="font-black text-lg" style={{ color: '#F6EFE6' }}>{col.title}</span>
                </div>
                <span className="text-sm font-black px-3 py-1 rounded-xl"
                  style={{ background: `${col.accent}25`, color: col.accent }}>
                  {list.length}
                </span>
              </div>

              {/* Tickets animate in but leave instantly, with no exit
                  transition and no `layout` — that combination left finished
                  cards mounted at opacity 0 forever, quietly growing the DOM
                  across a shift. A done ticket vanishing at once is also the
                  clearer signal for the line. */}
              <div className="space-y-3">
                  {list.map(order => {
                    const pastDue  = minutesPastDue(order)
                    const urg      = urgency(pastDue)
                    const type     = TYPE_META[order.orderType] || TYPE_META.takeaway
                    const scheduled = order.fulfillmentType === 'scheduled'

                    return (
                      <motion.div key={order._id}
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="rounded-2xl overflow-hidden"
                        style={{ background: '#6A4422', border: `1px solid ${urg.color}44` }}>

                        {/* Ticket head */}
                        <div className="px-4 py-3 flex items-center justify-between"
                          style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <div>
                            <div className="font-black text-lg" dir="ltr" style={{ color: '#F6EFE6' }}>
                              {order.orderNumber.split('-').pop()}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-bold mt-0.5"
                              style={{ color: 'rgba(231,210,183,0.6)' }}>
                              <type.Icon size={11} /> {type.label}
                              {order.customerName && ` · ${order.customerName}`}
                            </div>
                            {scheduled && (
                              <div className="flex items-center gap-1.5 text-xs font-black mt-1"
                                style={{ color: '#5B8DEF' }}>
                                <CalendarClock size={11} /> موعده {clockLabel(dueAtOf(order))}
                              </div>
                            )}
                          </div>

                          {/* Counts down while waiting, up once it's due. */}
                          <div className={`flex flex-col items-center px-3 py-1.5 rounded-xl font-black text-sm ${urg.pulse ? 'animate-pulse' : ''}`}
                            style={{ background: `${urg.color}22`, color: urg.color }}>
                            <span className="flex items-center gap-1.5">
                              <Clock size={13} /> {durationLabel(pastDue)}
                            </span>
                            {urg.waiting && <span className="text-[10px] font-bold leading-none mt-0.5">باقي</span>}
                            {pastDue >= 20 && <span className="text-[10px] font-bold leading-none mt-0.5">متأخر</span>}
                          </div>
                        </div>

                        {/* Items — the part that matters at a glance */}
                        <div className="px-4 py-3 space-y-2">
                          {order.items.map((it, i) => (
                            <div key={i} className="flex items-start gap-3">
                              <span className="font-black text-lg leading-none flex-shrink-0 px-2 py-1 rounded-lg"
                                style={{ background: 'rgba(231,210,183,0.12)', color: '#EAD9C2' }}>
                                {it.quantity}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-base leading-tight" style={{ color: '#F6EFE6' }}>
                                  {it.name}
                                </div>
                                {it.notes && (
                                  <div className="text-xs font-bold mt-0.5" style={{ color: '#F6B91A' }}>
                                    ← {it.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}

                          {order.notes && (
                            <div className="mt-2 px-3 py-2 rounded-xl text-sm font-bold"
                              style={{ background: 'rgba(224,167,44,0.12)', color: '#F6B91A' }}>
                              ملاحظة: {order.notes}
                            </div>
                          )}
                        </div>

                        {/* Advance */}
                        <button onClick={() => advance(order, col.next)}
                          className="w-full py-3.5 font-black text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-85 active:opacity-70"
                          style={{ background: col.accent, color: '#241318' }}>
                          {col.key === 'ready' ? <CheckCircle2 size={17} /> : <ChefHat size={17} />}
                          {col.nextLabel}
                        </button>
                      </motion.div>
                    )
                  })}

                {!list.length && (
                  <div className="rounded-2xl py-10 text-center"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(231,210,183,0.15)' }}>
                    <Receipt size={26} className="mx-auto mb-2" style={{ color: 'rgba(231,210,183,0.25)' }} />
                    <div className="text-sm font-bold" style={{ color: 'rgba(231,210,183,0.35)' }}>لا يوجد</div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
