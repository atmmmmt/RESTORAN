'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Purchase = require('../models/Purchase');
const WasteRecord = require('../models/WasteRecord');
const ProductionBatch = require('../models/ProductionBatch');
const BranchInventory = require('../models/BranchInventory');

async function run() {
  await connectDB();
  const totals = new Map();
  const key = (centerId, type, itemId) => `${centerId}:${type}:${itemId}`;
  const add = (centerId, type, itemId, name, quantity, cost = 0) => {
    const k = key(centerId, type, itemId);
    const row = totals.get(k) || { centerId, itemType: type, itemId, itemNameSnapshot: name, quantity: 0, costTotal: 0, purchased: 0 };
    row.quantity += quantity;
    if (quantity > 0) { row.costTotal += cost; row.purchased += quantity; }
    totals.set(k, row);
  };

  for (const purchase of await Purchase.find({ centerId: { $ne: null }, reversedAt: null })) {
    for (const item of purchase.items) add(purchase.centerId, 'ingredient', item.ingredientId, item.ingredientNameSnapshot, item.quantity, item.totalCost);
  }
  for (const batch of await ProductionBatch.find({ centerId: { $ne: null }, reversedAt: null })) {
    add(batch.centerId, 'product', batch.productId, batch.productNameSnapshot, batch.quantityProduced, batch.totalCost);
    for (const item of batch.ingredientUsages || []) add(batch.centerId, 'ingredient', item.ingredientId, item.nameSnapshot, -item.quantity);
  }
  for (const waste of await WasteRecord.find({ centerId: { $ne: null }, reversedAt: null })) {
    add(waste.centerId, waste.type, waste.productId || waste.ingredientId, waste.nameSnapshot, -waste.quantity);
  }

  for (const row of totals.values()) {
    const idField = row.itemType === 'ingredient' ? 'ingredientId' : 'productId';
    await BranchInventory.findOneAndUpdate(
      { centerId: row.centerId, itemType: row.itemType, [idField]: row.itemId },
      { $set: {
        itemNameSnapshot: row.itemNameSnapshot,
        quantity: Math.max(0, row.quantity),
        averageCostPerUnit: row.purchased > 0 ? row.costTotal / row.purchased : 0,
        totalPurchasedQuantity: row.purchased,
        totalPurchasedCost: row.costTotal,
      } },
      { upsert: true }
    );
  }
  console.log(`Branch inventory migrated: ${totals.size} records`);
  await mongoose.connection.close();
}

run().catch(error => { console.error(error); process.exitCode = 1; });
