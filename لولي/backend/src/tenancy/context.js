'use strict';

/**
 * Per-request tenant context.
 *
 * Two brands share one database, so every query has to be scoped to the brand
 * that asked for it. Passing a tenant argument through every controller would
 * mean one forgotten parameter = one brand reading the other's books, so the
 * tenant rides in AsyncLocalStorage instead and the mongoose plugin reads it
 * without the calling code having to remember anything.
 */

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/** The only values a record's `tenant` may hold. */
const TENANTS = Object.freeze(['luliz', 'ajeena']);

const isTenant = value => TENANTS.includes(value);

/** Run `fn` with every query inside it scoped to `tenant`. */
function runWithTenant(tenant, fn) {
  if (!isTenant(tenant)) throw new Error(`علامة تجارية غير معروفة: ${tenant}`);
  return storage.run({ tenant, bypass: false }, fn);
}

/**
 * Run `fn` with tenant scoping switched off — migrations and maintenance
 * scripts that legitimately need to see every brand's rows at once.
 * Never call this from a request handler.
 */
function runUnscoped(fn) {
  return storage.run({ tenant: null, bypass: true }, fn);
}

const currentTenant = () => storage.getStore()?.tenant ?? null;
const isUnscoped = () => storage.getStore()?.bypass === true;

module.exports = { TENANTS, isTenant, runWithTenant, runUnscoped, currentTenant, isUnscoped };
