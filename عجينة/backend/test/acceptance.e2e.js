'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const assert = require('assert/strict');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../src/models/User');
const Ingredient = require('../src/models/Ingredient');
const Product = require('../src/models/Product');
const SalesCenter = require('../src/models/SalesCenter');
const BranchInventory = require('../src/models/BranchInventory');

const PORT = 3102;
const BASE = `http://127.0.0.1:${PORT}/api`;
const TEST_DB = 'loliz_acceptance_e2e';
const results = [];
let server;

function testUri() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const url = new URL(process.env.MONGODB_URI);
  url.pathname = `/${TEST_DB}`;
  return url.toString();
}

async function request(path, { method = 'GET', token, key, body } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Tenant': 'ajeena' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(`${BASE}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    replayed: response.headers.get('idempotency-replayed'),
    data: await response.json().catch(() => ({})),
  };
}

async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`✓ ${name}`); }
  catch (error) { results.push({ name, ok: false, error: error.message }); console.error(`✗ ${name}: ${error.message}`); throw error; }
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* wait */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('test server did not start');
}

async function seed() {
  await mongoose.connect(testUri());
  await mongoose.connection.dropDatabase();
  const passwordHash = await bcrypt.hash('Test123!', 8);
  await User.create(['admin', 'supervisor', 'cashier', 'kitchen', 'viewer'].map(role => ({
    name: role, email: `${role}@test.local`, passwordHash, role,
  })));
  const ingredient = await Ingredient.create({
    name: 'اختبار طحين', unitType: 'gram', currentStock: 1000,
    averageCostPerUnit: 2, lowStockThreshold: 20,
  });
  const product = await Product.create({
    name: 'منتج اختبار القبول', category: 'اختبار', directPrice: 1000,
    availableQuantity: 30, status: 'available', showInTodayMenu: true,
    ingredients: [{
      ingredientId: ingredient._id, ingredientNameSnapshot: ingredient.name,
      quantityUsed: 10, unitType: 'gram', costSnapshot: 20,
    }],
  });
  const portalPasswordHash = await bcrypt.hash('Center123!', 8);
  const [centerA, centerB] = await SalesCenter.create([
    { name: 'فرع اختبار A', type: 'regular_price_center', portalUsername: 'center-a', portalPasswordHash },
    { name: 'فرع اختبار B', type: 'regular_price_center', portalUsername: 'center-b', portalPasswordHash },
  ]);
  await User.create({
    name: 'branch-kitchen', email: 'branch-kitchen@test.local', passwordHash,
    role: 'kitchen', centerId: centerA._id,
  });
  await BranchInventory.create([
    { centerId: centerA._id, itemType: 'ingredient', ingredientId: ingredient._id, itemNameSnapshot: ingredient.name, quantity: 100, averageCostPerUnit: 2 },
    { centerId: centerB._id, itemType: 'ingredient', ingredientId: ingredient._id, itemNameSnapshot: ingredient.name, quantity: 70, averageCostPerUnit: 2 },
  ]);
  await mongoose.disconnect();
  return { ingredientId: String(ingredient._id), productId: String(product._id), centerAId: String(centerA._id), centerBId: String(centerB._id) };
}

