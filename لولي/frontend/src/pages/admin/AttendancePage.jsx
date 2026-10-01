import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Fingerprint, Wifi, WifiOff, RefreshCw, Search, Plug, PlugZap,
  Clock, CalendarDays, Users, UserPlus, Trash2, Download, Settings2,
  CheckCircle2, AlertTriangle, XCircle, LogIn, LogOut, Radio,
  ChevronLeft, Hand, Server, Timer, Wallet, Plus, Eye,
} from 'lucide-react'
import { attendanceAPI, employeesAPI, centersAPI } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../utils/formatters'
import PageHeader   from '../../components/common/PageHeader'
import Button       from '../../components/common/Button'
import Modal        from '../../components/common/Modal'
import LoadingState from '../../components/common/LoadingState'
import toast from 'react-hot-toast'

/* ── helpers ─────────────────────────────────────────────── */
const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const monthStart = () => todayKey().slice(0, 8) + '01'
const hhmm = iso => iso ? new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'
const hoursLabel = h => `${Math.floor(h)}س ${Math.round((h % 1) * 60)}د`

const FINGERS = [
  'الإبهام الأيمن', 'السبابة اليمنى', 'الوسطى اليمنى', 'البنصر الأيمن', 'الخنصر الأيمن',
  'الإبهام الأيسر', 'السبابة اليسرى', 'الوسطى اليسرى', 'البنصر الأيسر', 'الخنصر الأيسر',
]

const STATUS_META = {
  present: { label: 'حاضر',  color: '#2E7A4A', bg: 'rgba(46,122,74,0.12)',  Icon: CheckCircle2 },
  late:    { label: 'متأخر', color: '#E09810', bg: 'rgba(246,185,26,0.15)', Icon: AlertTriangle },
  absent:  { label: 'غائب',  color: '#C05050', bg: 'rgba(192,80,80,0.12)',  Icon: XCircle },
}

/* `adminOnly` tabs are about managing the terminal, not reading the day.
   A supervisor sees the board and the hours; enrolment and device setup
   belong to the admin. */
const TABS = [
  { key: 'daily',    label: 'الحضور اليومي', Icon: CalendarDays },
  { key: 'staff',    label: 'الموظفين والبصمات', Icon: Users, adminOnly: true },
  { key: 'reports',  label: 'التقارير والساعات', Icon: Wallet },
  { key: 'device',   label: 'جهاز البصمة', Icon: Server, adminOnly: true },
]

