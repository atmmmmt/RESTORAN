const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))
const money = (v, currency='SYP') => `${new Intl.NumberFormat('ar-SY',{maximumFractionDigits:2}).format(Number(v||0))}${currency==='SYP'?' ل.س':` ${currency}`}`
const day = v => v ? new Date(v).toLocaleDateString('ar-SY',{year:'numeric',month:'2-digit',day:'2-digit'}) : '—'
const period = report => {
  const p=report?.period||{}
  let end=p.end?new Date(p.end):null
  if(end&&!Number.isNaN(end.getTime())) end=new Date(end.getTime()-1)
  return {from:day(p.start),to:end?day(end):day(p.end)}
}

export function exportFinancialReportPdf(report, {
  brandName='المطعم', logoUrl='', colors={}, fileTitle='', note='', mode='combined'
}={}) {
  if(!report?.rows?.length) throw new Error('لا توجد مبيعات ضمن الفترة')
  const validMode=['finance','americans','combined'].includes(mode)?mode:'combined'
  const w=window.open('','_blank','width=1200,height=850')
  if(!w) throw new Error('اسمح بالنوافذ المنبثقة حتى يتم فتح ملف PDF')

  const c={dark:'#352017',accent:'#A96734',soft:'#F6EDDF',paper:'#FBF7F0',line:'#E7D2B7',muted:'#6B5A4A',...colors}
  const currency=report.currency||'SYP', rows=report.rows||[], t=report.totals||{}, p=period(report)
  const investor=report.investor||{}
  const investorName=investor.name||'الأميركان'
  const internalPercent=investor.internalPercent??20
  const deliveryPercent=investor.deliveryPercent??15
  const logoSrc=logoUrl?(logoUrl.startsWith('/')?`${window.location.origin}${logoUrl}`:logoUrl):''
  const inheritedStyles=[...document.querySelectorAll('link[rel="stylesheet"]')]
    .map(node=>`<link rel="stylesheet" href="${esc(node.href)}">`).join('')
  const tax=x=>Number(x?.taxTotal??(Number(x?.consumptionTax||0)+Number(x?.localAdministration||0)))
  const obligations=x=>Number(x?.obligationsTotal??(tax(x)+Number(x?.investorShare||0)))

  const modeTitle=validMode==='finance'
    ? 'فاتورة المالية والضرائب'
    : validMode==='americans'
      ? `فاتورة ${investorName}`
      : 'فاتورة المالية والأميركان'
  const resolvedTitle=fileTitle||modeTitle

  const columnsByMode={
    finance:[
      ['pointOfSale','اسم نقطة البيع'],
      ['foodAndBeverageValue','المبيعات قبل الضريبة'],
      ['consumptionTax','الإنفاق الاستهلاكي 5%'],
      ['localAdministration','الإدارة المحلية 5%'],
      ['taxTotal','إجمالي الضريبة'],
      ['grandTotal','الإجمالي مع الضريبة'],
    ],
    americans:[
      ['pointOfSale','اسم نقطة البيع'],
      ['investorInternalBase','Total بالمحل شامل الضريبة'],
      ['investorInternal',`حصة ${investorName} ${internalPercent}%`],
      ['investorExternalBase','Total سفري / توصيل / موقع شامل الضريبة'],
      ['investorExternal',`حصة ${investorName} ${deliveryPercent}%`],
      ['investorShare',`إجمالي ${investorName}`],
    ],
    combined:[
      ['pointOfSale','اسم نقطة البيع'],
      ['foodAndBeverageValue','المبيعات قبل الضريبة'],
      ['taxTotal','إجمالي الضريبة'],
      ['investorShare',`نسبة ${investorName}`],
      ['obligationsTotal','إجمالي الالتزامات'],
      ['grandTotal','الإجمالي مع الضريبة'],
    ],
  }
  const cols=columnsByMode[validMode]
  const valueOf=(r,k)=>{
    if(k==='taxTotal') return tax(r)
    if(k==='obligationsTotal') return obligations(r)
    return r?.[k]
  }
  const cell=(r,k)=>k==='pointOfSale'
    ? `<strong>${esc(r.pointOfSale||'نقطة بيع')}</strong><small>${r.manual?'مبلغ إجمالي من البرنامج السابق':`${esc(r.ordersCount||0)} فاتورة`}</small>`
    : `<b>${esc(money(valueOf(r,k),currency))}</b>`

  const summary=validMode==='finance'
    ? [
        ['المبيعات قبل الضريبة',money(t.foodAndBeverageValue,currency)],
        ['الإنفاق الاستهلاكي',money(t.consumptionTax,currency)],
        ['الإدارة المحلية',money(t.localAdministration,currency)],
        ['إجمالي الضريبة',money(tax(t),currency)],
      ]
    : validMode==='americans'
      ? [
          ['Total بالمحل شامل الضريبة',money(t.investorInternalBase,currency)],
          [`حصة ${investorName} ${internalPercent}%`,money(t.investorInternal,currency)],
          ['Total سفري / توصيل / موقع شامل الضريبة',money(t.investorExternalBase,currency)],
          [`حصة ${investorName} ${deliveryPercent}%`,money(t.investorExternal,currency)],
          [`إجمالي ${investorName}`,money(t.investorShare,currency)],
        ]
      : [
          ['المبيعات قبل الضريبة',money(t.foodAndBeverageValue,currency)],
          ['إجمالي الضريبة',money(tax(t),currency)],
          [`إجمالي نسبة ${investorName}`,money(t.investorShare,currency)],
          ['إجمالي الالتزامات',money(obligations(t),currency)],
        ]

  const grand=validMode==='finance'
    ? {
        label:'إجمالي الضريبة',
        amount:tax(t),
        details:`الإنفاق الاستهلاكي: ${money(t.consumptionTax,currency)}<br>الإدارة المحلية: ${money(t.localAdministration,currency)}<br>المبيعات قبل الضريبة: ${money(t.foodAndBeverageValue,currency)}<br>الإجمالي مع الضريبة: ${money(t.grandTotal,currency)}`,
      }
    : validMode==='americans'
      ? {
          label:`إجمالي مستحق ${investorName}`,
          amount:Number(t.investorShare||0),
          details:`Total بالمحل شامل الضريبة: ${money(t.investorInternalBase,currency)}<br>حصة ${investorName} ${internalPercent}%: ${money(t.investorInternal,currency)}<br>Total سفري / توصيل / موقع شامل الضريبة: ${money(t.investorExternalBase,currency)}<br>حصة ${investorName} ${deliveryPercent}%: ${money(t.investorExternal,currency)}<br>الإجمالي شامل الضريبة: ${money(t.grandTotal,currency)}`,
        }
      : {
          label:'إجمالي الالتزامات',
          amount:obligations(t),
          details:`الضريبة: ${money(tax(t),currency)}<br>نسبة ${investorName}: ${money(t.investorShare,currency)}<br>المبيعات قبل الضريبة: ${money(t.foodAndBeverageValue,currency)}<br>الإجمالي مع الضريبة: ${money(t.grandTotal,currency)}`,
        }

  const modeHint=validMode==='finance'
    ? 'نسخة خاصة بالمالية والضرائب فقط'
    : validMode==='americans'
      ? `نسخة خاصة بمستحقات ${investorName} فقط`
      : 'نسخة مشتركة للمالية والأميركان'
  const title=`${resolvedTitle} - ${brandName} - ${p.from} - ${p.to}`
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>${inheritedStyles}
  <style>
    @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:${c.dark}}
    body{font-family:Cairo,Tajawal,Arial,sans-serif;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{padding:8px 4px}.topline{height:7px;background:${c.accent};border-radius:999px;margin-bottom:14px}
    header{display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid ${c.line};border-radius:18px;padding:16px 20px;background:#fff}
    .brand{display:flex;align-items:center;gap:14px}.logo{width:76px;height:76px;object-fit:contain;background:${c.soft};border-radius:16px;padding:7px}
    h1{margin:0;color:${c.accent};font-size:27px;line-height:1.2}.brandname{font-size:17px;font-weight:900;margin-bottom:5px}.sub{color:${c.muted};font-size:11px;font-weight:700;margin-top:5px}
    .meta{min-width:260px;text-align:right;background:${c.paper};border-radius:14px;padding:11px 14px;font-size:11px;font-weight:800;line-height:1.9}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.card{border:1px solid ${c.line};border-radius:14px;padding:11px 13px;background:#fff}.card:first-child{background:${c.dark};color:#fff;border-color:${c.dark}}
    .card span{display:block;font-size:10px;font-weight:800;color:${c.muted};margin-bottom:6px}.card:first-child span{color:#fff;opacity:.72}.card b{font-size:17px;font-weight:900}
    table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:10.5px;overflow:hidden;border-radius:13px;border:1px solid ${c.line}}
    thead{display:table-header-group}th{background:${c.dark};color:#fff;padding:10px 8px;text-align:right;font-weight:900;border-left:1px solid rgba(255,255,255,.12)}
    td{padding:10px 8px;text-align:right;border-top:1px solid ${c.line};border-left:1px solid ${c.line};font-weight:700;vertical-align:middle}tbody tr:nth-child(even){background:${c.soft}}tr{break-inside:avoid;page-break-inside:avoid}
    td strong{display:block;font-size:11.5px}td small{display:block;color:${c.muted};font-size:8.5px;margin-top:4px}td:last-child,th:last-child{border-left:0}
    tfoot td{background:${c.paper};font-weight:900;border-top:2px solid ${c.dark}}.grand{margin-top:13px;background:${c.dark};color:#fff;border-radius:15px;padding:13px 17px;display:flex;justify-content:space-between;align-items:center;gap:20px;break-inside:avoid}
    .grand h2{margin:0 0 4px;font-size:15px}.grand .amount{font-size:23px;font-weight:900}.grand .details{font-size:10px;font-weight:700;line-height:1.8;opacity:.9}
    .note{margin-top:10px;padding:9px 12px;background:${c.paper};border-right:4px solid ${c.accent};border-radius:10px;color:${c.muted};font-size:9.5px;font-weight:700}
    footer{margin-top:12px;border-top:1px solid ${c.line};padding-top:8px;display:flex;justify-content:space-between;color:${c.muted};font-size:8.5px;font-weight:700}
    @media print{.no-print{display:none!important}body{background:#fff}.page{padding:0}}
  </style></head><body><div class="page"><div class="topline"></div><header><div class="brand">${logoSrc?`<img class="logo" src="${esc(logoSrc)}">`:''}<div><div class="brandname">${esc(brandName)}</div><h1>${esc(resolvedTitle)}</h1><div class="sub">${esc(modeHint)} · PDF A4 مرتب للحفظ والمشاركة</div></div></div><div class="meta"><div>من تاريخ: ${esc(p.from)}</div><div>إلى تاريخ: ${esc(p.to)}</div><div>تاريخ الإصدار: ${esc(new Date().toLocaleString('ar-SY'))}</div></header>
  <section class="summary">${summary.map(([l,v])=>`<div class="card"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</section>
  <table><thead><tr>${cols.map(([,l])=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(([k])=>`<td>${cell(r,k)}</td>`).join('')}</tr>`).join('')}</tbody>
  <tfoot><tr>${cols.map(([k],i)=>`<td>${i===0?'الإجمالي':esc(money(valueOf(t,k),currency))}</td>`).join('')}</tr></tfoot></table>
  <div class="grand"><div><h2>${esc(grand.label)}</h2><div class="amount">${esc(money(grand.amount,currency))}</div></div><div class="details">${grand.details}</div></div>
  ${note?`<div class="note">${esc(note)}</div>`:''}<footer><span>${esc(brandName)} - ${esc(modeTitle)}</span><span>PDF / A4 / RTL</span></footer></div>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),450));<\/script></body></html>`)
  w.document.close()
  w.focus()
}
