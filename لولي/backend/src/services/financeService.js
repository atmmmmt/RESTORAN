'use strict';

const FinanceSettings = require('../models/FinanceSettings');

const money = value => Math.round((Number(value) || 0) * 100) / 100;

async function resolvedSettings(centerId = null) {
  const settings = await FinanceSettings.getSingleton();
  return settings.resolveFor(centerId);
}

const CONSUMPTION_TAX_PERCENT = 5;
const LOCAL_ADMIN_PERCENT = 5;

async function quote(baseAmount, centerId = null) {
  const base = money(baseAmount);
  const settings = await resolvedSettings(centerId);
  const consumptionTaxAmount = money(base * CONSUMPTION_TAX_PERCENT / 100);
  const localAdminAmount = money(consumptionTaxAmount * LOCAL_ADMIN_PERCENT / 100);
  const invoiceTaxAmount = money(consumptionTaxAmount + localAdminAmount);
  return {
    baseAmount: base,
    consumptionTaxPercent: CONSUMPTION_TAX_PERCENT,
    consumptionTaxAmount,
    localAdminPercent: LOCAL_ADMIN_PERCENT,
    localAdminAmount,
    invoiceTaxPercent: money(invoiceTaxAmount && base ? invoiceTaxAmount / base * 100 : 0),
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
  if (order?.invoiceTaxAmount !== undefined && order?.invoiceTaxAmount !== null) return money(order.invoiceTaxAmount);
  return money((Number(order?.consumptionTaxAmount) || 0) + (Number(order?.localAdminAmount) || 0));
}

function consumptionTaxOf(order) {
  return money(order?.consumptionTaxAmount || 0);
}

function localAdminTaxOf(order) {
  return money(order?.localAdminAmount || 0);
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

module.exports = {
  money, resolvedSettings, quote, revenueOf, invoiceTaxOf,
  consumptionTaxOf, localAdminTaxOf, profitTaxEstimate,
  CONSUMPTION_TAX_PERCENT, LOCAL_ADMIN_PERCENT,
};
