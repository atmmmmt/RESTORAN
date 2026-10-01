'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const path = require('path');
const Product = require('../models/Product');
const menu = require('./legacy-menu.json');

const DEFAULT_STOCK = Math.max(0, Number(process.env.LEGACY_MENU_INITIAL_STOCK ?? 100));
const BRAND_CATEGORY_IMAGES = {
  'مناقيش': '/menu/brand-categories-v2/manakish.webp',
  'الصفيحة واللحوم': '/menu/brand-categories-v2/meat-pastries.webp',
  'بيتزا': '/menu/brand-categories-v2/pizza.webp',
  'صواني': '/menu/brand-categories-v2/trays.webp',
  'صندويش المشاوي': '/menu/brand-categories-v2/sandwiches.webp',
  'مقبلات': '/menu/brand-categories-v2/appetizers.webp',
  'وجبات المشاوي': '/menu/brand-categories-v2/mixed-grill.webp',
  'وجبات مشاوي دجاج': '/menu/brand-categories-v2/chicken-grill.webp',
  'سلطات': '/menu/brand-categories-v2/salads.webp',
  'اصناف عجينه وطحينه': '/menu/brand-categories-v2/signature.webp',
  'مشروبات': '/menu/brand-categories-v2/drinks.webp',
};

const PRODUCT_IMAGE_ROOT = '/menu/brand-products-v2';

function brandedProductImage(item) {
  const name = item.name.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const category = item.category;
  const product = (file) => `${PRODUCT_IMAGE_ROOT}/${file}.webp`;

  if (category === 'مناقيش') {
    if (/زعتر/.test(name) && !/جبنة|قشقوان|لبنة/.test(name)) return product('manakish-zaatar');
    if (/محمرة/.test(name) && !/جبنة|قشقوان/.test(name)) return product('manakish-muhammara');
    if (/لبنة/.test(name) && !/جبنة|قشقوان/.test(name)) return BRAND_CATEGORY_IMAGES[category];
    return product('manakish-cheese');
  }
  if (category === 'الصفيحة واللحوم') return product('sfiha');
  if (category === 'بيتزا') {
    return /سجق|بيبروني|سلامي|هوت دوغ|مرتديلا|لحوم|حبش/.test(name)
      ? product('pizza-meat') : product('pizza-vegetable');
  }
  if (category === 'صواني') return /طحينة/.test(name) ? product('tray-tahini') : product('tray-tomato');
  if (category === 'صندويش المشاوي') return /شيش/.test(name) ? product('sandwich-chicken') : product('sandwich-kebab');
  if (category === 'مقبلات') {
    if (/بطاطا/.test(name)) return product('fries');
    if (/حمص/.test(name)) return product('hummus');
    if (/محمرة/.test(name)) return product('muhammara');
    if (/متبل|باباغنوج/.test(name)) return product('mutabbal');
    return BRAND_CATEGORY_IMAGES[category];
  }
  if (category === 'وجبات المشاوي') {
    if (/كبة/.test(name)) return product('grill-kibbeh');
    if (/شقف|سودة/.test(name)) return product('grill-meat-cubes');
    return product('grill-kebab');
  }
  if (category === 'وجبات مشاوي دجاج') return /جوانح/.test(name) ? product('chicken-wings') : product('grill-chicken');
  if (category === 'سلطات') return product('salad-fattoush');
  if (category === 'اصناف عجينه وطحينه') {
    if (/برغر/.test(name)) return product('signature-burger');
    if (/شيش/.test(name)) return product('sandwich-chicken');
    return product('manakish-cheese');
  }
  if (category === 'مشروبات') {
    if (/مي صغيرة/.test(name)) return product('drink-water');
    if (/عيران/.test(name)) return product('drink-ayran');
    if (/بيبسي|كوكا|كيزا اسود/.test(name)) return product('drink-cola');
    return BRAND_CATEGORY_IMAGES[category];
  }
  return BRAND_CATEGORY_IMAGES[category] || product('manakish-cheese');
}

