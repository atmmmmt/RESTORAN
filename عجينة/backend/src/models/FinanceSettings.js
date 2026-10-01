'use strict';

const mongoose = require('mongoose');

const percentField = (defaultValue = 0) => ({
  type: Number,
  min: [0, 'النسبة لا يمكن أن تكون سالبة'],
  max: [100, 'النسبة لا يمكن أن تتجاوز 100%'],
  default: defaultValue,
});

const taxRuleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  percent: percentField(0),
}, { _id: false });

const branchOverrideSchema = new mongoose.Schema({
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', required: true },
  enabled: { type: Boolean, default: true },
  invoiceTax: { type: taxRuleSchema, default: () => ({ enabled: false, percent: 0 }) },
  profitTax: { type: taxRuleSchema, default: () => ({ enabled: false, percent: 0 }) },
}, { _id: false });

const financeSettingsSchema = new mongoose.Schema({
  currency: { type: String, trim: true, default: 'SYP' },
  invoiceTax: { type: taxRuleSchema, default: () => ({ enabled: false, percent: 0 }) },
  profitTax: { type: taxRuleSchema, default: () => ({ enabled: false, percent: 0 }) },
  branchOverrides: { type: [branchOverrideSchema], default: [] },
}, { timestamps: true });

financeSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

financeSettingsSchema.methods.resolveFor = function (centerId) {
  const global = {
    currency: this.currency || 'SYP',
    invoiceTax: {
      enabled: this.invoiceTax?.enabled === true,
      percent: Number(this.invoiceTax?.percent || 0),
    },
    profitTax: {
      enabled: this.profitTax?.enabled === true,
      percent: Number(this.profitTax?.percent || 0),
    },
    source: 'restaurant',
  };

  if (!centerId) return global;
  const override = (this.branchOverrides || []).find(
    row => row.enabled !== false && String(row.centerId) === String(centerId)
  );
  if (!override) return global;

  return {
    currency: global.currency,
    invoiceTax: {
      enabled: override.invoiceTax?.enabled === true,
      percent: Number(override.invoiceTax?.percent || 0),
    },
    profitTax: {
      enabled: override.profitTax?.enabled === true,
      percent: Number(override.profitTax?.percent || 0),
    },
    source: 'branch',
  };
};

financeSettingsSchema.methods.present = function () {
  return {
    currency: this.currency || 'SYP',
    invoiceTax: {
      enabled: this.invoiceTax?.enabled === true,
      percent: Number(this.invoiceTax?.percent || 0),
    },
    profitTax: {
      enabled: this.profitTax?.enabled === true,
      percent: Number(this.profitTax?.percent || 0),
    },
    branchOverrides: (this.branchOverrides || []).map(row => ({
      centerId: String(row.centerId),
      enabled: row.enabled !== false,
      invoiceTax: {
        enabled: row.invoiceTax?.enabled === true,
        percent: Number(row.invoiceTax?.percent || 0),
      },
      profitTax: {
        enabled: row.profitTax?.enabled === true,
        percent: Number(row.profitTax?.percent || 0),
      },
    })),
  };
};

module.exports = mongoose.model('FinanceSettings', financeSettingsSchema);
