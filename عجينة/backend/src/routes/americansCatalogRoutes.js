'use strict';

const router = require('express').Router();
const Product = require('../models/Product');
const Category = require('../models/Category');

function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
}

function normalizeCategory(name) {
  return String(name || 'غير مصنف').trim() || 'غير مصنف';
}

function presentProduct(product) {
  return {
    id: String(product._id),
    slug: product.slug || '',
    name: product.name,
    description: product.description || '',
    image: product.image || '',
    price: Number(product.directPrice || 0),
    currency: 'SYP',
    category: normalizeCategory(product.category),
    visible: product.status === 'available' && product.showInTodayMenu !== false,
    status: product.status,
    updatedAt: product.updatedAt,
  };
}

function presentCategory(category, counts) {
  return {
    id: String(category._id),
    name: category.name,
    description: category.description || '',
    image: category.image || '',
    sortOrder: Number(category.sortOrder || 0),
    visible: category.isActive !== false,
    productCount: counts.get(category.name) || 0,
    updatedAt: category.updatedAt,
  };
}

async function loadData() {
  const [products, categories] = await Promise.all([
    Product.find({ status: 'available', showInTodayMenu: { $ne: false } })
      .select('_id slug name description image directPrice category status showInTodayMenu updatedAt')
      .sort({ category: 1, name: 1 })
      .lean(),
    Category.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean(),
  ]);
  const counts = new Map();
  for (const p of products) {
    const name = normalizeCategory(p.category);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return { products, categories, counts };
}

router.use((req, res, next) => {
  noCache(res);
  next();
});

router.get('/products', async (req, res) => {
  const { products } = await loadData();
  res.json({
    success: true,
    restaurant: 'عجينة وطحينة',
    generatedAt: new Date().toISOString(),
    products: products.map(presentProduct),
  });
});

router.get('/categories', async (req, res) => {
  const { categories, counts } = await loadData();
  res.json({
    success: true,
    restaurant: 'عجينة وطحينة',
    generatedAt: new Date().toISOString(),
    categories: categories.map(c => presentCategory(c, counts)),
  });
});

router.get('/', async (req, res) => {
  const { products, categories, counts } = await loadData();
  res.json({
    success: true,
    version: '1.0',
    restaurant: 'عجينة وطحينة',
    generatedAt: new Date().toISOString(),
    categories: categories.map(c => presentCategory(c, counts)),
    products: products.map(presentProduct),
  });
});

module.exports = router;
