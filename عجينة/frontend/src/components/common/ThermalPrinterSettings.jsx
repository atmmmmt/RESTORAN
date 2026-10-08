import { useState, useEffect, useCallback } from 'react'
import {
  Printer, Save, ChefHat, RefreshCw, Receipt,
  CheckCircle2, XCircle, Loader2, SlidersHorizontal, ChevronDown,
} from 'lucide-react'
import Button from './Button'
import toast from 'react-hot-toast'
import {
  getPrinterSettings, savePrinterSettings, testPrintAgent, listAgentPrinters,
  printThermalReceipt, printKitchenTicket, sampleOrder,
} from '../../services/thermalPrinter'

/* ── Small pieces ─────────────────────────────────────────────────────── */

const Field = ({ label, children, hint }) => (
  <label className="block">
    <span className="block text-xs font-bold text-brand-gray mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-brand-gray-light mt-1">{hint}</span>}
  </label>
)

const input = 'w-full border-2 border-brand-border rounded-xl px-3 py-2 text-sm font-bold focus:border-fuchsia outline-none transition'

/* An on/off that reads as on or off from across the counter, because the
   commonest failure here is a printer that was simply never switched on. */
const Toggle = ({ checked, onChange, label }) => (
  <button type="button" onClick={() => onChange(!checked)}
    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 font-bold text-sm transition
      ${checked ? 'border-brand-mint bg-brand-mint-bg text-brand-mint-dark' : 'border-brand-border text-brand-gray'}`}>
    <span className={`w-9 h-5 rounded-full relative transition ${checked ? 'bg-brand-mint' : 'bg-brand-gray-light'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-0.5' : 'left-4.5'}`}
        style={{ left: checked ? 2 : 18 }} />
    </span>
    {label}
  </button>
)

/* ── The screen ───────────────────────────────────────────────────────── */

export default function ThermalPrinterSettings() {
  const [form, setForm] = useState(getPrinterSettings)
  const [printers, setPrinters] = useState([])
  const [agent, setAgent] = useState({ state: 'checking' })
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState('')

  const kitchen = form.kitchen || {}
  const field = (k, v) => setForm(c => ({ ...c, [k]: v }))
  const kField = (k, v) => setForm(c => ({ ...c, kitchen: { ...(c.kitchen || {}), [k]: v } }))

  /* One check answers every question this screen depends on: is the helper
     running, is it current enough to know about USB, and which printers can
     it see. Run on open, so the answer is on screen before anyone asks. */
  const probe = useCallback(async (announce = false) => {
    setAgent({ state: 'checking' })
    try {
      const health = await testPrintAgent(form)
      let names = []
      try { names = await listAgentPrinters(form) } catch { /* reported below */ }
      setPrinters(names)
      setAgent({ state: 'ok', version: health.version, usb: health.usb, count: names.length })
      if (announce) toast.success('الوكيل متصل')
    } catch (e) {
      setPrinters([])
      setAgent({ state: 'down', message: e.message })
      if (announce) toast.error(e.message)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { probe() }, [probe])

  const save = () => { savePrinterSettings(form); toast.success('تم الحفظ على هذا الجهاز') }

  /* Tests print from what is stored, so save first — otherwise a just-typed
     address is tested against the previous one and the result means nothing. */
  const runTest = async (which) => {
    savePrinterSettings(form)
    setBusy(which)
    try {
      if (which === 'receipt') await printThermalReceipt(sampleOrder())
      else await printKitchenTicket(sampleOrder())
      toast.success('أُرسلت — تحقق من خروج الورقة')
    } catch (e) { toast.error(e.message) } finally { setBusy('') }
  }

  /* The picker falls back to a plain box: when the agent can't be reached the
     name is still readable in Windows, and refusing to accept it would leave
     the shop stuck behind a list that happens to be empty. */
  const PrinterPicker = ({ value, onChange }) => printers.length ? (
    <select className={input} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">— اختر الطابعة —</option>
      {value && !printers.includes(value) && <option value={value}>{value}</option>}
      {printers.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  ) : (
    <input className={input} value={value || ''} dir="ltr" placeholder="اسم الطابعة في ويندوز"
      onChange={e => onChange(e.target.value)} />
  )

  const Target = ({ conn, onConn, name, onName, ip, onIp, port, onPort }) => (
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="طريقة التوصيل">
        <select className={input} value={conn || 'network'} onChange={e => onConn(e.target.value)}>
          <option value="usb">USB — موصولة بهذا الجهاز</option>
          <option value="network">كبل شبكة — لها عنوان IP</option>
        </select>
      </Field>
      {conn === 'usb'
        ? <Field label="الطابعة"><PrinterPicker value={name} onChange={onName} /></Field>
        : <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Field label="عنوان الطابعة">
                <input className={input} dir="ltr" value={ip || ''} placeholder="192.168.1.114"
                  onChange={e => onIp(e.target.value)} />
              </Field>
            </div>
            <Field label="المنفذ">
              <input className={input} dir="ltr" type="number" value={port || 9100}
                onChange={e => onPort(Number(e.target.value))} />
            </Field>
          </div>}
    </div>
  )

  return <div className="lg:col-span-2 space-y-4">

    {/* ── Is the helper there? ─────────────────────────────────────── */}
    <div className={`rounded-2xl p-4 flex items-center gap-3 border-2 ${
      agent.state === 'ok'   ? 'bg-brand-mint-bg border-brand-mint' :
      agent.state === 'down' ? 'bg-red-50 border-red-300' :
                               'bg-brand-bg border-brand-border'}`}>
      {agent.state === 'checking' ? <Loader2 size={20} className="animate-spin text-brand-gray" />
        : agent.state === 'ok' ? <CheckCircle2 size={20} className="text-brand-mint-dark" />
        : <XCircle size={20} className="text-red-500" />}
      <div className="flex-1 min-w-0">
        <p className="font-black text-sm text-brand-dark">
          {agent.state === 'checking' ? 'جاري الفحص...'
            : agent.state === 'ok' ? 'برنامج الطباعة متصل'
            : 'برنامج الطباعة غير متصل'}
        </p>
        <p className="text-xs text-brand-gray truncate">
          {agent.state === 'ok'
            ? `Cloud Agent ${agent.version || '—'} · ${agent.count} طابعة متاحة`
            : agent.state === 'down'
              ? `${agent.message}`
              : ' '}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => probe(true)} icon={<RefreshCw size={14} />}>فحص</Button>
    </div>

    {/* ── Receipt printer ──────────────────────────────────────────── */}
    <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-fuchsia-lighter flex items-center justify-center shrink-0">
            <Receipt size={20} className="text-fuchsia" />
          </div>
          <div>
            <h2 className="font-black text-brand-dark">طابعة الفواتير</h2>
            <p className="text-xs text-brand-gray">فاتورة الزبون — تُطبع عند الكاشير</p>
          </div>
        </div>
        <Toggle checked={!!form.enabled} onChange={v => field('enabled', v)} label={form.enabled ? 'مفعّلة' : 'متوقفة'} />
      </div>

      {form.enabled && <>
        <Target
          conn={form.connection} onConn={v => field('connection', v)}
          name={form.printerName} onName={v => field('printerName', v)}
          ip={form.printerIp} onIp={v => field('printerIp', v)}
          port={form.printerPort} onPort={v => field('printerPort', v)}
        />
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <div className="text-xs font-bold text-brand-mint-dark bg-brand-mint-bg px-3 py-2 rounded-xl">
            طالما طابعة الفواتير مفعّلة، تُطبع فاتورة الكاشير تلقائياً مع كل طلب
          </div>
          <Button variant="outline" size="sm" loading={busy === 'receipt'}
            onClick={() => runTest('receipt')} icon={<Printer size={15} />}>طباعة تجربة</Button>
        </div>
      </>}
    </div>

    {/* ── Kitchen printer ──────────────────────────────────────────── */}
    <div className="bg-white rounded-2xl shadow-card p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-mint-bg flex items-center justify-center shrink-0">
            <ChefHat size={20} className="text-brand-mint-dark" />
          </div>
          <div>
            <h2 className="font-black text-brand-dark">طابعة المطبخ</h2>
            <p className="text-xs text-brand-gray">طابعة واحدة بالمطبخ — تفصل الطلب تلقائياً إلى وصولات المعجنات والمشاوي والمقبلات والمشروبات</p>
          </div>
        </div>
        <Toggle checked={!!kitchen.enabled} onChange={v => kField('enabled', v)} label={kitchen.enabled ? 'مفعّلة' : 'متوقفة'} />
      </div>

      {kitchen.enabled && <>
        <Target
          conn={kitchen.connection} onConn={v => kField('connection', v)}
          name={kitchen.printerName} onName={v => kField('printerName', v)}
          ip={kitchen.printerIp} onIp={v => kField('printerIp', v)}
          port={kitchen.printerPort} onPort={v => kField('printerPort', v)}
        />
        <div className="mt-4">
          <Button variant="outline" size="sm" loading={busy === 'kitchen'}
            onClick={() => runTest('kitchen')} icon={<ChefHat size={15} />}>طباعة تذكرة تجربة</Button>
        </div>
      </>}
    </div>

    {/* ── Everything that is set once and never touched again ──────── */}
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <button type="button" onClick={() => setAdvanced(a => !a)}
        className="w-full flex items-center gap-3 p-5 text-right hover:bg-brand-bg transition">
        <SlidersHorizontal size={18} className="text-brand-gray" />
        <span className="flex-1 font-black text-sm text-brand-dark">إعدادات متقدمة</span>
        <span className="text-xs text-brand-gray">شكل الفاتورة · الكثافة · الوكيل</span>
        <ChevronDown size={18} className={`text-brand-gray transition ${advanced ? 'rotate-180' : ''}`} />
      </button>

      {advanced && <div className="px-6 pb-6 pt-1 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-brand-border">
        <Field label="رأس الفاتورة">
          <input className={input} value={form.header || ''} onChange={e => field('header', e.target.value)} />
        </Field>
        <Field label="نهاية الفاتورة">
          <input className={input} value={form.footer || ''} onChange={e => field('footer', e.target.value)} />
        </Field>
        <Field label="حساب الانستغرام" hint="اتركه فارغاً لإخفاء السطر">
          <input className={input} dir="ltr" value={form.instagram || ''} placeholder="3ajineh.w.t7ineh"
            onChange={e => field('instagram', e.target.value)} />
        </Field>
        <Field label="رابط اللوغو" hint="اتركه فارغاً لإخفاء اللوغو">
          <input className={input} dir="ltr" value={form.logoUrl || ''} onChange={e => field('logoUrl', e.target.value)} />
        </Field>
        <Field label="عرض الورق">
          <select className={input} value={form.paperWidth} onChange={e => field('paperWidth', Number(e.target.value))}>
            <option value={80}>80mm</option><option value={58}>58mm</option>
          </select>
        </Field>
        <Field label="عدد النسخ">
          <input className={input} type="number" min="1" max="5" value={form.copies}
            onChange={e => field('copies', Number(e.target.value))} />
        </Field>
        <Field label="قص الورق تلقائياً">
          <select className={input} value={form.autoCut ? '1' : '0'} onChange={e => field('autoCut', e.target.value === '1')}>
            <option value="1">نعم</option><option value="0">لا</option>
          </select>
        </Field>
      </div>}
    </div>

    <div className="flex items-center gap-3">
      <Button onClick={save} icon={<Save size={16} />}>حفظ الإعدادات</Button>
      <p className="text-xs text-brand-gray">اختيار الطابعة محفوظ على هذا الجهاز، والاتصال يتم تلقائياً عبر السيرفر.</p>
    </div>
  </div>
}
