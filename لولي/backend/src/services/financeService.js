'use strict';

const FinanceSettings = require('../models/FinanceSettings');

const money = value => Math.round((Number(value) || 0) * 100) / 100;

async function resolvedSettings(centerId = null) {
  const settings = await FinanceSettings.getSingleton();
  return settings.resolveFor(centerId);
}

async function quote(baseAmount, centerId = null) {
  const base = money(baseAmount);
  const settings = await resolvedSettings(centerId);
  const pct = settings.invoiceTax.enabled ? Number(settings.invoiceTax.percent || 0) : 0;
  const invoiceTaxAmount = money(base * pct / 100);
  return {
    baseAmount: base,
    invoiceTaxPercent: pct,
    invoiceTaxAmount,
    customerTotal: money(base + invoiceTaxAmount),
    currency: settings.currency,
    settings,
  };
}

function revenueOf(order, totalField = 'total') {
  if (order?.netAmount !== undefined && order?.netAmount !== null) return money(order.netAmount);
  const gross = Number(order?.[totalField] || 0);
  const tax = Number(order?.invoiceTaxAmount || 0);
  return money(gross - tax);
}

function invoiceTaxOf(order) {
  return money(order?.invoiceTaxAmount || 0);
}

function profitTaxEstimate(profitBeforeTax, settings) {
  const taxable = Math.max(money(profitBeforeTax), 0);
  const pct = settings?.profitTax?.enabled ? Number(settings.profitTax.percent || 0) : 0;
  return {
    percent: pct,
    taxableProfit: taxable,
    amount: money(taxable * pct / 100),
  };
}

module.exports = { money, resolvedSettings, quote, revenueOf, invoiceTaxOf, profitTaxEstimate };
