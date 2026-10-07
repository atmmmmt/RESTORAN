'use strict';

const router = require('express').Router();
const { protect, requirePOS } = require('../middleware/auth');
const CashierShift = require('../models/CashierShift');
const shiftService = require('../services/shiftService');
const businessDay = require('../services/businessDay');

router.use(protect, requirePOS);

async function present(shift){
  if(!shift) return null;
  const value=shift.toObject();
  if(shift.status==='open'){
    const live=await shiftService.summarize(shift);
    value.summary=live.summary;
    value.expectedCash=live.expectedCash;
  }
  return value;
}

router.get('/current', async (req,res)=>{
  const [shift,day]=await Promise.all([shiftService.getOpen(null),businessDay.current()]);
  res.json({success:true,shift:await present(shift),businessDay:{
    day:day.day,start:day.start,end:day.end,openingTime:day.openingTime,closingTime:day.closingTime
  }});
});

router.get('/', async (req,res)=>{
  const filter={centerId:null};
  if(req.query.day && businessDay.DAY_KEY.test(req.query.day)) filter.businessDay=req.query.day;
  if(['open','closed'].includes(req.query.status)) filter.status=req.query.status;

  if(req.query.from || req.query.to){
    filter.openedAt={};
    if(req.query.from){
      const from=new Date(`${req.query.from}T00:00:00`);
      if(!Number.isNaN(from.getTime())) filter.openedAt.$gte=from;
    }
    if(req.query.to){
      const to=new Date(`${req.query.to}T00:00:00`);
      if(!Number.isNaN(to.getTime())){ to.setDate(to.getDate()+1); filter.openedAt.$lt=to; }
    }
    if(!Object.keys(filter.openedAt).length) delete filter.openedAt;
  }

  const cashier=String(req.query.cashier||'').trim();
  if(cashier){
    const safe=cashier.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
    filter.$or=[
      {openedByName:{$regex:safe,$options:'i'}},
      {closedByName:{$regex:safe,$options:'i'}},
    ];
  }

  const shifts=await CashierShift.find(filter)
    .sort({openedAt:-1})
    .limit(Math.min(Number(req.query.limit)||100,500));
  res.json({success:true,shifts});
});

router.post('/open', async (req,res)=>{
  const shift=await shiftService.open(null,req.user,req.body.openingCash);
  res.status(201).json({success:true,shift:await present(shift),message:`تم فتح الوردية رقم ${shift.number}`});
});

router.post('/close', async (req,res)=>{
  const shift=await shiftService.close(null,req.user,req.body);
  const diff=shift.difference;
  const note=diff===0?'الدرج مطابق':diff>0?`زيادة ${diff}`:`نقص ${Math.abs(diff)}`;
  const handed=Number(shift.handedOverCash)||0;
  const keep=Number(shift.nextOpeningCash)||0;
  res.json({
    success:true,
    shift:shift.toObject(),
    message:`تم تسليم ${handed.toLocaleString('ar-SY')} ل.س وإغلاق الوردية رقم ${shift.number} — بقي بالدرج ${keep.toLocaleString('ar-SY')} ل.س — ${note}`
  });
});

module.exports = router;
