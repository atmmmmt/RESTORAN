'use strict';

/**
 * One-off: import the 22 dishes from the digital-signage carousel project
 * (app/products.ts) into لوليز's catalogue — name, category, the carousel's
 * short note as the description, and its photo. No price or stock: the owner
 * asked for those left blank (0), to be filled in from the dashboard later.
 *
 *   node src/scripts/importCarouselProducts.js             ← dry run
 *   node src/scripts/importCarouselProducts.js --apply     ← writes it
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');
const { runWithTenant } = require('../tenancy/context');
require('mongoose').plugin(require('../tenancy/plugin'));

const APPLY = process.argv.includes('--apply');

const IMAGE_DIR = path.join(__dirname, '../../../frontend/public/images/products');

/* Copied straight from app/products.ts in that project. */
const ITEMS = [
  { id: 'tiramisu',            name: 'تيراميسو',            category: 'حلويات',            note: 'طبقات قهوة خفيفة تذوب بالفم' },
  { id: 'oriental-breakfast',  name: 'فطور شرقي',            category: 'صباح الخير',        note: 'تشكيلة شرقية غنية ومتنوعة' },
  { id: 'lemon-potatoes',      name: 'بطاطا بالليمون',       category: 'مقبلات',            note: 'بطاطا محضرة بالأعشاب والليمون' },
  { id: 'warak-enab',          name: 'ورق عنب بالرمان',      category: 'من أصول مطبخنا',    note: 'حامض مضبوط وحبات رمان طازجة' },
  { id: 'yabraq-meat',         name: 'يبرق باللحمة',         category: 'وجبة بيتية',        note: 'ورق عنب مطبوخ على مهله مع قطع اللحمة' },
  { id: 'yakhnet-malfoof',     name: 'يخنة ملفوف',           category: 'من أصول مطبخنا',    note: 'لفّات ملفوف طرية بنكهة دافئة' },
  { id: 'shishbarak',          name: 'شيشبرك',               category: 'أطباق اللبن',       note: 'حبات محشية ولبن كريمي على الأصول' },
  { id: 'mandi-chicken',       name: 'مندي دجاج',            category: 'وجبة رئيسية',       note: 'أرز عطِر ودجاج محمّر بالمكسرات' },
  { id: 'fattet-balnaji',      name: 'فتة بالنجي',           category: 'فتّات لوليز',       note: 'قوام كريمي وقرمشة خبز لا تقاوم' },
  { id: 'honey-chicken',       name: 'هوني تشكن',            category: 'نكهات عالمية',      note: 'دجاج مقرمش بصوص العسل والسمسم' },
  { id: 'mini-burger',         name: 'ميني تشكن برغر',       category: 'سندويشات',          note: 'حجم صغير… نكهة كبيرة' },
  { id: 'lasagna',             name: 'لازانيا',              category: 'من الفرن',          note: 'طبقات غنية وصوص بشاميل مخملي' },
  { id: 'mushroom-gratin',     name: 'غراتان مشروم',         category: 'من الفرن',          note: 'مشروم وصوص كريمي بوجه ذهبي' },
  { id: 'potato-gratin',       name: 'غراتان بطاطا',         category: 'من الفرن',          note: 'بطاطا طرية وجبنة محمّرة' },
  { id: 'fettuccine',          name: 'فيتوتشيني',            category: 'باستا',             note: 'باستا كريمية تُحضّر بكل حب' },
  { id: 'caesar-chicken',      name: 'سيزر دجاج',            category: 'سلطات',             note: 'دجاج مشوي وخس مقرمش وصوص سيزر' },
  { id: 'fried-kibbeh',        name: 'كبة مقلية',            category: 'مقبلات',            note: 'مقرمشة من الخارج وغنية من الداخل' },
  { id: 'stuffed-kibbeh',      name: 'كبة محشية',            category: 'من أصول مطبخنا',    note: 'حشوة لحم ومكسرات بخلطة لوليز' },
  { id: 'mac-cheese',          name: 'ماك آند تشيز',         category: 'باستا',             note: 'جبنة غنية وقوام كريمي دافئ' },
  { id: 'mahashi',             name: 'محاشي مشكلة',          category: 'وجبة عائلية',       note: 'تشكيلة محاشي مطبوخة على الطريقة البيتية' },
  { id: 'kuyub-loliz',         name: 'قبيوات لوليز',         category: 'وصفة خاصة',         note: 'وصفة لوليز المميزة بلمسة تركية' },
  { id: 'mixed-platter',       name: 'طبق لوليز المشكّل',    category: 'اختيار لوليز',      note: 'أكثر من نكهة حلوة في طبق واحد' },
];

function uploadOne(filePath) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'luliz/products', format: 'webp', resource_type: 'image', transformation: [{ quality: 'auto' }] },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    const readable = new Readable();
    readable.push(fs.readFileSync(filePath));
    readable.push(null);
    readable.pipe(stream);
  });
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Product = require('../models/Product');

  console.log(APPLY ? '⚙️  تنفيذ فعلي — رفع الصور وإنشاء المنتجات\n' : '🔎 وضع تجريبي — لن يُرفع أو يُنشأ شيء\n');

  await runWithTenant('luliz', async () => {
    for (const item of ITEMS) {
      const imgPath = path.join(IMAGE_DIR, `${item.id}.png`);
      if (!fs.existsSync(imgPath)) {
        console.log(`  ✗ ${item.name} — الصورة غير موجودة: ${imgPath}`);
        continue;
      }

      const exists = await Product.findOne({ name: item.name });
      if (exists) {
        console.log(`  ⏭  ${item.name} — موجود مسبقاً، تُخطّي`);
        continue;
      }

      if (!APPLY) {
        console.log(`  + ${item.name}  (${item.category})`);
        continue;
      }

      const uploaded = await uploadOne(imgPath);
      const product = await Product.create({
        name: item.name,
        category: item.category,
        description: item.note,
        image: uploaded.secure_url,
        imagePublicId: uploaded.public_id,
        directPrice: 0,
        availableQuantity: 0,
        status: 'available',
        showInTodayMenu: true,
      });
      console.log(`  ✓ ${item.name} — أُنشئ (${product._id})`);
    }
  });

  console.log(`\n${APPLY ? 'تم الاستيراد.' : 'أعد التشغيل مع --apply للتنفيذ.'}`);
  await mongoose.disconnect();
})().catch(e => { console.error('فشل:', e.message); process.exit(1); });
