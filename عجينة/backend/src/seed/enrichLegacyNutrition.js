'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const menu = require('./legacy-menu.json');

const round1 = (value) => Math.round(value * 10) / 10;
const normalize = (value) => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

function portionFor(name, category) {
  if (/نص كيلو/.test(name)) return { amount: 500, label: 'العبوة كاملة (500 غ)' };
  if (/ربع كيلو/.test(name)) return { amount: 250, label: 'العبوة كاملة (250 غ)' };
  if (/كيلو/.test(name)) return { amount: 1000, label: 'العبوة كاملة (1 كغ)' };
  if (/350/.test(name)) return { amount: 350, label: 'وجبة واحدة (نحو 350 غ)' };
  if (/قطعه|قطعة/.test(name)) return { amount: 120, label: 'قطعة واحدة (نحو 120 غ)' };
  if (category === 'مشروبات') return { amount: /مي صغيرة/.test(name) ? 500 : 250, label: /مي صغيرة/.test(name) ? 'عبوة 500 مل' : 'عبوة/حصة 250 مل' };
  const byCategory = {
    'مناقيش': [220, 'منقوشة واحدة (نحو 220 غ)'],
    'الصفيحة واللحوم': [200, 'قطعة واحدة (نحو 200 غ)'],
    'بيتزا': [400, 'بيتزا واحدة (نحو 400 غ)'],
    'صواني': [500, 'الحصة المباعة (نحو 500 غ)'],
    'صندويش المشاوي': [300, 'سندويشة واحدة (نحو 300 غ)'],
    'مقبلات': [250, 'صحن واحد (نحو 250 غ)'],
    'وجبات المشاوي': [300, 'وجبة واحدة (نحو 300 غ)'],
    'وجبات مشاوي دجاج': [300, 'وجبة واحدة (نحو 300 غ)'],
    'سلطات': [250, 'صحن واحد (نحو 250 غ)'],
    'اصناف عجينه وطحينه': [300, 'حصة واحدة (نحو 300 غ)'],
  };
  const [amount, label] = byCategory[category] || [250, 'حصة واحدة (نحو 250 غ)'];
  return { amount, label };
}