function sourceSlug(sourceUrl) {
  return new URL(sourceUrl).searchParams.get('product');
}

function categoryFile(categoryImage) {
  return (new URL(categoryImage).pathname.split('/').pop() || '')
    .replace(/_md(?=\.)/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-');
}

function localImage(item, group) {
  return brandedProductImage(item) || BRAND_CATEGORY_IMAGES[item.category] || `/menu/categories/${categoryFile(group.categoryImage)}`;
}

function description(item) {
  const templates = {
    'مناقيش': `${item.name} بعجينة يومية طازجة، مخبوزة عند الطلب لتصل ساخنة وشهية.`,
    'الصفيحة واللحوم': `${item.name} بعجينة طازجة وحشوة متبّلة على الطريقة الحلبية الأصيلة.`,
    'بيتزا': `${item.name} بعجينة مختمرة بعناية ومكونات متوازنة، مخبوزة طازجة عند الطلب.`,
    'صواني': `${item.name} محضّرة بعناية وبنكهة حلبية غنية، خيار مناسب للمشاركة.`,
    'صندويش المشاوي': `${item.name} بخبز طازج ومشاوي ساخنة، محضّرة عند الطلب.`,
    'مقبلات': `${item.name} محضّرة يوميًا لتكمل وجبتك بنكهة طازجة ومتوازنة.`,
    'وجبات المشاوي': `${item.name} من مشاوي متبّلة بعناية ومطهوة على النار لنكهة أصيلة.`,
    'وجبات مشاوي دجاج': `${item.name} من دجاج متبّل بعناية ومشوي عند الطلب.`,
    'سلطات': `${item.name} محضّرة من مكونات طازجة وتتبيلة متوازنة.`,
    'اصناف عجينه وطحينه': `${item.name} من أصناف عجينة وطحينة المميزة، محضّرة طازجة عند الطلب.`,
    'مشروبات': `${item.name} تُقدّم باردة ومنعشة مع وجبتك.`,
  };
  return templates[item.category] || `${item.name} محضّرة بعناية وتُقدّم طازجة.`;
}

async function main() {
  const operations = menu.flatMap((group) => group.items.map((item) => ({
    updateOne: {
      filter: { name: item.name.replace(/\s+/g, ' ').trim(), category: item.category },
      update: {
        $set: {
          image: localImage(item, group),
          description: description(item),
          directPrice: item.price,
          regularCenterPrice: item.price,
          status: 'available',
          showInTodayMenu: true,
          notes: `تم ترحيله من المنيو القديمة: ${item.sourceUrl}`,
        },
        $setOnInsert: {
          slug: `legacy-${sourceSlug(item.sourceUrl)}`,
          ingredients: [],
          availableQuantity: DEFAULT_STOCK,
          producedQuantity: 0,
          packagingCost: 0,
          extraCost: 0,
        },
      },
      upsert: true,
    },
  })));

  const uniqueKeys = new Set(operations.map(({ updateOne }) =>
    `${updateOne.filter.category}\u0000${updateOne.filter.name}`
  ));
  if (uniqueKeys.size !== operations.length) {
    throw new Error(`يوجد ${operations.length - uniqueKeys.size} منتج مكرر بالاسم والقسم`);
  }

  if (process.argv.includes('--dry-run')) {
    console.log(`البيانات سليمة: ${operations.length} منتج ضمن ${menu.length} قسمًا، دون تكرار.`);
    return;
  }

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI غير موجود في ملف البيئة');
  await mongoose.connect(process.env.MONGODB_URI);

  const result = await Product.bulkWrite(operations, { ordered: false });
  console.log(`اكتمل ترحيل ${operations.length} منتج.`);
  console.log(`جديد: ${result.upsertedCount}، محدّث: ${result.modifiedCount}، مطابق مسبقًا: ${result.matchedCount - result.modifiedCount}`);
}

main()
  .catch((error) => {
    console.error('فشل ترحيل المنيو:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
