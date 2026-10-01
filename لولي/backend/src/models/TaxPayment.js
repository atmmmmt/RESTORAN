'use strict';

const mongoose = require('mongoose');

const taxPaymentSchema = new mongoose.Schema({
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null, index: true },
  type: { type: String, enum: ['invoice_tax', 'profit_tax'], required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  paidAt: { type: Date, default: Date.now, index: true },
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  reference: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdByName: { type: String, trim: true, default: '' },
  cashTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashTransaction', default: null },
}, { timestamps: true });

taxPaymentSchema.pre('save', async function (next) {
  try {
    if (!this.isNew || this.cashTransactionId) return next();
    const CashTransaction = require('./CashTransaction');
    const label = this.type === 'invoice_tax' ? 'نسبة الفاتورة' : 'ضريبة الأرباح';
    const transaction = await CashTransaction.create({
      centerId: this.centerId || null,
      type: 'tax_payment',
      amount: this.amount,
      direction: 'out',
      description: `تسديد للمالية — ${label}${this.reference ? ` — ${this.reference}` : ''}`,
      referenceType: 'TaxPayment',
      referenceId: this._id,
      transactionDate: this.paidAt || new Date(),
    });
    this.cashTransactionId = transaction._id;
    return next();
  } catch (err) {
    return next(err);
  }
});

taxPaymentSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  try {
    if (!this.cashTransactionId) return next();
    const CashTransaction = require('./CashTransaction');
    const label = this.type === 'invoice_tax' ? 'نسبة الفاتورة' : 'ضريبة الأرباح';
    await CashTransaction.create({
      centerId: this.centerId || null,
      type: 'adjustment',
      amount: this.amount,
      direction: 'in',
      description: `عكس تسديد للمالية — ${label}`,
      referenceType: 'TaxPayment',
      referenceId: this._id,
      transactionDate: new Date(),
    });
    return next();
  } catch (err) {
    return next(err);
  }
});

taxPaymentSchema.index({ centerId: 1, type: 1, paidAt: -1 });

module.exports = mongoose.model('TaxPayment', taxPaymentSchema);
