import { useCallback, useEffect, useState } from 'react'
import { Lock, Unlock, History, Printer, Wallet, Receipt, CalendarDays, Eye, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { shiftsAPI } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import { getPrinterSettings, printThermalShiftReport } from '../../services/thermalPrinter'
import Button from '../common/Button'
import Modal from '../common/Modal'

/**
 * The cashier's shift, above the till.
 *
 * Open: who opened it and when, and the live figures — orders, sales, and the
 * cash that should be in the drawer right now. "تصفير الوردية" counts the
 * drawer, freezes the figures, prints the slip and leaves the till at zero.
 * Closed: one button to start the next shift with its opening float. A sale
 * made with no shift open still goes through — the server opens one for it.
 */

const TYPE_LABEL = { takeaway: 'سفري', dine_in: 'بالمحل', delivery: 'توصيل' }
const clock = iso => iso
  ? new Date(iso).toLocaleTimeString('ar-EG', { timeZone: 'Asia/Damascus', hour: '2-digit', minute: '2-digit' })
  : '—'
const stamp = iso => iso
  ? new Date(iso).toLocaleString('ar-EG', { timeZone: 'Asia/Damascus', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—'

/* The browser's own print dialog, for a till with no thermal printer set up. */
function printShiftInBrowser(shift) {
  const s = shift.summary || {}
  const row = (label, value, bold) =>
    `<tr${bold ? ' style="font-weight:800"' : ''}><td>${label}</td><td style="text-align:left">${value}</td></tr>`
  const diff = Number(shift.difference) || 0
  const w = window.open('', '_blank', 'width=380,height=640')
  if (!w) return toast.error('اسمح بالنوافذ المنبثقة للطباعة')
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>وردية ${shift.number}</title>
    <style>@page{margin:6mm}body{font-family:Cairo,Tajawal,Arial,sans-serif;padding:8px;color:#1b1512}
    h2{text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse;margin:8px 0}
    td{padding:4px 0;font-size:13px}hr{border:0;border-top:1px dashed #8a7a6d}</style></head><body>
    <h2>تقرير إغلاق الوردية رقم ${shift.number}</h2>
    <div style="text-align:center;font-size:12px">${shift.businessDay || ''}</div>
    <table>
      ${row('فُتحت', `${stamp(shift.openedAt)} · ${shift.openedByName || '—'}`)}
      ${row('أُغلقت', `${stamp(shift.closedAt)} · ${shift.closedByName || '—'}`)}
    </table><hr><table>
      ${row('عدد الطلبات', s.ordersCount || 0, true)}
      ${(s.byType || []).map(l => row(`${TYPE_LABEL[l.orderType] || l.orderType} (${l.count})`, formatCurrency(l.total))).join('')}
      ${s.discounts ? row('الخصومات', `− ${formatCurrency(s.discounts)}`) : ''}
      ${row('المبيعات', formatCurrency(s.sales), true)}
      ${row('نقداً', formatCurrency(s.cashSales))}
      ${row('بطاقة', formatCurrency(s.cardSales))}
      ${s.unpaidSales ? row('آجل', formatCurrency(s.unpaidSales)) : ''}
      ${s.cashRefunds ? row('مرتجعات نقدية', `− ${formatCurrency(s.cashRefunds)}`) : ''}
    </table><hr><table>
      ${row('رصيد الافتتاح', formatCurrency(shift.openingCash))}
      ${row('المفروض بالدرج', formatCurrency(shift.expectedCash), true)}
      ${shift.countedCash == null ? row('جرد النقد الفعلي', 'لم يُجرَ') : row('المعدود فعلياً', formatCurrency(shift.countedCash), true)}
      ${shift.countedCash == null ? '' : row(diff === 0 ? 'الفرق' : diff > 0 ? 'زيادة' : 'نقص', diff === 0 ? 'مطابق' : formatCurrency(Math.abs(diff)), true)}
    </table>
    ${shift.notes ? `<p style="font-size:12px"><b>ملاحظات:</b> ${shift.notes.replace(/</g, '&lt;')}</p>` : ''}
    <p style="margin-top:28px;font-size:12px">توقيع الكاشير: ............ &nbsp; توقيع المستلم: ............</p>
    </body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print(); w.close() }, 350)
}

async function printShift(shift) {
  if (getPrinterSettings().enabled) {
    try {
      await printThermalShiftReport(shift)
      toast.success('تمت طباعة تقرير الوردية')
    } catch (e) {
      toast.error(`تعذّرت الطباعة الحرارية: ${e.message}`)
    }
    return
  }
  printShiftInBrowser(shift)
}

export default function ShiftPanel({ tick = 0, onChanged }) {
  const [shift, setShift] = useState(null)
  const [day, setDay] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const [openForm, setOpenForm] = useState(null)       // { openingCash } while the open dialog is up
  const [closeForm, setCloseForm] = useState(null)     // { notes } while the close dialog is up
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(null)         // list while the history dialog is up
  const [historyDetail, setHistoryDetail] = useState(null)
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await shiftsAPI.current()
      setShift(r.data.shift)
      setDay(r.data.businessDay)
    } catch { /* the till keeps working without the panel */ }
    finally { setLoaded(true) }
  }, [])

  useEffect(() => { load() }, [load, tick])

  const openShift = async () => {
    setBusy(true)
    try {
      const r = await shiftsAPI.open({ openingCash: Number(openForm.openingCash) || 0 })
      toast.success(r.data.message)
      setOpenForm(null)
      load()
      onChanged?.()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const startClose = async () => {
    await load()   // count against the latest figures, not the ones on screen
    setCloseForm({ notes: '' })
  }

  const closeShift = async () => {
    setBusy(true)
    try {
      const r = await shiftsAPI.close({ notes: closeForm.notes })
      if (r.data.queuedOffline) {
        toast.error('لا يوجد اتصال — أعد التصفير عند عودة الاتصال')
        return
      }
      toast.success(r.data.message)
      setCloseForm(null)
      printShift(r.data.shift)
      load()
      onChanged?.()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const showHistory = async () => {
    try {
      const r = await shiftsAPI.list({ limit: 30 })
      setHistory(r.data.shifts || [])
    } catch (e) { toast.error(e.message) }
  }

  const showShiftDetails = async (shiftId) => {
    setHistoryDetailLoading(true)
    try {
      const r = await shiftsAPI.getOne(shiftId)
      setHistoryDetail({
        shift: r.data.shift,
        orders: r.data.details?.orders || [],
        returns: r.data.details?.returns || [],
      })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setHistoryDetailLoading(false)
    }
  }

  if (!loaded) return null

  const s = shift?.summary || {}
  const expected = shift?.expectedCash ?? 0

  return (
    <>
      <div className={`rounded-2xl shadow-card p-4 mb-5 flex flex-wrap items-center gap-3 ${shift ? 'bg-white' : 'bg-amber-50 border-2 border-amber-200'}`}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: shift ? 'rgba(46,122,74,0.12)' : 'rgba(184,134,11,0.15)' }}>
          {shift ? <Unlock size={18} style={{ color: '#2E7A4A' }} /> : <Lock size={18} style={{ color: '#B8860B' }} />}
        </div>

        <div className="min-w-0 flex-1">
          {shift ? (
            <>
              <div className="font-black text-brand-dark text-sm">
                الوردية رقم {shift.number} مفتوحة
                <span className="text-brand-gray font-bold"> · منذ {clock(shift.openedAt)} · {shift.openedByName || '—'}</span>
              </div>
              <div className="text-xs font-bold text-brand-gray mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                <span><Receipt size={11} className="inline" /> {s.ordersCount || 0} طلب</span>
                <span>مبيعات {formatCurrency(s.sales || 0)}</span>
                <span><Wallet size={11} className="inline" /> المفروض بالدرج {formatCurrency(expected)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="font-black text-brand-dark text-sm">لا توجد وردية مفتوحة</div>
              <div className="text-xs font-bold text-brand-gray mt-0.5">افتح وردية وسجّل المبلغ الموجود بالدرج قبل البيع</div>
            </>
          )}
          {day?.day && (
            <div className="text-[11px] font-bold text-brand-gray-light mt-0.5">
              <CalendarDays size={10} className="inline" /> يوم العمل {day.day} ({day.openingTime} ← {day.closingTime})
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={showHistory} icon={<History size={14} />}>الورديات</Button>
          {shift ? (
            <Button size="sm" onClick={startClose} icon={<Lock size={14} />}>تصفير الوردية</Button>
          ) : (
            <Button size="sm" onClick={() => setOpenForm({ openingCash: '' })} icon={<Unlock size={14} />}>فتح وردية</Button>
          )}
        </div>
      </div>

      {/* ── Open ── */}
      <Modal open={!!openForm} onClose={() => setOpenForm(null)} title="فتح وردية جديدة" size="sm">
        {openForm && (
          <div>
            <label className="text-xs font-bold text-brand-dark mb-2 block">المبلغ الموجود بالدرج عند البداية</label>
            <input type="number" min="0" autoFocus value={openForm.openingCash}
              onChange={e => setOpenForm(f => ({ ...f, openingCash: e.target.value }))}
              placeholder="0"
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-black" />
            <div className="flex gap-3 mt-5">
              <Button onClick={openShift} loading={busy} className="flex-1" icon={<Unlock size={15} />}>فتح الوردية</Button>
              <Button variant="ghost" onClick={() => setOpenForm(null)}>إلغاء</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Close / zero ── */}
      <Modal open={!!closeForm && !!shift} onClose={() => setCloseForm(null)} title={`تصفير الوردية رقم ${shift?.number || ''}`} size="sm">
        {closeForm && shift && (
          <div>
            <div className="rounded-2xl bg-brand-bg p-4 space-y-1.5 text-sm">
              {[
                ['عدد الطلبات', s.ordersCount || 0],
                ...(s.byType || []).map(l => [`${TYPE_LABEL[l.orderType] || l.orderType} (${l.count})`, formatCurrency(l.total)]),
                ...(s.discounts ? [['الخصومات', `− ${formatCurrency(s.discounts)}`]] : []),
                ['المبيعات', formatCurrency(s.sales || 0), true],
                ['نقداً', formatCurrency(s.cashSales || 0)],
                ['بطاقة', formatCurrency(s.cardSales || 0)],
                ...(s.unpaidSales ? [['آجل', formatCurrency(s.unpaidSales)]] : []),
                ...(s.cashRefunds ? [['مرتجعات نقدية', `− ${formatCurrency(s.cashRefunds)}`]] : []),
              ].map(([label, value, bold]) => (
                <div key={label} className="flex justify-between">
                  <span className={bold ? 'font-black text-brand-dark' : 'font-bold text-brand-gray'}>{label}</span>
                  <span className="font-black text-brand-dark">{value}</span>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border-2 border-brand-border p-4 mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="font-bold text-brand-gray">رصيد الافتتاح</span>
                <span className="font-black">{formatCurrency(shift.openingCash || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-black text-brand-dark">المفروض بالدرج</span>
                <span className="font-black text-fuchsia text-base">{formatCurrency(expected)}</span>
              </div>
            </div>

            <p className="text-[11px] text-brand-gray-light font-bold mt-3">
              التقرير يعتمد تلقائياً على المبيعات المسجلة، دون إدخال أو تأكيد مبلغ الصندوق الفعلي.
            </p>

            <input value={closeForm.notes} onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="ملاحظات (اختياري)"
              className="w-full mt-3 px-3 py-2.5 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />

            <p className="text-[11px] text-brand-gray-light font-bold mt-3">
              بعد التصفير تُطبع ورقة الوردية وتبدأ العدّادات من الصفر. الطلبات تبقى بسجل اليوم.
            </p>

            <div className="flex gap-3 mt-4">
              <Button onClick={closeShift} loading={busy} className="flex-1" icon={<Lock size={15} />}>تأكيد التصفير</Button>
              <Button variant="ghost" onClick={() => setCloseForm(null)}>إلغاء</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── History ── */}
      <Modal open={!!history} onClose={() => setHistory(null)} title="الورديات السابقة" size="md">
        {history && (
          <div className="space-y-2">
            {!history.length && <div className="text-center py-8 font-bold text-brand-gray">لا توجد ورديات بعد</div>}
            {history.map(h => {
              const d = Number(h.difference) || 0
              return (
                <div key={h._id} className="rounded-2xl bg-brand-bg p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-brand-dark text-sm">
                      وردية {h.number}
                      <span className={`mr-2 text-xs px-2 py-0.5 rounded-lg ${h.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-white text-brand-gray'}`}>
                        {h.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-brand-gray mt-0.5">
                      {stamp(h.openedAt)} ← {h.closedAt ? stamp(h.closedAt) : 'الآن'} · {h.closedByName || h.openedByName || '—'}
                    </div>
                  </div>
                  {h.status === 'closed' && (
                    <div className="text-left text-xs font-bold">
                      <div className="font-black text-brand-dark">{formatCurrency(h.summary?.sales || 0)}</div>
                      <div className={d === 0 ? 'text-green-600' : d > 0 ? 'text-blue-600' : 'text-red-500'}>
                        {h.countedCash == null ? 'غير مجرود' : d === 0 ? 'مطابق' : d > 0 ? `زيادة ${formatCurrency(d)}` : `نقص ${formatCurrency(Math.abs(d))}`}
                      </div>
                    </div>
                  )}
                  <button onClick={() => showShiftDetails(h._id)} disabled={historyDetailLoading}
                    className="text-xs bg-white text-brand-dark px-3 py-1.5 rounded-lg font-black hover:bg-brand-border flex items-center gap-1 disabled:opacity-50">
                    <Eye size={12} /> تفاصيل
                  </button>
                  {h.status === 'closed' && (
                    <button onClick={() => printShift(h)}
                      className="text-xs bg-white text-brand-gray px-3 py-1.5 rounded-lg font-bold hover:text-brand-dark flex items-center gap-1">
                      <Printer size={12} /> طباعة
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* ── Shift details ── */}
      <Modal
        open={!!historyDetail}
        onClose={() => setHistoryDetail(null)}
        title={historyDetail ? `تفاصيل الوردية رقم ${historyDetail.shift?.number || ''}` : 'تفاصيل الوردية'}
        size="lg"
      >
        {historyDetail && (() => {
          const h = historyDetail.shift || {}
          const summary = h.summary || {}
          const orders = historyDetail.orders || []
          const returns = historyDetail.returns || []
          const diff = Number(h.difference) || 0
          const paymentLabel = { cash: 'نقداً', card: 'بطاقة', unpaid: 'آجل' }
          return (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ['فتح الوردية', stamp(h.openedAt)],
                  ['إغلاق الوردية', h.closedAt ? stamp(h.closedAt) : 'مفتوحة الآن'],
                  ['فتح بواسطة', h.openedByName || '—'],
                  ['إغلاق بواسطة', h.closedByName || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-brand-bg p-3">
                    <div className="text-[11px] font-bold text-brand-gray">{label}</div>
                    <div className="text-sm font-black text-brand-dark mt-1">{value}</div>
                  </div>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ['رصيد البداية', formatCurrency(h.openingCash || 0)],
                  ['المبيعات', formatCurrency(summary.sales || 0)],
                  ['المفروض بالدرج', formatCurrency(h.expectedCash || 0)],
                  ['المعدود فعلياً', h.countedCash == null ? '—' : formatCurrency(h.countedCash)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border-2 border-brand-border p-3">
                    <div className="text-[11px] font-bold text-brand-gray">{label}</div>
                    <div className="text-base font-black text-brand-dark mt-1">{value}</div>
                  </div>
                ))}
              </div>

              <div className={`rounded-2xl p-4 border-2 ${
                diff === 0 ? 'bg-green-50 border-green-200 text-green-700'
                  : diff > 0 ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <div className="font-black">
                  {h.countedCash == null ? 'لم يتم جرد النقد فعلياً' : diff === 0 ? 'الدرج مطابق تماماً'
                    : diff > 0 ? `زيادة بالصندوق: ${formatCurrency(diff)}`
                    : `نقص بالصندوق: ${formatCurrency(Math.abs(diff))}`}
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-brand-border p-4">
                <div className="font-black text-brand-dark mb-3">ملخص الوردية</div>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {[
                    ['عدد الطلبات', summary.ordersCount || 0],
                    ['الطلبات الملغاة', summary.cancelledCount || 0],
                    ['نقداً', formatCurrency(summary.cashSales || 0)],
                    ['بطاقة', formatCurrency(summary.cardSales || 0)],
                    ['آجل', formatCurrency(summary.unpaidSales || 0)],
                    ['الخصومات', formatCurrency(summary.discounts || 0)],
                    ['المرتجعات النقدية', formatCurrency(summary.cashRefunds || 0)],
                    ['صافي المبيعات', formatCurrency(summary.netSales ?? summary.sales ?? 0)],
                    ['نسبة الأميركان', formatCurrency(summary.investorShare || 0)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b border-brand-border/60 py-1.5">
                      <span className="font-bold text-brand-gray">{label}</span>
                      <span className="font-black text-brand-dark">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-black text-brand-dark mb-2">طلبات الوردية ({orders.length})</div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {!orders.length && (
                    <div className="text-center py-6 text-sm font-bold text-brand-gray bg-brand-bg rounded-2xl">
                      لا توجد طلبات مرتبطة بهذه الوردية
                    </div>
                  )}
                  {orders.map(order => (
                    <div key={order._id} className="rounded-2xl border border-brand-border bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-black text-brand-dark">{order.orderNumber || 'طلب'}</div>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-brand-bg text-brand-gray">
                          {TYPE_LABEL[order.orderType] || order.orderType}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-brand-bg text-brand-gray">
                          {paymentLabel[order.paymentMethod] || order.paymentMethod}
                        </span>
                        {order.status === 'cancelled' && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-red-50 text-red-600">ملغى</span>
                        )}
                        <div className="mr-auto font-black text-fuchsia">{formatCurrency(order.total || 0)}</div>
                      </div>
                      <div className="text-[11px] font-bold text-brand-gray mt-1">{stamp(order.createdAt)}</div>
                      <div className="mt-2 text-xs font-bold text-brand-dark">
                        {(order.items || []).map(item => `${item.name} × ${item.quantity}`).join(' · ') || '—'}
                      </div>
                      {Number(order.discount || 0) > 0 && (
                        <div className="text-[11px] font-bold text-amber-700 mt-1">
                          خصم {formatCurrency(order.discount)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {returns.length > 0 && (
                <div>
                  <div className="font-black text-brand-dark mb-2 flex items-center gap-2">
                    <RotateCcw size={15} /> المرتجعات ({returns.length})
                  </div>
                  <div className="space-y-2">
                    {returns.map(ret => (
                      <div key={ret._id} className="rounded-2xl bg-red-50 border border-red-200 p-3">
                        <div className="flex justify-between gap-3">
                          <div className="font-black text-red-700">{ret.number || 'مرتجع'} · طلب {ret.orderNumber || '—'}</div>
                          <div className="font-black text-red-700">− {formatCurrency(ret.refundAmount || 0)}</div>
                        </div>
                        <div className="text-[11px] font-bold text-red-500 mt-1">
                          {stamp(ret.createdAt)} · {ret.refundMethod === 'cash' ? 'نقداً' : ret.refundMethod === 'card' ? 'بطاقة' : ret.refundMethod || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {h.notes && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm">
                  <span className="font-black text-amber-800">ملاحظات الوردية: </span>
                  <span className="font-bold text-amber-700">{h.notes}</span>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => printShift(h)} icon={<Printer size={14} />}>
                  طباعة تقرير الوردية
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </>
  )
}
