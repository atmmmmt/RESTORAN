'use strict';

const mongoose = require('mongoose');
const { virtualTryOnSchema } = require('./schemas/virtualTryOnSchema');

const ingredientEntrySchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
    },
    ingredientNameSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    quantityUsed: {
      type: Number,
      required: true,
      min: [0.001, 'الكمية المستخدمة يجب أن تكون أكبر من صفر'],
    },
    unitType: {
      type: String,
      enum: ['gram', 'kg', 'ml', 'liter', 'piece'],
      required: true,
    },
    costSnapshot: {
      type: Number,
      default: 0,
      min: [0, 'تكلفة المكوّن لا تكون سالبة'],
    },
    nutritionSnapshot: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fat: { type: Number, default: 0 },
    },
  },
  { _id: true }
);

/* A selectable per-order tweak — "Extra meat", "Less meat" — that shifts
   the price (and, since it changes what actually goes in the dish, the
   cost) away from the product's base numbers. Chosen at sale time in the
   POS; InternalOrder snapshots name+deltas onto the line so a later edit
   here never rewrites a past order's total. */
const modifierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    priceDelta: { type: Number, default: 0 },
    costDelta: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم المنتج مطلوب'],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    imagePublicId: {
      type: String,
      trim: true,
      default: null,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    ingredients: {
      type: [ingredientEntrySchema],
      default: [],
    },
    packagingCost: {
      type: Number,
      default: 0,
      min: [0, 'تكلفة التغليف لا تكون سالبة'],
    },
    extraCost: {
      type: Number,
      default: 0,
      min: [0, 'التكلفة الإضافية لا تكون سالبة'],
    },
    /* Cost can be entered directly for day-to-day simplicity, or calculated
       from the ingredient recipe when the advanced mode is explicitly used. */
    costMode: {
      type: String,
      enum: ['direct', 'recipe'],
      default: 'recipe',
    },
    directCost: {
      type: Number,
      default: 0,
      min: [0, 'الكلفة المباشرة لا تكون سالبة'],
    },
    calculatedCost: {
      type: Number,
      default: 0,
    },
    nutrition: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fat: { type: Number, default: 0 },
      saturatedFat: { type: Number, default: 0 },
      sugars: { type: Number, default: 0 },
      sodium: { type: Number, default: 0 },
      fiber: { type: Number, default: 0 },
      portionSize: { type: String, default: '' },
      basis: { type: String, enum: ['estimated', 'recipe', 'laboratory', 'label'], default: 'estimated' },
      confidence: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
      source: { type: String, default: '' },
      calculatedAt: { type: Date, default: null },
    },
    directPrice: {
      type: Number,
      default: 0,
      min: [0, 'السعر المباشر لا يكون سالباً'],
    },
    regularCenterPrice: {
      type: Number,
      default: 0,
      min: [0, 'سعر المركز الثابت لا يكون سالباً'],
    },
    specializedCenterDefaultCommissionPercent: {
      type: Number,
      default: 20,
      min: [0, 'نسبة العمولة لا تكون سالبة'],
      max: [100, 'نسبة العمولة لا تتجاوز 100%'],
    },
    modifiers: {
      type: [modifierSchema],
      default: [],
    },
    availableQuantity: {
      type: Number,
      default: 0,
      min: [0, 'الكمية المتاحة لا تكون سالبة'],
    },
    producedQuantity: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['available', 'hidden', 'sold_out'],
      default: 'available',
    },
    showInTodayMenu: {
      type: Boolean,
      default: true,
    },
    allergyNotes: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },

    /* WebAR Product Virtual Try-On — see models/schemas/virtualTryOnSchema.js.
       Defaults to disabled, so existing products are unaffected. */
    virtualTryOn: {
      type: virtualTryOnSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (slug unique index already created by unique:true in schema definition)
productSchema.index({ status: 1 });
productSchema.index({ category: 1 });
productSchema.index({ showInTodayMenu: 1 });

/**
 * Generate slug from Arabic/any name
 * For Arabic names, use a timestamp-based slug
 */
function generateSlug(name) {
  // Transliterate common Arabic characters to Latin equivalents
  const arabicToLatin = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
    'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
    'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
    'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
    'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a',
    'ة': 'a', 'ء': '', 'ئ': 'y', 'ؤ': 'w',
    ' ': '-',
  };

  let slug = name
    .split('')
    .map((char) => arabicToLatin[char] !== undefined ? arabicToLatin[char] : char)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug || slug.length < 2) {
    slug = 'product';
  }

  return `${slug}-${Date.now()}`;
}

// Pre-save hook: auto-calculate cost, nutrition, and slug
productSchema.pre('save', function (next) {
  // Generate slug if not set or name changed
  if (!this.slug || this.isModified('name')) {
    this.slug = generateSlug(this.name);
  }

  // Simple mode wins: the manager enters one final product cost.
  if (this.costMode === 'direct' && (this.isModified('costMode') || this.isModified('directCost') || this.isNew)) {
    this.calculatedCost = Math.max(Number(this.directCost) || 0, 0);
  }

  // Advanced mode: calculate cost from the saved recipe.
  if (this.costMode !== 'direct' && this.ingredients.length > 0 && (this.isModified('ingredients') || this.isModified('packagingCost') || this.isModified('extraCost') || this.isModified('costMode'))) {
    let ingredientCost = 0;
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    for (const ing of this.ingredients) {
      ingredientCost += ing.costSnapshot || 0;
      totalCalories += ing.nutritionSnapshot ? ing.nutritionSnapshot.calories || 0 : 0;
      totalProtein += ing.nutritionSnapshot ? ing.nutritionSnapshot.protein || 0 : 0;
      totalCarbs += ing.nutritionSnapshot ? ing.nutritionSnapshot.carbs || 0 : 0;
      totalFat += ing.nutritionSnapshot ? ing.nutritionSnapshot.fat || 0 : 0;
    }

    this.calculatedCost = ingredientCost + (this.packagingCost || 0) + (this.extraCost || 0);

    // Update nutrition totals (preserve portionSize)
    const portionSize = this.nutrition ? this.nutrition.portionSize : '';
    this.nutrition = {
      calories: Math.round(totalCalories * 100) / 100,
      protein: Math.round(totalProtein * 100) / 100,
      carbs: Math.round(totalCarbs * 100) / 100,
      fat: Math.round(totalFat * 100) / 100,
      portionSize: portionSize || '',
      basis: 'recipe',
      confidence: 'high',
      source: 'Calculated from the saved ingredient recipe',
      calculatedAt: new Date(),
    };
  }

  next();
});

module.exports = mongoose.model('Product', productSchema);
