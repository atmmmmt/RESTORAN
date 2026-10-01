'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Ingredient = require('../models/Ingredient');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const SalesCenter = require('../models/SalesCenter');
const Offer = require('../models/Offer');
const CashTransaction = require('../models/CashTransaction');
const ProductionBatch = require('../models/ProductionBatch');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/luliz');
  console.log('✅ متصل بـ MongoDB');

  // Clear all collections
  await Promise.all([
    User.deleteMany({}),
    Ingredient.deleteMany({}),
    Product.deleteMany({}),
    Purchase.deleteMany({}),
    SalesCenter.deleteMany({}),
    Offer.deleteMany({}),
    CashTransaction.deleteMany({}),
    ProductionBatch.deleteMany({}),
  ]);
  console.log('🧹 تم مسح البيانات القديمة');

  // ── Admin user ──────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('123456', 12);
  await User.create({
    name: 'إدارة عجينة وطحينة',
    email: 'admin@ajineh-w-tahineh.com',
    phone: '0991234567',
    passwordHash,
    role: 'admin',
  });
  console.log('👩‍🍳 تم إنشاء المستخدم: admin@ajineh-w-tahineh.com / 123456');

  // ── Opening cash balance ─────────────────────────────────────
  await CashTransaction.create({
    type: 'opening_balance',
    amount: 200000,
    direction: 'in',
    description: 'رصيد افتتاحي',
    transactionDate: new Date(),
  });
  console.log('💵 رصيد افتتاحي: 200,000 ل.س');

  // ── Ingredients ──────────────────────────────────────────────
  const ingredientData = [
    { name: 'رز', unitType: 'gram', currentStock: 5000, averageCostPerUnit: 2, totalPurchasedQuantity: 5000, totalPurchasedCost: 10000, nutritionPerUnit: { calories: 3.6, protein: 0.07, carbs: 0.79, fat: 0.004 }, lowStockThreshold: 500 },
    { name: 'بندورة', unitType: 'gram', currentStock: 3000, averageCostPerUnit: 1.5, totalPurchasedQuantity: 3000, totalPurchasedCost: 4500, nutritionPerUnit: { calories: 0.18, protein: 0.009, carbs: 0.038, fat: 0.002 }, lowStockThreshold: 300 },
    { name: 'دجاج', unitType: 'gram', currentStock: 4000, averageCostPerUnit: 8, totalPurchasedQuantity: 4000, totalPurchasedCost: 32000, nutritionPerUnit: { calories: 2.39, protein: 0.27, carbs: 0, fat: 0.14 }, lowStockThreshold: 500 },
    { name: 'معكرونة', unitType: 'gram', currentStock: 4000, averageCostPerUnit: 1.8, totalPurchasedQuantity: 4000, totalPurchasedCost: 7200, nutritionPerUnit: { calories: 3.71, protein: 0.13, carbs: 0.74, fat: 0.015 }, lowStockThreshold: 500 },
    { name: 'جبنة موزاريلا', unitType: 'gram', currentStock: 2000, averageCostPerUnit: 12, totalPurchasedQuantity: 2000, totalPurchasedCost: 24000, nutritionPerUnit: { calories: 2.8, protein: 0.22, carbs: 0.02, fat: 0.22 }, lowStockThreshold: 200 },
    { name: 'كريمة طبخ', unitType: 'ml', currentStock: 3000, averageCostPerUnit: 5, totalPurchasedQuantity: 3000, totalPurchasedCost: 15000, nutritionPerUnit: { calories: 3.4, protein: 0.02, carbs: 0.03, fat: 0.35 }, lowStockThreshold: 300 },
    { name: 'بهارات مشكلة', unitType: 'gram', currentStock: 500, averageCostPerUnit: 10, totalPurchasedQuantity: 500, totalPurchasedCost: 5000, nutritionPerUnit: { calories: 2.5, protein: 0.1, carbs: 0.5, fat: 0.05 }, lowStockThreshold: 50 },
    { name: 'علب تغليف', unitType: 'piece', currentStock: 200, averageCostPerUnit: 150, totalPurchasedQuantity: 200, totalPurchasedCost: 30000, nutritionPerUnit: { calories: 0, protein: 0, carbs: 0, fat: 0 }, lowStockThreshold: 20 },
  ];

  const ingredients = await Ingredient.create(ingredientData);
  const ingMap = {};
  ingredients.forEach(i => { ingMap[i.name] = i; });
  console.log(`🥕 تم إنشاء ${ingredients.length} مكون`);

  // ── Products ─────────────────────────────────────────────────
  const products = await Product.create([
    {
      name: 'لازانيا دجاج',
      description: 'لازانيا شهية بالدجاج والجبنة الموزاريلا وصلصة البندورة الطازجة',
      category: 'باستا',
      image: '🍝',
      ingredients: [
        { ingredientId: ingMap['معكرونة']._id, ingredientNameSnapshot: 'معكرونة', quantityUsed: 150, unitType: 'gram', costSnapshot: ingMap['معكرونة'].averageCostPerUnit * 150 },
        { ingredientId: ingMap['دجاج']._id, ingredientNameSnapshot: 'دجاج', quantityUsed: 200, unitType: 'gram', costSnapshot: ingMap['دجاج'].averageCostPerUnit * 200 },
        { ingredientId: ingMap['جبنة موزاريلا']._id, ingredientNameSnapshot: 'جبنة موزاريلا', quantityUsed: 80, unitType: 'gram', costSnapshot: ingMap['جبنة موزاريلا'].averageCostPerUnit * 80 },
        { ingredientId: ingMap['بندورة']._id, ingredientNameSnapshot: 'بندورة', quantityUsed: 100, unitType: 'gram', costSnapshot: ingMap['بندورة'].averageCostPerUnit * 100 },
        { ingredientId: ingMap['بهارات مشكلة']._id, ingredientNameSnapshot: 'بهارات', quantityUsed: 10, unitType: 'gram', costSnapshot: ingMap['بهارات مشكلة'].averageCostPerUnit * 10 },
      ],
      packagingCost: 150,
      extraCost: 200,
      directPrice: 7500,
      regularCenterPrice: 6000,
      specializedCenterDefaultCommissionPercent: 20,
      availableQuantity: 15,
      status: 'available',
      showInTodayMenu: true,
    },
    {
      name: 'باستا كريمية',
      description: 'باستا بالكريمة والدجاج الطري مع توابل خاصة',
      category: 'باستا',
      image: '🍜',
      ingredients: [
        { ingredientId: ingMap['معكرونة']._id, ingredientNameSnapshot: 'معكرونة', quantityUsed: 180, unitType: 'gram', costSnapshot: ingMap['معكرونة'].averageCostPerUnit * 180 },
        { ingredientId: ingMap['دجاج']._id, ingredientNameSnapshot: 'دجاج', quantityUsed: 150, unitType: 'gram', costSnapshot: ingMap['دجاج'].averageCostPerUnit * 150 },
        { ingredientId: ingMap['كريمة طبخ']._id, ingredientNameSnapshot: 'كريمة طبخ', quantityUsed: 150, unitType: 'ml', costSnapshot: ingMap['كريمة طبخ'].averageCostPerUnit * 150 },
        { ingredientId: ingMap['بهارات مشكلة']._id, ingredientNameSnapshot: 'بهارات', quantityUsed: 8, unitType: 'gram', costSnapshot: ingMap['بهارات مشكلة'].averageCostPerUnit * 8 },
      ],
      packagingCost: 150,
      extraCost: 150,
      directPrice: 6500,
      regularCenterPrice: 5000,
      specializedCenterDefaultCommissionPercent: 20,
      availableQuantity: 20,
      status: 'available',
      showInTodayMenu: true,
    },
    {
      name: 'ماك أند تشيز',
      description: 'مكرونة بالجبن الكريمي المذاب — وجبة العيلة المفضلة',
      category: 'باستا',
      image: '🧀',
      ingredients: [
        { ingredientId: ingMap['معكرونة']._id, ingredientNameSnapshot: 'معكرونة', quantityUsed: 200, unitType: 'gram', costSnapshot: ingMap['معكرونة'].averageCostPerUnit * 200 },
        { ingredientId: ingMap['جبنة موزاريلا']._id, ingredientNameSnapshot: 'جبنة موزاريلا', quantityUsed: 100, unitType: 'gram', costSnapshot: ingMap['جبنة موزاريلا'].averageCostPerUnit * 100 },
        { ingredientId: ingMap['كريمة طبخ']._id, ingredientNameSnapshot: 'كريمة طبخ', quantityUsed: 100, unitType: 'ml', costSnapshot: ingMap['كريمة طبخ'].averageCostPerUnit * 100 },
      ],
      packagingCost: 150,
      extraCost: 100,
      directPrice: 5500,
      regularCenterPrice: 4500,
      specializedCenterDefaultCommissionPercent: 18,
      availableQuantity: 25,
      status: 'available',
      showInTodayMenu: true,
    },
    {
      name: 'سويت أند ساور تشيكن',
      description: 'دجاج بصلصة الحلو والحامض مع الرز الطري',
      category: 'رز',
      image: '🍗',
      ingredients: [
        { ingredientId: ingMap['دجاج']._id, ingredientNameSnapshot: 'دجاج', quantityUsed: 250, unitType: 'gram', costSnapshot: ingMap['دجاج'].averageCostPerUnit * 250 },
        { ingredientId: ingMap['رز']._id, ingredientNameSnapshot: 'رز', quantityUsed: 150, unitType: 'gram', costSnapshot: ingMap['رز'].averageCostPerUnit * 150 },
        { ingredientId: ingMap['بندورة']._id, ingredientNameSnapshot: 'بندورة', quantityUsed: 80, unitType: 'gram', costSnapshot: ingMap['بندورة'].averageCostPerUnit * 80 },
        { ingredientId: ingMap['بهارات مشكلة']._id, ingredientNameSnapshot: 'بهارات', quantityUsed: 12, unitType: 'gram', costSnapshot: ingMap['بهارات مشكلة'].averageCostPerUnit * 12 },
      ],
      packagingCost: 150,
      extraCost: 250,
      directPrice: 8000,
      regularCenterPrice: 6500,
      specializedCenterDefaultCommissionPercent: 20,
      availableQuantity: 10,
      status: 'available',
      showInTodayMenu: true,
    },
  ]);
  console.log(`🍝 تم إنشاء ${products.length} منتج`);

  // ── Sales Centers ────────────────────────────────────────────
  const centers = await SalesCenter.create([
    {
      name: 'مركز الأندلس',
      type: 'regular_price_center',
      commissionPercent: 0,
      contactPerson: 'أبو محمد',
      phone: '0991111111',
      location: 'حي الأندلس',
      isActive: true,
    },
    {
      name: 'متجر ليلى',
      type: 'commission_based_specialized_center',
      commissionPercent: 20,
      contactPerson: 'ليلى',
      phone: '0992222222',
      location: 'شارع الثورة',
      isActive: true,
    },
  ]);
  console.log(`🏪 تم إنشاء ${centers.length} مركز بيع`);

  // ── Offers ───────────────────────────────────────────────────
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);

  await Offer.create([
    {
      productId: products[0]._id,
      productNameSnapshot: products[0].name,
      discountType: 'percentage',
      discountValue: 10,
      startDate: now,
      endDate: end,
      isActive: true,
      showOnHomepage: true,
    },
    {
      productId: products[1]._id,
      productNameSnapshot: products[1].name,
      discountType: 'fixed',
      discountValue: 500,
      startDate: now,
      endDate: end,
      isActive: true,
      showOnHomepage: true,
    },
  ]);
  console.log('🏷️ تم إنشاء 2 عرض');

  // ── Sample Purchase ──────────────────────────────────────────
  await Purchase.create({
    supplierName: 'محل أبو خالد',
    items: [
      { ingredientId: ingMap['دجاج']._id, ingredientNameSnapshot: 'دجاج', quantity: 2000, unitType: 'gram', costPerUnit: 8, totalCost: 16000 },
      { ingredientId: ingMap['معكرونة']._id, ingredientNameSnapshot: 'معكرونة', quantity: 2000, unitType: 'gram', costPerUnit: 1.8, totalCost: 3600 },
    ],
    totalPurchaseCost: 19600,
    paymentMethod: 'cash',
    paidFromCashBalance: true,
    purchaseDate: new Date(),
  });

  await CashTransaction.create({
    type: 'purchase_expense',
    amount: 19600,
    direction: 'out',
    description: 'شراء مكونات - محل أبو خالد',
    transactionDate: new Date(),
  });
  console.log('🛒 تم إنشاء مشتريات تجريبية');

  console.log('\n🎉 تم إعداد البيانات الأولية بنجاح!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 البريد: admin@ajineh-w-tahineh.com');
  console.log('🔑 كلمة السر: 123456');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ خطأ في إعداد البيانات:', err);
  process.exit(1);
});
