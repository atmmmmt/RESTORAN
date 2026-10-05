'use strict';

const router = require('express').Router();
const Product = require('../models/Product');

function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
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

async function loadProducts() {
  return Product.find({})
    .select('_id slug name description image directPrice category status showInTodayMenu updatedAt')
    .sort({ category: 1, name: 1 })
    .lean();
}

async function loadCategories(products) {
  const map = new Map();
  for (const product of products) {
    const name = normalizeCategory(product.category);
    const row = map.get(name) || { id: name, name, productCount: 0, visibleProductCount: 0 };
    row.productCount += 1;
    if (product.status === 'available' && product.showInTodayMenu !== false) row.visibleProductCount += 1;
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

router.use((req, res, next) => {
  noCache(res);
  next();
});

router.get('/products', async (req, res) => {
  const products = await loadProducts();
  res.json({
    success: true,
    restaurant: 'لوليز',
    generatedAt: new Date().toISOString(),
    products: products.map(presentProduct),
  });
});

router.get('/categories', async (req, res) => {
  const products = await loadProducts();
  res.json({
    success: true,
    restaurant: 'لوليز',
    generatedAt: new Date().toISOString(),
    categories: await loadCategories(products),
  });
});

router.get('/', async (req, res) => {
  const products = await loadProducts();
  res.json({
    success: true,
    version: '1.0',
    restaurant: 'لوليز',
    generatedAt: new Date().toISOString(),
    categories: await loadCategories(products),
    products: products.map(presentProduct),
  });
});

module.exports = router;
