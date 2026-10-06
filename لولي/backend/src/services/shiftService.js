'use strict';

const CashierShift = require('../models/CashierShift');
const InternalOrder = require('../models/InternalOrder');
const businessDay = require('./businessDay');

async function getOpen(centerId = null) {
  return CashierShift.findOne({ centerId: centerId || null, status: 'open' });
}
async function nextNumber(centerId = null) {
  const last = await CashierShift.findOne({ centerId: centerId || null }).sort({ number: -1 }).select('number');
  return (last?.number || 0) + 1;
}
async function open(centerId, user, openingCash = 0) {
  const existing = await getOpen(centerId);
  if (existing) {
    const err = new Error('يوجد وردية مفتوحة بالفعل — صفّرها أولاً');
    err.statusCode = 409; throw err;
  }
  const { day } = await businessDay.current();
  return CashierShift.create({
    centerId: centerId || null,
    number: await nextNumber(centerId),
    businessDay: day,
    openedBy: user?._id,
    openedByName: user?.name || '',
    openingCash: Math.max(Number(openingCash) || 0, 0),
  });
}
async function ensureOpen(centerId, user) {
  const current = await getOpen(centerId);
  if (current) return current;
  try { return await open(centerId,user,0); }
  catch(err) {
    if (err.statusCode === 409) return getOpen(centerId);
    throw err;
  }
}
async function summarize(shift) {
  const orders = await InternalOrder.find({ shiftId: shift._id });
  const active = orders.filter(o => o.status !== 'cancelled');
  const sum = (list,pick) => list.reduce((s,x)=>s+(Number(pick(x))||0),0);
  const map = new Map();
  for(const o of active){
    const line=map.get(o.orderType)||{orderType:o.orderType,count:0,total:0};
    line.count += 1;
    line.total += Number(o.total||0);
    map.set(o.orderType,line);
  }
  const cashSales=sum(active.filter(o=>o.paymentMethod==='cash'),o=>o.total);
  return {
    summary:{
      ordersCount:active.length,
      cancelledCount:orders.length-active.length,
      sales:sum(active,o=>o.total),
      cashSales,
      cardSales:sum(active.filter(o=>o.paymentMethod==='card'),o=>o.total),
      unpaidSales:sum(active.filter(o=>o.paymentMethod==='unpaid'),o=>o.total),
      byType:[...map.values()],
    },
    expectedCash:(shift.openingCash||0)+cashSales,
  };
}
async function close(centerId,user,{countedCash,nextOpeningCash=0,notes=''}={}){
  const shift=await getOpen(centerId);
  if(!shift){ const err=new Error('لا توجد وردية مفتوحة'); err.statusCode=404; throw err; }
  const counted=Number(countedCash);
  if(!Number.isFinite(counted)||counted<0){ const err=new Error('أدخل المبلغ الموجود في الدرج'); err.statusCode=400; throw err; }
  const keep=Math.max(Number(nextOpeningCash)||0,0);
  if(keep>counted){ const err=new Error('الرصيد الذي سيبقى في الدرج لا يمكن أن يكون أكبر من المبلغ المعدود'); err.statusCode=400; throw err; }
  const {summary,expectedCash}=await summarize(shift);
  shift.closedAt=new Date();
  shift.summary=summary;
  shift.expectedCash=expectedCash;
  shift.countedCash=counted;
  shift.difference=counted-expectedCash;
  shift.nextOpeningCash=keep;
  shift.handedOverCash=Math.max(counted-keep,0);
  shift.notes=String(notes||'').trim();
  shift.closedBy=user?._id;
  shift.closedByName=user?.name||'';
  shift.status='closed';
  await shift.save();
  return shift;
}
module.exports={getOpen,open,ensureOpen,summarize,close};