/* ── small building blocks ───────────────────────────────── */
function StatTile({ Icon, label, value, color, sub }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-card flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}1F` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-brand-gray font-bold">{label}</div>
        <div className="font-black text-brand-dark text-lg leading-tight truncate">{value}</div>
        {sub && <div className="text-xs text-brand-gray-light font-medium">{sub}</div>}
      </div>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-sm font-bold text-brand-dark mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-brand-gray-light mt-1 font-medium">{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold'

/* ══════════════════════════════════════════════════════════ */
export default function AttendancePage() {
  /* Supervisors may read the board — that is how they work out the day's
     wages — but never change anything. The API enforces the same split, so
     this only keeps the UI honest about what they can do. */
  const { isAdmin } = useAuth()
  const canEdit = isAdmin

  const [tab, setTab] = useState('daily')

  const [settings,  setSettings]  = useState(null)
  const [device,    setDevice]    = useState({ connected: false })
  const [driverOk,  setDriverOk]  = useState(true)

  const [date,   setDate]   = useState(todayKey)
  /* Branch scope: 'all' | 'hq' | <branchId>. Staff are attached to a branch,
     so without this the board mixes every site's employees together. */
  const [center, setCenter] = useState('all')
  const [branches, setBranches] = useState([])
  const [board,  setBoard]  = useState(null)
  const [loading, setLoading] = useState(true)

  const [employees, setEmployees] = useState([])
  const [busy,      setBusy]      = useState('')

  const [range,   setRange]   = useState({ from: monthStart(), to: todayKey() })
  const [summary, setSummary] = useState([])
  const [detail,  setDetail]  = useState(null)

  const [enrollFor, setEnrollFor] = useState(null)
  const [manualFor, setManualFor] = useState(null)
  const [manualAt,  setManualAt]  = useState('')
  const [live,      setLive]      = useState([])
  const [streaming, setStreaming] = useState(false)

  const esRef = useRef(null)

  /* ── loaders ── */
  const loadSettings = useCallback(async () => {
    try {
      const res = await attendanceAPI.getSettings()
      setSettings(res.data.settings)
      setDevice(res.data.device || { connected: false })
      setDriverOk(res.data.driverAvailable !== false)
    } catch (e) { toast.error(e.message) }
  }, [])

  const loadBoard = useCallback(async (d = date) => {
    try {
      const res = await attendanceAPI.daily(d, center)
      setBoard(res.data)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [date, center])

  const loadEmployees = useCallback(async () => {
    try {
      const res = await employeesAPI.getAll({ isActive: true })
      setEmployees(res.data.employees || [])
    } catch (e) { toast.error(e.message) }
  }, [])

  const loadBranches = useCallback(async () => {
    try {
      const res = await centersAPI.getAll()
      setBranches(res.data.centers || [])
    } catch { /* branch list is optional — a single-site shop has none */ }
  }, [])

  const loadSummary = useCallback(async () => {
    try {
      const res = await attendanceAPI.summary(range.from, range.to, center)
      setSummary(res.data.rows || [])
    } catch (e) { toast.error(e.message) }
  }, [range, center])

  useEffect(() => { loadSettings(); loadEmployees(); loadBranches() }, [loadSettings, loadEmployees, loadBranches])
  useEffect(() => { loadBoard(date) }, [date, loadBoard])
  useEffect(() => { if (tab === 'reports') loadSummary() }, [tab, loadSummary])

  /* ── live punch stream ── */
  useEffect(() => {
    const es = new EventSource(attendanceAPI.streamUrl())
    esRef.current = es

    es.addEventListener('hello', () => setStreaming(true))
    es.addEventListener('punch', e => {
      try {
        const p = JSON.parse(e.data)
        setLive(l => [{ ...p, id: `${p.devicePin}-${p.at}` }, ...l].slice(0, 12))
        toast.success(`${p.name} — ${hhmm(p.at)}`, { icon: <Hand size={16} /> })
        loadBoard()
      } catch { /* malformed frame */ }
    })
    es.onerror = () => setStreaming(false)

    return () => { es.close(); esRef.current = null }
    // Board reload is intentionally captured once — the stream lives for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── device actions ── */
  const run = async (key, fn, okMsg) => {
    setBusy(key)
    try {
      const res = await fn()
      if (okMsg !== null) toast.success(res?.data?.message || okMsg)
      return res
    } catch (e) {
      toast.error(e.message)
    } finally { setBusy('') }
  }

  const doConnect    = () => run('connect', attendanceAPI.connect, 'تم الاتصال').then(loadSettings)
  const doDisconnect = () => run('disconnect', attendanceAPI.disconnect, 'تم قطع الاتصال').then(loadSettings)
  const doSync       = () => run('sync', attendanceAPI.sync, 'تمت المزامنة').then(() => { loadBoard(); loadEmployees() })
  const doSyncTime   = () => run('time', attendanceAPI.syncTime, 'تمت مزامنة الساعة')

  const doTestPort = () => run('test', () =>
    attendanceAPI.testPort({ ip: settings.deviceIp, port: settings.devicePort }), 'تم الفحص')

  const doScan = async () => {
    setBusy('scan')
    try {
      const res = await attendanceAPI.scan({ baseIp: settings.deviceIp, port: settings.devicePort })
      const found = res.data.found || []
      if (!found.length) toast.error('لم يُعثر على أجهزة على الشبكة')
      else {
        toast.success(`تم العثور على: ${found.join('، ')}`)
        setSettings(s => ({ ...s, deviceIp: found[0] }))
      }
    } catch (e) { toast.error(e.message) } finally { setBusy('') }
  }

  const saveSettings = () => run('save', () => attendanceAPI.saveSettings(settings), 'تم الحفظ').then(loadSettings)

  const pushEmployee = emp =>
    run(`push-${emp._id}`, () => attendanceAPI.pushEmployee(emp._id), 'تم الإرسال').then(loadEmployees)

  const startEnroll = async fingerIndex => {
    const emp = enrollFor
    setEnrollFor(null)
    await run(`enroll-${emp._id}`, () => attendanceAPI.enroll(emp._id, fingerIndex),
      'الجهاز جاهز — ضع الإصبع 3 مرات')
    loadEmployees()
  }

  const clearPrints = async emp => {
    if (!confirm(`مسح بصمات "${emp.name}" من الجهاز؟`)) return
    await run(`clear-${emp._id}`, () => attendanceAPI.clearPrints(emp._id), 'تم المسح')
    loadEmployees()
  }

  const addManualPunch = async () => {
    if (!manualAt) return toast.error('اختر التوقيت')
    await run('manual', () => attendanceAPI.punch({ employeeId: manualFor._id, at: manualAt }), 'تمت الإضافة')
    setManualFor(null); setManualAt('')
    loadBoard()
  }

  const deletePunch = async id => {
    if (!confirm('حذف هذه الحركة؟')) return
    await run('del', () => attendanceAPI.deletePunch(id), 'تم الحذف')
    loadBoard()
  }

  const openDetail = async emp => {
    try {
      const res = await attendanceAPI.employee(emp.id || emp._id, range.from, range.to)
      setDetail(res.data)
    } catch (e) { toast.error(e.message) }
  }

  const exportCsv = () => {
    if (!board?.rows?.length) return
    const head = ['الموظف', 'الحالة', 'الدخول', 'الخروج', 'الساعات', 'التأخر (دقيقة)', 'سعر الساعة', 'أجر اليوم']
    const rows = board.rows.map(r => [
      r.name, STATUS_META[r.status].label, hhmm(r.checkIn), hhmm(r.checkOut),
      r.workedHours, r.lateMinutes, r.hourlyRate, r.dayPay,
    ])
    const csv = '﻿' + [head, ...rows].map(r => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `الحضور-${date}.csv` })
    a.click(); URL.revokeObjectURL(url)
  }

  const connected = device?.connected

  return (
    <div>
      <PageHeader
        title="الحضور والبصمة"
        subtitle="إدارة جهاز البصمة وحضور الموظفين وحساب ساعات العمل"
        actions={
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black ${
              connected ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
            }`}>
              {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
              {connected ? `متصل (${String(device.mode || '').toUpperCase()})` : 'غير متصل'}
            </div>
            {canEdit ? (
              <Button size="sm" variant="outline" onClick={doSync} loading={busy === 'sync'} icon={<RefreshCw size={14} />}>
                مزامنة
              </Button>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-brand-bg text-brand-gray">
                <Eye size={13} /> عرض فقط
              </span>
            )}
          </div>
        }
      />

      {!driverOk && (
        <div className="mb-5 rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(246,185,26,0.12)', border: '1px solid rgba(246,185,26,0.35)' }}>
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm font-bold text-amber-800">
            حزمة <code className="font-mono">zkteco-js</code> غير مثبتة على الخادم — ميزات الجهاز معطّلة.
            <div className="font-medium text-xs mt-1">شغّل في مجلد backend: <code className="font-mono">npm i zkteco-js</code></div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide">
        {TABS.filter(t => !t.adminOnly || canEdit).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-all ${
              tab === key ? 'bg-fuchsia text-white shadow-md' : 'bg-white text-brand-gray hover:text-brand-dark shadow-card'
            }`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ══ DAILY ══ */}
      {tab === 'daily' && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-4 py-2.5 border-2 border-brand-border rounded-xl font-bold focus:border-fuchsia focus:outline-none" />
            <Button size="sm" variant="ghost" onClick={() => setDate(todayKey())}>اليوم</Button>

            {/* Only worth showing once there is more than one site. */}
            {branches.length > 0 && (
              <select value={center} onChange={e => setCenter(e.target.value)}
                className="px-4 py-2.5 border-2 border-brand-border rounded-xl font-bold text-sm bg-white focus:border-fuchsia focus:outline-none">
                <option value="all">كل الفروع</option>
                <option value="hq">المركز الرئيسي</option>
                {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            )}
            <div className="flex-1" />
            {streaming && (
              <span className="flex items-center gap-1.5 text-xs font-black text-green-600">
                <Radio size={13} className="animate-pulse" /> البث الفوري نشط
              </span>
            )}
            <Button size="sm" variant="outline" onClick={exportCsv} icon={<Download size={14} />}>تصدير CSV</Button>
          </div>

          {board && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
              <StatTile Icon={CheckCircle2} label="حاضر" value={board.totals.present} color="#2E7A4A" />
              <StatTile Icon={AlertTriangle} label="متأخر" value={board.totals.late} color="#E09810" />
              <StatTile Icon={XCircle} label="غائب" value={board.totals.absent} color="#C05050" />
              <StatTile Icon={Timer} label="إجمالي الساعات" value={hoursLabel(board.totals.hours)} color="#C18A4A" />
              <StatTile Icon={Wallet} label="أجور اليوم" value={formatCurrency(board.totals.pay)} color="#4A6AB8" />
            </div>
          )}

          {/* live feed */}
          <AnimatePresence>
            {live.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="bg-white rounded-2xl p-4 shadow-card mb-5 overflow-hidden">
                <div className="flex items-center gap-2 mb-3 text-sm font-black text-brand-dark">
                  <Radio size={15} className="text-green-600" /> بصمات لحظية
                </div>
                <div className="flex flex-wrap gap-2">
                  {live.map(p => (
                    <span key={p.id} className="text-xs px-3 py-1.5 rounded-xl font-bold bg-green-50 text-green-700">
                      {p.name} · {hhmm(p.at)}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {loading ? <LoadingState /> : !board?.rows?.length ? (
            <div className="bg-white rounded-2xl p-12 text-center shadow-card">
              <Users size={36} className="mx-auto mb-3 text-brand-gray-light" />
              <div className="font-black text-brand-gray">لا يوجد موظفون نشطون</div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-brand-bg text-brand-gray text-xs font-black">
                      <th className="text-right p-4">الموظف</th>
                      <th className="text-right p-4">الحالة</th>
                      <th className="text-right p-4">الدخول</th>
                      <th className="text-right p-4">الخروج</th>
                      <th className="text-right p-4">الساعات</th>
                      <th className="text-right p-4">أجر اليوم</th>
                      <th className="text-right p-4">البصمات</th>
                      <th className="p-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.rows.map(r => {
                      const meta = STATUS_META[r.status]
                      return (
                        <tr key={r.employeeId} className="border-t border-brand-border hover:bg-brand-bg/50 transition-colors">
                          <td className="p-4">
                            <div className="font-black text-brand-dark">{r.name}</div>
                            {r.role && <div className="text-xs text-brand-gray font-medium">{r.role}</div>}
                          </td>
                          <td className="p-4">
                            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-black"
                              style={{ background: meta.bg, color: meta.color }}>
                              <meta.Icon size={12} /> {meta.label}
                              {r.lateMinutes > 0 && ` ${r.lateMinutes}د`}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-brand-dark">{hhmm(r.checkIn)}</td>
                          <td className="p-4 font-bold text-brand-dark">
                            {r.stillIn ? <span className="text-green-600 text-xs font-black">ما زال بالداخل</span> : hhmm(r.checkOut)}
                          </td>
                          <td className="p-4 font-black text-fuchsia">{hoursLabel(r.workedHours)}</td>
                          <td className="p-4 font-black text-brand-dark">{formatCurrency(r.dayPay)}</td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1 max-w-[220px]">
                              {r.punches.map(p => {
                                const chip = (
                                  <>
                                    {p.direction === 'in' ? <LogIn size={9} className="inline" /> : <LogOut size={9} className="inline" />}
                                    {' '}{hhmm(p.at)}
                                  </>
                                )
                                const tone = p.direction === 'in'
                                  ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                                // Read-only viewers get the same chip without the delete action.
                                return canEdit ? (
                                  <button key={p.id} onClick={() => deletePunch(p.id)} title="حذف الحركة"
                                    className={`text-[11px] px-2 py-0.5 rounded-lg font-bold transition-opacity hover:opacity-60 ${tone}`}>
                                    {chip}
                                  </button>
                                ) : (
                                  <span key={p.id} className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${tone}`}>
                                    {chip}
                                  </span>
                                )
                              })}
                              {!r.punches.length && <span className="text-xs text-brand-gray-light font-medium">—</span>}
                            </div>
                          </td>
                          <td className="p-4">
                            {canEdit && (
                              <button onClick={() => { setManualFor({ _id: r.employeeId, name: r.name }); setManualAt(`${date}T08:00`) }}
                                title="إضافة حركة يدوية"
                                className="text-xs bg-fuchsia-bg text-fuchsia px-2.5 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors">
                                <Plus size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ STAFF ══ */}
      {tab === 'staff' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map(emp => (
            <div key={emp._id} className="bg-white rounded-2xl shadow-card overflow-hidden">
              <div className="p-5 border-b border-brand-border">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{ background: emp.fingerprintEnrolled ? 'rgba(46,122,74,0.12)' : 'rgba(169,103,52,0.1)' }}>
                    <Fingerprint size={20} style={{ color: emp.fingerprintEnrolled ? '#2E7A4A' : '#C18A4A' }} />
                  </div>
                  {emp.devicePin
                    ? <span className="text-xs px-2 py-1 rounded-lg font-black bg-fuchsia-bg text-fuchsia">PIN {emp.devicePin}</span>
                    : <span className="text-xs px-2 py-1 rounded-lg font-bold bg-brand-bg text-brand-gray-light">غير مرتبط</span>}
                </div>
                <div className="font-black text-brand-dark">{emp.name}</div>
                <div className="text-xs text-brand-gray font-medium">{emp.role || 'موظف'}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold flex items-center gap-1 ${
                    emp.syncedToDevice ? 'bg-green-50 text-green-600' : 'bg-brand-bg text-brand-gray-light'}`}>
                    {emp.syncedToDevice ? <><CheckCircle2 size={11} /> على الجهاز</> : 'غير مُرسَل'}
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold flex items-center gap-1 ${
                    emp.fingerprintEnrolled ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                    {emp.fingerprintEnrolled ? <><CheckCircle2 size={11} /> بصمة مسجّلة</> : 'بلا بصمة'}
                  </span>
                </div>
              </div>

              <div className="p-4 flex flex-wrap gap-2">
                <button onClick={() => pushEmployee(emp)} disabled={busy === `push-${emp._id}`}
                  className="text-xs bg-fuchsia-bg text-fuchsia px-3 py-1.5 rounded-lg font-bold hover:bg-fuchsia-light transition-colors flex items-center gap-1 disabled:opacity-50">
                  <UserPlus size={12} /> إرسال للجهاز
                </button>
                <button onClick={() => setEnrollFor(emp)} disabled={!emp.devicePin}
                  className="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg font-bold hover:bg-green-100 transition-colors flex items-center gap-1 disabled:opacity-40">
                  <Hand size={12} /> تسجيل بصمة
                </button>
                {emp.fingerprintEnrolled && (
                  <button onClick={() => clearPrints(emp)}
                    className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center gap-1">
                    <Trash2 size={12} /> مسح البصمات
                  </button>
                )}
              </div>
            </div>
          ))}
          {!employees.length && (
            <div className="col-span-full bg-white rounded-2xl p-12 text-center shadow-card">
              <Users size={36} className="mx-auto mb-3 text-brand-gray-light" />
              <div className="font-black text-brand-gray mb-1">لا يوجد موظفون</div>
              <div className="text-sm text-brand-gray-light font-medium">أضف الموظفين من صفحة "الموظفين" أولاً</div>
            </div>
          )}
        </div>
      )}

      {/* ══ REPORTS ══ */}
      {tab === 'reports' && (
        <div>
          <div className="flex flex-wrap items-end gap-3 mb-5 bg-white rounded-2xl p-4 shadow-card">
            <Field label="من">
              <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
                className="px-4 py-2.5 border-2 border-brand-border rounded-xl font-bold focus:border-fuchsia focus:outline-none" />
            </Field>
            <Field label="إلى">
              <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
                className="px-4 py-2.5 border-2 border-brand-border rounded-xl font-bold focus:border-fuchsia focus:outline-none" />
            </Field>
            <div className="flex gap-2 pb-0.5">
              <Button size="sm" variant="ghost" onClick={() => {
                const d = new Date(); d.setDate(d.getDate() - 6)
                setRange({ from: d.toISOString().slice(0, 10), to: todayKey() })
              }}>آخر أسبوع</Button>
              <Button size="sm" variant="ghost" onClick={() => setRange({ from: monthStart(), to: todayKey() })}>هذا الشهر</Button>
              <Button size="sm" onClick={loadSummary} icon={<RefreshCw size={14} />}>تحديث</Button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-bg text-brand-gray text-xs font-black">
                    <th className="text-right p-4">الموظف</th>
                    <th className="text-right p-4">أيام الحضور</th>
                    <th className="text-right p-4">إجمالي الساعات</th>
                    <th className="text-right p-4">ساعات التأخر</th>
                    <th className="text-right p-4">سعر الساعة</th>
                    <th className="text-right p-4">المستحق</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(r => (
                    <tr key={r.id} className="border-t border-brand-border hover:bg-brand-bg/50 transition-colors">
                      <td className="p-4">
                        <div className="font-black text-brand-dark">{r.name}</div>
                        {r.role && <div className="text-xs text-brand-gray font-medium">{r.role}</div>}
                      </td>
                      <td className="p-4 font-bold text-brand-dark">{r.daysAttended} يوم</td>
                      <td className="p-4 font-black text-fuchsia">{hoursLabel(r.totalHours)}</td>
                      <td className="p-4 font-bold text-amber-600">{r.lateHours > 0 ? hoursLabel(r.lateHours) : '—'}</td>
                      <td className="p-4 font-bold text-brand-gray">{formatCurrency(r.hourlyRate)}</td>
                      <td className="p-4 font-black text-brand-dark">{formatCurrency(r.totalPay)}</td>
                      <td className="p-4">
                        <button onClick={() => openDetail(r)}
                          className="text-xs bg-brand-bg text-brand-gray px-3 py-1.5 rounded-lg font-bold hover:bg-brand-offwhite transition-colors flex items-center gap-1">
                          التفاصيل <ChevronLeft size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!summary.length && (
                    <tr><td colSpan={7} className="p-12 text-center text-brand-gray font-bold">لا توجد بيانات في هذه الفترة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ DEVICE ══ */}
      {tab === 'device' && settings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Connection */}
          <div className="bg-white rounded-2xl p-6 shadow-card space-y-4">
            <h3 className="font-black text-brand-dark flex items-center gap-2">
              <Plug size={17} className="text-fuchsia" /> الاتصال بالجهاز
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <Field label="عنوان IP">
                <input value={settings.deviceIp} onChange={e => setSettings(s => ({ ...s, deviceIp: e.target.value }))}
                  dir="ltr" className={inputCls} />
              </Field>
              <Field label="المنفذ">
                <input type="number" value={settings.devicePort}
                  onChange={e => setSettings(s => ({ ...s, devicePort: Number(e.target.value) }))}
                  dir="ltr" className={inputCls} />
              </Field>
            </div>

            <Field label="مهلة الاتصال (ميلي ثانية)" hint="ارفعها إذا كانت الشبكة بطيئة">
              <input type="number" value={settings.deviceTimeout}
                onChange={e => setSettings(s => ({ ...s, deviceTimeout: Number(e.target.value) }))}
                dir="ltr" className={inputCls} />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={doTestPort} loading={busy === 'test'} icon={<Search size={14} />}>
                فحص المنفذ
              </Button>
              <Button size="sm" variant="outline" onClick={doScan} loading={busy === 'scan'} icon={<Search size={14} />}>
                بحث بالشبكة
              </Button>
              {connected ? (
                <Button size="sm" variant="danger" onClick={doDisconnect} loading={busy === 'disconnect'} icon={<PlugZap size={14} />}>
                  قطع الاتصال
                </Button>
              ) : (
                <Button size="sm" onClick={doConnect} loading={busy === 'connect'} icon={<Plug size={14} />}>
                  اتصال
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={doSyncTime} loading={busy === 'time'} icon={<Clock size={14} />}>
                ضبط ساعة الجهاز
              </Button>
            </div>

            {(settings.deviceName || settings.deviceSerial) && (
              <div className="rounded-xl p-4 bg-brand-bg space-y-1.5 text-sm">
                {settings.deviceName    && <div><span className="text-brand-gray font-bold">الاسم:</span> <span className="font-black text-brand-dark">{settings.deviceName}</span></div>}
                {settings.deviceSerial  && <div><span className="text-brand-gray font-bold">الرقم التسلسلي:</span> <span className="font-black text-brand-dark" dir="ltr">{settings.deviceSerial}</span></div>}
                {settings.deviceVersion && <div><span className="text-brand-gray font-bold">الإصدار:</span> <span className="font-black text-brand-dark" dir="ltr">{settings.deviceVersion}</span></div>}
                {settings.lastSyncAt    && <div><span className="text-brand-gray font-bold">آخر مزامنة:</span> <span className="font-black text-brand-dark">{new Date(settings.lastSyncAt).toLocaleString('ar-EG')}</span></div>}
              </div>
            )}
          </div>

          {/* Shift + sync rules */}
          <div className="bg-white rounded-2xl p-6 shadow-card space-y-4">
            <h3 className="font-black text-brand-dark flex items-center gap-2">
              <Settings2 size={17} className="text-fuchsia" /> إعدادات الدوام والمزامنة
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <Field label="بداية الدوام">
                <input type="time" value={settings.workStartTime}
                  onChange={e => setSettings(s => ({ ...s, workStartTime: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="نهاية الدوام">
                <input type="time" value={settings.workEndTime}
                  onChange={e => setSettings(s => ({ ...s, workEndTime: e.target.value }))} className={inputCls} />
              </Field>
            </div>

            <Field label="فترة السماح بالتأخير (دقيقة)" hint="بعدها تُحتسب الحركة تأخيراً">
              <input type="number" min="0" value={settings.graceMinutes}
                onChange={e => setSettings(s => ({ ...s, graceMinutes: Number(e.target.value) }))} className={inputCls} />
            </Field>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.autoSyncEnabled}
                onChange={e => setSettings(s => ({ ...s, autoSyncEnabled: e.target.checked }))}
                className="w-4 h-4 accent-fuchsia" />
              <span className="text-sm font-bold text-brand-dark">تفعيل المزامنة التلقائية</span>
            </label>

            {settings.autoSyncEnabled && (
              <Field label="كل كم ثانية؟" hint="من 5 ثوانٍ إلى ساعة (3600)">
                <input type="number" min="5" max="3600" value={settings.autoSyncSeconds}
                  onChange={e => setSettings(s => ({ ...s, autoSyncSeconds: Number(e.target.value) }))} className={inputCls} />
              </Field>
            )}

            <Button onClick={saveSettings} loading={busy === 'save'} className="w-full">حفظ الإعدادات</Button>

            <div className="pt-3 border-t border-brand-border">
              <button
                onClick={async () => {
                  if (!confirm('مسح جميع حركات الحضور المحلية؟ الإعدادات والموظفون لن يتأثروا.')) return
                  await run('reset', () => attendanceAPI.reset({ logs: true }), 'تم المسح')
                  loadBoard()
                }}
                className="text-xs text-red-500 font-bold hover:text-red-600 flex items-center gap-1.5">
                <Trash2 size={13} /> مسح جميع حركات الحضور
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Enroll finger picker ── */}
      <Modal open={!!enrollFor} onClose={() => setEnrollFor(null)} title={`تسجيل بصمة — ${enrollFor?.name || ''}`}>
        <p className="text-sm text-brand-gray font-medium mb-4 leading-relaxed">
          اختر الإصبع، وسيدخل الجهاز مباشرة في وضع التسجيل. يضع الموظف إصبعه <b>3 مرات</b> على الجهاز لإتمام العملية.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FINGERS.map((label, i) => (
            <button key={i} onClick={() => startEnroll(i)}
              className="p-3 rounded-xl border-2 border-brand-border hover:border-fuchsia hover:bg-fuchsia-bg text-sm font-bold text-brand-dark transition-all flex items-center gap-2">
              <Fingerprint size={15} className="text-fuchsia" /> {label}
            </button>
          ))}
        </div>
      </Modal>

      {/* ── Manual punch ── */}
      <Modal open={!!manualFor} onClose={() => setManualFor(null)} title={`حركة يدوية — ${manualFor?.name || ''}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-brand-gray font-medium leading-relaxed">
            استخدمها إذا نسي الموظف البصم أو كان الجهاز معطّلاً. تُحسب الحركات بالتناوب: الأولى دخول، الثانية خروج.
          </p>
          <Field label="التوقيت">
            <input type="datetime-local" value={manualAt} onChange={e => setManualAt(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex gap-3">
            <Button onClick={addManualPunch} loading={busy === 'manual'} className="flex-1">إضافة الحركة</Button>
            <Button variant="ghost" onClick={() => setManualFor(null)}>إلغاء</Button>
          </div>
        </div>
      </Modal>

      {/* ── Employee detail ── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`تفاصيل — ${detail?.employee?.name || ''}`} size="lg">
        {detail && (
          <div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <StatTile Icon={CalendarDays} label="أيام الحضور" value={`${detail.totals.daysAttended} يوم`} color="#C18A4A" />
              <StatTile Icon={Timer} label="إجمالي الساعات" value={hoursLabel(detail.totals.totalHours)} color="#4A6AB8" />
              <StatTile Icon={AlertTriangle} label="ساعات التأخر" value={hoursLabel(detail.totals.lateHours)} color="#E09810" />
              <StatTile Icon={Wallet} label="المستحق" value={formatCurrency(detail.totals.totalPay)} color="#2E7A4A" />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-brand-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-bg text-brand-gray text-xs font-black">
                    <th className="text-right p-3">التاريخ</th>
                    <th className="text-right p-3">الدخول</th>
                    <th className="text-right p-3">الخروج</th>
                    <th className="text-right p-3">الساعات</th>
                    <th className="text-right p-3">التأخر</th>
                    <th className="text-right p-3">الأجر</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.days.map(d => (
                    <tr key={d.date} className="border-t border-brand-border">
                      <td className="p-3 font-bold text-brand-dark">{d.date}</td>
                      <td className="p-3 font-bold">{hhmm(d.checkIn)}</td>
                      <td className="p-3 font-bold">{hhmm(d.checkOut)}</td>
                      <td className="p-3 font-black text-fuchsia">{hoursLabel(d.workedHours)}</td>
                      <td className="p-3 font-bold text-amber-600">{d.lateMinutes > 0 ? `${d.lateMinutes}د` : '—'}</td>
                      <td className="p-3 font-black text-brand-dark">{formatCurrency(d.pay)}</td>
                    </tr>
                  ))}
                  {!detail.days.length && (
                    <tr><td colSpan={6} className="p-8 text-center text-brand-gray font-bold">لا حضور في هذه الفترة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
