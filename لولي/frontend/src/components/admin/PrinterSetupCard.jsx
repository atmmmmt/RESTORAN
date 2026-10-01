import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Printer, Radar, Receipt, ChefHat, Save, Wifi, WifiOff, Check, Search } from 'lucide-react'
import { printerAPI } from '../../services/api'
import { renderCashierTicket } from '../../utils/ticketRenderer'
import { printToStation, setPrinterSettingsCache } from '../../utils/printTicket'
import Button from '../common/Button'
import toast from 'react-hot-toast'

const STATIONS = [
  { key: 'cashier', label: 'طابعة الكاشير', Icon: Receipt },
  { key: 'kitchen', label: 'طابعة المطبخ', Icon: ChefHat },
]

/**
 * Receipt printer setup: scan the network, pick which found printer is the
 * cashier's and which is the kitchen's (the same one is fine while there's
 * only one), save, and fire a test ticket at each.
 */
export default function PrinterSetupCard() {
  const [printer, setPrinter] = useState({ cashierIp: '', cashierPort: 9100, cashierEnabled: false, kitchenIp: '', kitchenPort: 9100, kitchenEnabled: false, autoPrint: 'off' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scan, setScan] = useState(null) // { subnets, found }
  const [scanning, setScanning] = useState(false)
  const [manualBase, setManualBase] = useState('')
  const [busy, setBusy] = useState(null) // `${station}:test|print`
  const [status, setStatus] = useState({}) // station → { open, message }

  useEffect(() => {
    printerAPI.getSettings()
      .then(r => setPrinter(p => ({ ...p, ...(r.data.settings || {}) })))
      .finally(() => setLoading(false))
  }, [])

  const runScan = async (baseIp) => {
    setScanning(true)
    try {
      const r = await printerAPI.scan(baseIp || undefined)
      setScan(r.data)
      r.data.found.length ? toast.success(r.data.message) : toast.error(r.data.message)
    } catch (e) { toast.error(e.message || 'فشل البحث') }
    finally { setScanning(false) }
  }

  const assign = (station, ip) =>
    setPrinter(p => ({ ...p, [`${station}Ip`]: ip, [`${station}Port`]: p[`${station}Port`] || 9100, [`${station}Enabled`]: true }))

  const save = async () => {
    setSaving(true)
    try {
      const r = await printerAPI.saveSettings(printer)
      setPrinter(r.data.settings)
      setPrinterSettingsCache(r.data.settings)
      toast.success('تم حفظ إعدادات الطابعة')
      return true
    } catch (e) { toast.error(e.message || 'فشل الحفظ'); return false }
    finally { setSaving(false) }
  }

  const testConnection = async station => {
    const ip = printer[`${station}Ip`]
    if (!ip) return toast.error('اختر أو اكتب عنوان الطابعة أولاً')
    setBusy(`${station}:test`)
    try {
      const r = await printerAPI.probe(ip, printer[`${station}Port`])
      setStatus(s => ({ ...s, [station]: r.data }))
      r.data.open ? toast.success(r.data.message) : toast.error(r.data.message)
    } catch (e) { toast.error(e.message) }
    finally { setBusy(null) }
  }

  const testPrint = async station => {
    const ip = printer[`${station}Ip`]
    if (!ip) return toast.error('اختر أو اكتب عنوان الطابعة أولاً')
    setBusy(`${station}:print`)
    try {
      const now = new Date().toISOString()
      const raster = await renderCashierTicket({
        orderNumber: station === 'kitchen' ? 'تجربة المطبخ' : 'تجربة الكاشير',
        createdAt: now, orderType: 'takeaway', paymentMethod: 'cash', fulfillmentType: 'asap',
        items: [{ name: 'فاتورة تجريبية', quantity: 1, lineTotal: 0 }],
        subtotal: 0, discount: 0, total: 0, notes: `الطابعة ${ip} تعمل بشكل صحيح ✓`,
      })
      toast.success(await printToStation(station, raster, { ip, port: printer[`${station}Port`] || 9100 }))
    } catch (e) { toast.error(e.message || 'فشلت الطباعة') }
    finally { setBusy(null) }
  }

  const input = 'w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm'

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }}
      className="bg-white rounded-2xl shadow-card p-6 lg:col-span-2">
      <h2 className="font-black text-brand-dark mb-1 flex items-center gap-2">
        <Printer size={18} className="text-fuchsia" /> طابعات الفواتير
      </h2>
      <p className="text-brand-gray text-sm font-medium mb-5">
        اضغط «ابحث عن الطابعات»، واختر من القائمة أي طابعة للكاشير وأي وحدة للمطبخ — إذا عندك طابعة وحدة اخترها للاثنين. الفواتير بتنطبع مباشرة بدون نافذة طباعة.
      </p>

      {loading ? <div className="h-32 rounded-2xl bg-brand-bg animate-pulse" /> : (
        <div className="space-y-5">
          {/* ── Scan ── */}
          <div className="bg-brand-bg rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => runScan()} loading={scanning} icon={<Radar size={15} />}>
                ابحث عن الطابعات
              </Button>
              <div className="flex items-center gap-2">
                <input value={manualBase} onChange={e => setManualBase(e.target.value.trim())} dir="ltr"
                  placeholder="192.168.123.1" className="w-40 px-3 py-2.5 border-2 border-brand-border rounded-xl font-bold text-sm bg-white" />
                <Button variant="outline" size="sm" disabled={!manualBase || scanning} onClick={() => runScan(manualBase)} icon={<Search size={14} />}>
                  ابحث بهالشبكة
                </Button>
              </div>
            </div>

            {scanning && <div className="text-sm font-bold text-brand-gray mt-3">جاري البحث بكل شبكات الجهاز… (حوالي 10 ثواني)</div>}

            {scan && !scanning && (
              <div className="mt-4">
                {scan.found.length === 0 ? (
                  <div className="text-sm font-bold text-red-600 bg-red-50 rounded-xl p-3 leading-relaxed">
                    ما لقينا أي طابعة. تأكد إن الطابعة شغّالة وكبل الشبكة موصول وضو المنفذ عم يضوي،
                    وإن الطابعة والجهاز على نفس الراوتر. الشبكات يلي انبحث فيها: <span dir="ltr">{scan.subnets.map(s => s + '.x').join('  ·  ')}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs font-black text-brand-gray">الطابعات الموجودة — اختر لكل محطة:</div>
                    {scan.found.map(({ ip }) => (
                      <div key={ip} className="flex flex-wrap items-center gap-2 bg-white border-2 border-brand-border rounded-xl px-4 py-3">
                        <Printer size={16} className="text-fuchsia" />
                        <span className="font-black text-brand-dark" dir="ltr">{ip}</span>
                        <div className="flex gap-2 mr-auto">
                          {STATIONS.map(st => {
                            const chosen = printer[`${st.key}Ip`] === ip
                            return (
                              <button key={st.key} type="button" onClick={() => assign(st.key, ip)}
                                className={`text-xs font-black px-3 py-2 rounded-lg flex items-center gap-1 transition-colors ${
                                  chosen ? 'bg-fuchsia text-white' : 'bg-brand-bg text-brand-dark hover:bg-fuchsia/10'
                                }`}>
                                {chosen ? <Check size={13} /> : <st.Icon size={13} />} {st.key === 'cashier' ? 'للكاشير' : 'للمطبخ'}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Stations ── */}
          <div className="grid lg:grid-cols-2 gap-4">
            {STATIONS.map(({ key, label, Icon }) => (
              <div key={key} className="border-2 border-brand-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="font-black text-brand-dark flex items-center gap-2">
                    <Icon size={16} className="text-fuchsia" /> {label}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs font-bold text-brand-gray">مفعّلة</span>
                    <input type="checkbox" checked={!!printer[`${key}Enabled`]}
                      onChange={e => setPrinter(p => ({ ...p, [`${key}Enabled`]: e.target.checked }))}
                      className="w-5 h-5 accent-fuchsia" />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-brand-dark mb-1.5 block">عنوان IP</label>
                    <input type="text" value={printer[`${key}Ip`] || ''} dir="ltr"
                      onChange={e => setPrinter(p => ({ ...p, [`${key}Ip`]: e.target.value.trim() }))}
                      placeholder="اختر من البحث أو اكتب" className={input} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-brand-dark mb-1.5 block">المنفذ</label>
                    <input type="number" value={printer[`${key}Port`] || 9100} dir="ltr"
                      onChange={e => setPrinter(p => ({ ...p, [`${key}Port`]: Number(e.target.value) || 9100 }))}
                      className={input} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <Button variant="outline" size="sm" loading={busy === `${key}:test`} onClick={() => testConnection(key)} icon={<Radar size={14} />}>
                    اختبار الاتصال
                  </Button>
                  <Button variant="outline" size="sm" loading={busy === `${key}:print`} onClick={() => testPrint(key)} icon={<Printer size={14} />}>
                    طباعة تجريبية
                  </Button>
                  {status[key] && (
                    <span className={`text-xs font-black flex items-center gap-1 ${status[key].open ? 'text-green-600' : 'text-red-500'}`}>
                      {status[key].open ? <Wifi size={13} /> : <WifiOff size={13} />} {status[key].message}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Auto-print on confirm ── */}
          <div className="border-2 border-brand-border rounded-2xl p-5">
            <div className="font-black text-brand-dark mb-1 flex items-center gap-2">
              <Printer size={16} className="text-fuchsia" /> الطباعة التلقائية عند تأكيد الطلب
            </div>
            <p className="text-xs text-brand-gray font-bold mb-4">
              لما الكاشير يأكّد الطلب، شو ينطبع لحاله بدون ما يضغط شي؟ الفاتورتين بيطلعوا ورا بعض — إذا عندك طابعة وحدة بيطلعوا منها الاثنين.
            </p>
            <div className="grid sm:grid-cols-3 gap-2">
              {[
                ['off', 'بدون طباعة تلقائية', 'الطباعة من نافذة الفاتورة يدوياً'],
                ['cashier', 'فاتورة الزبون فقط', 'فاتورة الكاشير بالأسعار'],
                ['both', 'الزبون ثم المطبخ', 'فاتورة للزبون وبعدها فاتورة للمطبخ'],
              ].map(([val, title, desc]) => (
                <button key={val} type="button" onClick={() => setPrinter(p => ({ ...p, autoPrint: val }))}
                  className={`text-right p-3 rounded-xl border-2 transition-colors ${
                    (printer.autoPrint || 'off') === val ? 'border-fuchsia bg-fuchsia-bg' : 'border-brand-border hover:border-fuchsia/40'
                  }`}>
                  <div className="font-black text-sm text-brand-dark flex items-center gap-1.5">
                    {(printer.autoPrint || 'off') === val && <Check size={14} className="text-fuchsia" />} {title}
                  </div>
                  <div className="text-xs text-brand-gray font-bold mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          <Button onClick={save} loading={saving} className="w-full lg:w-auto px-8">
            <Save size={15} className="inline ml-1" /> حفظ إعدادات الطابعات
          </Button>
        </div>
      )}
    </motion.div>
  )
}