async function login(email, password = 'Test123!') {
  const response = await request('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200);
  return response.data.token;
}

async function main() {
  const ids = await seed();
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: require('path').join(__dirname, '..'),
    env: { ...process.env, MONGODB_URI: testUri(), PORT: String(PORT), NODE_ENV: 'test', ALLOW_SETUP_INIT: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', data => process.stderr.write(data));
  await waitForServer();

  const tokens = {};
  for (const role of ['admin', 'supervisor', 'cashier', 'kitchen', 'viewer']) tokens[role] = await login(`${role}@test.local`);
  tokens.branchKitchen = await login('branch-kitchen@test.local');
  const centerAToken = await loginCenter('center-a');
  const centerBToken = await loginCenter('center-b');

  await check('public menu and protected endpoint boundaries', async () => {
    assert.equal((await request('/products/public')).status, 200);
    assert.equal((await request('/reports/dashboard')).status, 401);
    assert.equal((await request('/setup/init')).status, 404);
  });

  await check('role matrix: admin, supervisor, viewer, cashier and kitchen', async () => {
    assert.equal((await request('/users', { token: tokens.admin })).status, 200);
    assert.equal((await request('/users', { token: tokens.supervisor })).status, 403);
    assert.equal((await request('/reports/dashboard', { token: tokens.viewer })).status, 200);
    assert.equal((await request('/ingredients', { token: tokens.cashier })).status, 403);
    assert.equal((await request('/products', { token: tokens.cashier })).status, 200);
    assert.equal((await request('/internal-orders', { token: tokens.kitchen })).status, 200);
    assert.equal((await request('/internal-orders', { method: 'POST', token: tokens.kitchen, body: { items: [] } })).status, 403);
    assert.equal((await request('/ingredients', { method: 'POST', token: tokens.viewer, body: { name: 'ممنوع' } })).status, 403);
  });

  let cashierOrder;
  await check('cashier POS creates one order and offline replay is idempotent', async () => {
    const payload = { items: [{ productId: ids.productId, quantity: 2 }], paymentMethod: 'cash' };
    const key = `e2e-${Date.now()}`;
    const first = await request('/internal-orders', { method: 'POST', token: tokens.cashier, key, body: payload });
    const second = await request('/internal-orders', { method: 'POST', token: tokens.cashier, key, body: payload });
    assert.equal(first.status, 201, JSON.stringify(first.data)); assert.equal(second.status, 201, JSON.stringify(second.data));
    assert.equal(first.data.order._id, second.data.order._id);
    assert.equal(second.replayed, '1');
    assert.equal(first.data.order.profit, undefined);
    assert.equal(first.data.order.items[0].unitCost, undefined);
    cashierOrder = first.data.order;
    const product = await request(`/products/${ids.productId}`, { token: tokens.admin });
    assert.equal(product.data.product.availableQuantity, 28);
  });

  await check('kitchen transitions and cancellation reverse stock and cash once', async () => {
    assert.equal((await request(`/internal-orders/${cashierOrder._id}/status`, { method: 'PUT', token: tokens.kitchen, body: { status: 'preparing' } })).status, 200);
    assert.equal((await request(`/internal-orders/${cashierOrder._id}/status`, { method: 'PUT', token: tokens.kitchen, body: { status: 'ready' } })).status, 200);
    assert.equal((await request(`/internal-orders/${cashierOrder._id}/status`, { method: 'PUT', token: tokens.kitchen, body: { status: 'cancelled' } })).status, 403);
    assert.equal((await request(`/internal-orders/${cashierOrder._id}/status`, { method: 'PUT', token: tokens.supervisor, body: { status: 'cancelled' } })).status, 200);
    const product = await request(`/products/${ids.productId}`, { token: tokens.admin });
    assert.equal(product.data.product.availableQuantity, 30);
  });

  await check('partner rate follows order type, percent discount is computed server-side', async () => {
    const takeaway = await request('/internal-orders', { method: 'POST', token: tokens.cashier, body: {
      items: [{ productId: ids.productId, quantity: 2 }], orderType: 'takeaway', paymentMethod: 'cash',
      discountType: 'percent', discountPercent: 10, discount: 999999, discountReason: 'شركة توصيل',
    } });
    assert.equal(takeaway.status, 201, JSON.stringify(takeaway.data));
    assert.equal(takeaway.data.order.discount, 200);
    assert.equal(takeaway.data.order.total, 1800);
    assert.equal(takeaway.data.order.investorPercent, 10);
    assert.ok(takeaway.data.order.shiftId, 'a sale with no shift open opens one');

    const dineIn = await request('/internal-orders', { method: 'POST', token: tokens.cashier, body: {
      items: [{ productId: ids.productId, quantity: 1 }], orderType: 'dine_in', paymentMethod: 'card',
    } });
    assert.equal(dineIn.data.order.investorPercent, 15);
    assert.equal(dineIn.data.order.shiftId, takeaway.data.order.shiftId);

    const report = await request('/internal-orders/daily-report', { token: tokens.cashier });
    assert.equal(report.status, 200);
    assert.equal(report.data.totals.investorShare, 180 + 150);
  });

  await check('cashier closes the shift against a drawer count and the till starts at zero', async () => {
    const current = await request('/shifts/current', { token: tokens.cashier });
    assert.equal(current.data.shift.summary.cashSales, 1800);
    assert.equal(current.data.shift.expectedCash, 1800);
    assert.equal((await request('/shifts/open', { method: 'POST', token: tokens.cashier, body: {} })).status, 409);

    const closed = await request('/shifts/close', { method: 'POST', token: tokens.cashier, body: { countedCash: 1750 } });
    assert.equal(closed.status, 200, JSON.stringify(closed.data));
    assert.equal(closed.data.shift.difference, -50);
    assert.equal((await request('/shifts/current', { token: tokens.cashier })).data.shift, null);

    const opened = await request('/shifts/open', { method: 'POST', token: tokens.cashier, body: { openingCash: 500 } });
    assert.equal(opened.status, 201);
    assert.equal(opened.data.shift.expectedCash, 500);
    assert.equal(opened.data.shift.summary.ordersCount, 0);
  });

  await check('branch purchase affects only its own inventory and reverses safely', async () => {
    const beforeA = await branchStock(centerAToken, ids.ingredientId);
    const beforeB = await branchStock(centerBToken, ids.ingredientId);
    const purchase = await request('/center-portal/purchases', { method: 'POST', token: centerAToken, body: {
      supplierName: 'مورد اختبار', items: [{ ingredientId: ids.ingredientId, quantity: 20, unitType: 'gram', totalCost: 60 }], paidFromCashBalance: true,
    } });
    assert.equal(purchase.status, 201);
    assert.equal(await branchStock(centerAToken, ids.ingredientId), beforeA + 20);
    assert.equal(await branchStock(centerBToken, ids.ingredientId), beforeB);
    const reversed = await request(`/center-portal/purchases/${purchase.data.purchase._id}`, { method: 'DELETE', token: centerAToken, body: { reason: 'اختبار العكس' } });
    assert.equal(reversed.status, 200);
    assert.equal(await branchStock(centerAToken, ids.ingredientId), beforeA);
  });

  let branchKitchenOrder;
  await check('branch POS is isolated and sends a ticket to kitchen', async () => {
    const beforeA = await branchStock(centerAToken, ids.ingredientId);
    const beforeB = await branchStock(centerBToken, ids.ingredientId);
    const sale = await request('/center-portal/sales', { method: 'POST', token: centerAToken, body: { items: [{ productId: ids.productId, quantity: 2 }], paymentMethod: 'cash' } });
    assert.equal(sale.status, 201);
    branchKitchenOrder = sale.data.kitchenOrder;
    assert.equal(String(branchKitchenOrder.centerId), ids.centerAId);
    assert.equal(await branchStock(centerAToken, ids.ingredientId), beforeA - 20);
    assert.equal(await branchStock(centerBToken, ids.ingredientId), beforeB);
    const kitchen = await request(`/internal-orders?center=${ids.centerBId}`, { token: tokens.branchKitchen });
    assert.ok(kitchen.data.orders.some(order => order._id === branchKitchenOrder._id));
    assert.equal((await request(`/internal-orders/${cashierOrder._id}`, { token: tokens.branchKitchen })).status, 403);
  });

  await check('manual branch cash corrections keep an immutable audit trail', async () => {
    const before = (await request('/center-portal/cash', { token: centerAToken })).data.balance;
    const expense = await request('/center-portal/expenses', { method: 'POST', token: centerAToken, body: { amount: 75, description: 'مصروف اختبار' } });
    assert.equal(expense.status, 201);
    assert.equal((await request('/center-portal/cash', { token: centerAToken })).data.balance, before - 75);
    const reversed = await request(`/center-portal/expenses/${expense.data.transaction._id}`, { method: 'DELETE', token: centerAToken });
    assert.equal(reversed.status, 200);
    assert.equal((await request('/center-portal/cash', { token: centerAToken })).data.balance, before);
    const journal = await request('/center-portal/expenses', { token: centerAToken });
    assert.ok(journal.data.transactions.some(tx => String(tx.reversalOfId) === expense.data.transaction._id));
  });

  await check('branch waste and reversal stay inside the branch', async () => {
    const before = await branchStock(centerAToken, ids.ingredientId);
    const waste = await request('/center-portal/waste', { method: 'POST', token: centerAToken, body: {
      type: 'ingredient', ingredientId: ids.ingredientId, quantity: 5, unitType: 'gram', reason: 'damaged',
    } });
    assert.equal(waste.status, 201); assert.equal(await branchStock(centerAToken, ids.ingredientId), before - 5);
    assert.equal((await request(`/center-portal/waste/${waste.data.waste._id}`, { method: 'DELETE', token: centerAToken, body: { reason: 'اختبار' } })).status, 200);
    assert.equal(await branchStock(centerAToken, ids.ingredientId), before);
  });

  await check('production consumes ingredients and reversal restores both sides', async () => {
    const beforeIngredient = (await request(`/ingredients/${ids.ingredientId}`, { token: tokens.admin })).data.ingredient.currentStock;
    const beforeProduct = (await request(`/products/${ids.productId}`, { token: tokens.admin })).data.product.availableQuantity;
    const production = await request('/production', { method: 'POST', token: tokens.supervisor, body: { productId: ids.productId, quantityProduced: 2 } });
    assert.equal(production.status, 201);
    assert.equal((await request(`/ingredients/${ids.ingredientId}`, { token: tokens.admin })).data.ingredient.currentStock, beforeIngredient - 20);
    assert.equal((await request(`/production/${production.data.batch._id}`, { method: 'DELETE', token: tokens.supervisor, body: { reason: 'اختبار' } })).status, 200);
    assert.equal((await request(`/ingredients/${ids.ingredientId}`, { token: tokens.admin })).data.ingredient.currentStock, beforeIngredient);
    assert.equal((await request(`/products/${ids.productId}`, { token: tokens.admin })).data.product.availableQuantity, beforeProduct);
  });

  await check('customer order lifecycle uses consistent totals and reverses delivery', async () => {
    const created = await request('/orders', { method: 'POST', body: {
      productId: ids.productId, quantity: 1, customerName: 'عميل اختبار', customerPhone: '0999999999', deliveryMethod: 'pickup',
    } });
    assert.equal(created.status, 201); assert.equal(created.data.order.totalPrice, 1000);
    assert.equal(created.data.order.deliveryMethod, 'pickup');
    assert.equal((await request(`/orders/${created.data.order._id}/status`, { method: 'PUT', token: tokens.supervisor, body: { status: 'ready' } })).status, 200);
    assert.equal((await request(`/orders/${created.data.order._id}/status`, { method: 'PUT', token: tokens.supervisor, body: { status: 'delivered' } })).status, 200);
    assert.equal((await request(`/orders/${created.data.order._id}/status`, { method: 'PUT', token: tokens.supervisor, body: { status: 'cancelled' } })).status, 200);
  });

  await check('legacy sale reversal restores stock and excludes the sale from active lists', async () => {
    const before = (await request(`/products/${ids.productId}`, { token: tokens.admin })).data.product.availableQuantity;
    const sale = await request('/sales', { method: 'POST', token: tokens.supervisor, body: {
      productId: ids.productId, quantity: 1, salesChannel: 'direct', paymentStatus: 'paid',
    } });
    assert.equal(sale.status, 201);
    assert.equal((await request(`/products/${ids.productId}`, { token: tokens.admin })).data.product.availableQuantity, before - 1);
    const reversed = await request(`/sales/${sale.data.sale._id}`, { method: 'DELETE', token: tokens.supervisor, body: { reason: 'اختبار الإلغاء' } });
    assert.equal(reversed.status, 200);
    assert.equal(reversed.data.sale.status, 'reversed');
    assert.equal((await request(`/products/${ids.productId}`, { token: tokens.admin })).data.product.availableQuantity, before);
    const active = await request('/sales', { token: tokens.supervisor });
    assert.ok(!active.data.sales.some(row => row._id === sale.data.sale._id));
    assert.equal((await request(`/sales/${sale.data.sale._id}`, { method: 'DELETE', token: tokens.supervisor })).status, 200);
    assert.equal((await request(`/products/${ids.productId}`, { token: tokens.admin })).data.product.availableQuantity, before);
  });

  await check('daily/monthly/product/profit reports agree on active sales', async () => {
    const now = new Date(); const day = now.toISOString().slice(0, 10);
    const daily = await request(`/reports/daily?date=${day}`, { token: tokens.admin });
    const monthly = await request(`/reports/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, { token: tokens.admin });
    const products = await request(`/reports/products?startDate=${day}&endDate=${day}`, { token: tokens.admin });
    const profit = await request(`/reports/profit-loss?startDate=${day}&endDate=${day}`, { token: tokens.admin });
    assert.equal(daily.status, 200); assert.equal(monthly.status, 200); assert.equal(products.status, 200); assert.equal(profit.status, 200);
    assert.ok(daily.data.summary.totalRevenue > 0);
    assert.ok(monthly.data.summary.totalRevenue >= daily.data.summary.totalRevenue);
    assert.ok(products.data.products.some(row => String(row.productId) === ids.productId));
    assert.equal(profit.data.report.revenue, daily.data.summary.totalRevenue);
  });

  console.log(`\nAcceptance result: ${results.filter(r => r.ok).length}/${results.length} passed`);
}

async function loginCenter(username) {
  const response = await request('/center-portal/login', { method: 'POST', body: { username, password: 'Center123!' } });
  assert.equal(response.status, 200);
  return response.data.token;
}

async function branchStock(token, ingredientId) {
  const response = await request('/center-portal/ingredients', { token });
  assert.equal(response.status, 200);
  return response.data.ingredients.find(item => item._id === ingredientId)?.currentStock || 0;
}

async function cleanup() {
  if (server && !server.killed) server.kill('SIGTERM');
  try {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    await mongoose.connect(testUri()); await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  } catch (error) { console.error(`Cleanup warning: ${error.message}`); }
}

main().then(cleanup).catch(async error => { await cleanup(); console.error(error); process.exitCode = 1; });
