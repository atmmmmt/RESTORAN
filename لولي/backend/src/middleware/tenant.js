'use strict';

/**
 * Decides which brand a request belongs to, then runs the rest of the request
 * inside that tenant's context so every query is scoped automatically.
 *
 * Order of trust, most specific first:
 *   1. the `X-Tenant` header each storefront/dashboard build sends,
 *   2. the request's own origin, mapped through TENANT_HOSTS,
 *   3. DEFAULT_TENANT.
 *
 * The header is only trusted to pick which brand's *public* catalogue to show.
 * It grants nothing: a session token is issued per brand and `protect` looks
 * the user up inside this same scope, so claiming another brand's name simply
 * fails to find the account rather than reaching its data.
 */

const { isTenant, runWithTenant } = require('../tenancy/context');

const HEADER = 'x-tenant';

/* TENANT_HOSTS="loliz-taste.com=luliz,ajeena.example=ajeena" */
const HOST_MAP = String(process.env.TENANT_HOSTS || '')
  .split(',')
  .map(pair => pair.split('=').map(s => s.trim()))
  .filter(([host, tenant]) => host && isTenant(tenant))
  .reduce((map, [host, tenant]) => map.set(host.toLowerCase(), tenant), new Map());

/* Everything already in the database belongs to عجينة وطحينة, so an older
   client that does not send the header yet keeps seeing exactly what it saw
   before this change rather than an empty shop. */
const DEFAULT_TENANT = isTenant(process.env.DEFAULT_TENANT) ? process.env.DEFAULT_TENANT : 'ajeena';

function hostOf(req) {
  const raw = req.get('origin') || req.get('referer') || '';
  if (!raw) return '';
  try { return new URL(raw).hostname.toLowerCase(); } catch { return ''; }
}

function resolveTenant(req) {
  const claimed = String(req.get(HEADER) || '').trim().toLowerCase();
  if (isTenant(claimed)) return claimed;

  const host = hostOf(req);
  if (host && HOST_MAP.has(host)) return HOST_MAP.get(host);

  return DEFAULT_TENANT;
}

module.exports = function tenantContext(req, res, next) {
  const tenant = resolveTenant(req);
  req.tenant = tenant;
  res.set('X-Resolved-Tenant', tenant);   // makes misrouting obvious in devtools
  runWithTenant(tenant, next);
};
