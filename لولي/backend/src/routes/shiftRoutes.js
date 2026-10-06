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
  const shifts=await CashierShift.find(filter).sort({openedAt:-1}).limit(Math.min(Number(req.query.limit)||30,200));
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