// Typical nutrients per 100 g/ml. These are menu estimates, not laboratory analyses.
function profileFor(name, category) {
  if (category === 'مشروبات') {
    if (/مي صغيرة/.test(name)) return [0, 0, 0, 0, 0, 0, 0, 0];
    if (/دايت/.test(name)) return [1, 0, 0.2, 0, 0, 0.2, 8, 0];
    if (/عيران/.test(name)) return [42, 2.2, 3.5, 2.1, 1.3, 3.5, 55, 0];
    return [42, 0, 10.6, 0, 0, 10.6, 5, 0];
  }
  if (category === 'سلطات') {
    if (/تبولة/.test(name)) return [110, 2.8, 14, 5, 0.7, 2.5, 180, 3.5];
    if (/فتوش/.test(name)) return [120, 2.5, 15, 6, 0.8, 3, 210, 3];
    if (/جرجير/.test(name)) return [90, 2.5, 8, 6, 0.8, 2, 170, 2.5];
    return [105, 2.5, 11, 6, 0.8, 3, 190, 2.8];
  }
  if (category === 'مقبلات') {
    if (/حمص/.test(name)) return [166, 7.9, 14.3, 9.6, 1.4, 0.3, 240, 6];
    if (/باباغنوج|متبل/.test(name)) return [115, 3, 9, 8, 1.2, 3, 220, 4];
    if (/محمرة/.test(name)) return [230, 5, 19, 16, 2, 5, 280, 3];
    if (/كريم توم/.test(name)) return [420, 2, 8, 43, 6, 1, 420, 0.5];
    if (/بطاطا/.test(name)) return [312, 3.4, 41, 15, 2.3, 0.3, 210, 3.8];
    if (/كبة نية/.test(name)) return [220, 15, 14, 12, 4.5, 1, 260, 2.5];
  }
  if (category === 'وجبات مشاوي دجاج') {
    if (/جوانح/.test(name)) return [245, 23, 2, 16, 4.5, 0.5, 430, 0];
    return [185, 27, 3, 7, 1.8, 1, 390, 0.4];
  }
  if (category === 'وجبات المشاوي') {
    if (/سودة/.test(name)) return [175, 26, 4, 6, 2, 0, 310, 0];
    if (/كبة مشوية|كبة عسيخ/.test(name)) return [235, 15, 16, 12, 4, 1.5, 330, 2.5];
    if (/شقف/.test(name)) return [220, 28, 2, 11, 4, 0, 360, 0];
    return [250, 24, 5, 15, 5, 1, 390, 0.8];
  }
  if (category === 'صواني') {
    if (/طحينة/.test(name)) return [265, 18, 8, 18, 5, 1.5, 350, 1.5];
    if (/ببندورة|بانجان/.test(name)) return [205, 18, 7, 12, 4, 3, 320, 2];
    if (/كرز/.test(name)) return [225, 18, 17, 10, 3.5, 12, 300, 1.5];
    return [235, 20, 7, 14, 4.5, 2, 340, 1.5];
  }
  if (category === 'صندويش المشاوي') {
    if (/سودة/.test(name)) return [230, 17, 24, 8, 2.5, 2, 420, 1.5];
    if (/شيش/.test(name)) return [235, 18, 25, 8, 2.5, 2, 430, 1.5];
    if (/قشقوان|جبنة/.test(name)) return [285, 17, 26, 13, 6, 2, 520, 1.4];
    return [260, 17, 25, 11, 3.8, 2, 470, 1.5];
  }
  if (category === 'بيتزا') {
    if (/خضار|فطر|مارغريتا|مرغريتا/.test(name) && !/لحوم|سجق/.test(name)) return [245, 10, 31, 9, 4, 4, 510, 2.3];
    if (/بيبروني|سلامي|سجق|هوت دوغ|مرتديلا|لحوم|حبش/.test(name)) return [285, 13, 30, 13, 5, 3, 690, 2];
    return [265, 11, 31, 11, 4.5, 3.5, 570, 2.1];
  }
  if (category === 'الصفيحة واللحوم') {
    if (/طحينة/.test(name)) return [285, 15, 27, 13, 4, 2, 470, 2];
    if (/جبنة|قشقوان/.test(name)) return [300, 16, 27, 15, 6, 2, 560, 1.8];
    return [270, 15, 28, 11, 3.5, 3, 480, 2];
  }
  if (category === 'مناقيش') {
    if (/زعتر/.test(name) && !/جبنة|قشقوان|لبنة/.test(name)) return [285, 8, 39, 11, 1.8, 2, 520, 4];
    if (/لبنة/.test(name)) return [255, 9, 35, 9, 4, 3, 470, 2.5];
    if (/سجق|بيبروني|سلامي|هوت دوغ|مرتديلا|حبش/.test(name)) return [315, 14, 33, 15, 6, 2, 650, 1.8];
    if (/جبنة|قشقوان/.test(name)) return [300, 13, 34, 13, 7, 2.5, 590, 1.8];
    if (/محمرة/.test(name)) return [275, 8, 38, 10, 1.5, 4, 510, 3.5];
    return [280, 9, 38, 10, 2.5, 3, 520, 3];
  }
  if (category === 'اصناف عجينه وطحينه') {
    if (/برغر لحمة/.test(name)) return [275, 15, 27, 12, 4, 4, 490, 1.5];
    if (/برغر جاج/.test(name)) return [255, 15, 29, 9, 2.5, 4, 470, 1.5];
    return [285, 14, 30, 12, 5, 3, 520, 1.7];
  }
  return [220, 10, 25, 9, 3, 3, 350, 2];
}

function nutritionFor(item) {
  const name = normalize(item.name);
  const category = normalize(item.category);
  const portion = portionFor(name, category);
  const [calories, protein, carbs, fat, saturatedFat, sugars, sodium, fiber] = profileFor(name, category);
  const factor = portion.amount / 100;
  return {
    calories: Math.round(calories * factor),
    protein: round1(protein * factor),
    carbs: round1(carbs * factor),
    fat: round1(fat * factor),
    saturatedFat: round1(saturatedFat * factor),
    sugars: round1(sugars * factor),
    sodium: Math.round(sodium * factor),
    fiber: round1(fiber * factor),
    portionSize: portion.label,
    basis: 'estimated',
    confidence: 'medium',
    source: 'USDA FoodData Central reference profiles; adjusted to the restaurant menu portion',
    calculatedAt: new Date(),
  };
}

async function main() {
  const items = menu.flatMap((group) => group.items);
  const operations = items.map((item) => ({
    updateOne: {
      filter: { name: normalize(item.name), category: normalize(item.category) },
      update: {
        $set: {
          nutrition: nutritionFor(item),
          allergyNotes: /مناقيش|بيتزا|العجين|صفيحة|سندويش|صندويش|فطيرة/.test(`${item.category} ${item.name}`)
            ? 'قد يحتوي على الغلوتين والحليب والسمسم. يرجى إبلاغنا بأي حساسية قبل الطلب.'
            : 'يرجى إبلاغنا بأي حساسية غذائية قبل الطلب؛ قد يحدث تلامس عرضي أثناء التحضير.',
        },
      },
    },
  }));

  if (process.argv.includes('--dry-run')) {
    console.log(`Nutrition estimates ready for ${operations.length} legacy products.`);
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing');
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await Product.bulkWrite(operations, { ordered: false });
  console.log(`Nutrition enriched: matched ${result.matchedCount}, updated ${result.modifiedCount}.`);
}

main().catch((error) => {
  console.error('Nutrition enrichment failed:', error);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
