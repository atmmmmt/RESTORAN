'use strict';

/**
 * Global mongoose plugin that makes every model tenant-aware.
 *
 * It does three things to every schema it is applied to:
 *   1. adds an indexed `tenant` field,
 *   2. stamps that field from the request context when a document is created,
 *   3. narrows every read, update and delete to the current tenant.
 *
 * Because it is registered with `mongoose.plugin(...)` before any model is
 * compiled, a new model or a new query gets the scoping for free — there is no
 * per-controller change to forget.
 */

const { TENANTS, currentTenant, isUnscoped } = require('./context');

/* Every query builder method that reads or writes existing rows. `insertMany`
   and `aggregate` are not query middleware and are handled separately below. */
const QUERY_HOOKS = [
  'count', 'countDocuments', 'distinct', 'estimatedDocumentCount',
  'find', 'findOne', 'findOneAndDelete', 'findOneAndReplace', 'findOneAndUpdate',
  'replaceOne', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
];

module.exports = function tenantPlugin(schema) {
  if (schema.path('tenant')) return;   // never double-apply

  schema.add({
    tenant: {
      type: String,
      enum: TENANTS,
      required: true,
      index: true,
    },
  });

  /* ── Writes: stamp the brand that is creating the row ── */
  schema.pre('validate', function stampTenant() {
    if (this.tenant) return;
    const tenant = currentTenant();
    if (tenant) this.tenant = tenant;
  });

  schema.pre('insertMany', function stampMany(next, docs) {
    const tenant = currentTenant();
    if (tenant && Array.isArray(docs)) {
      for (const doc of docs) if (doc && !doc.tenant) doc.tenant = tenant;
    }
    next();
  });

  /* ── Reads, updates, deletes: never cross the brand boundary ──
     An explicit `tenant` already in the filter wins, which is what lets a
     migration target one brand on purpose. */
  schema.pre(QUERY_HOOKS, function scopeQuery() {
    if (isUnscoped()) return;
    const tenant = currentTenant();
    if (!tenant) return;

    const filter = this.getQuery();
    if (filter.tenant === undefined) this.where({ tenant });
  });

  /* An upsert creates a row, so the new row needs the brand stamped on it too;
     the filter alone does not carry into the inserted document. */
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function stampUpsert() {
    if (isUnscoped()) return;
    const tenant = currentTenant();
    if (!tenant || !this.getOptions().upsert) return;

    const update = this.getUpdate() || {};
    if (Array.isArray(update)) return;            // aggregation-pipeline update
    update.$setOnInsert = { ...update.$setOnInsert, tenant };
    this.setUpdate(update);
  });

  /* ── Aggregations: scope before anything else runs ── */
  schema.pre('aggregate', function scopeAggregate() {
    if (isUnscoped()) return;
    const tenant = currentTenant();
    if (!tenant) return;

    const stages = this.pipeline();
    const first = stages[0];
    if (first && first.$match && first.$match.tenant !== undefined) return;
    stages.unshift({ $match: { tenant } });
  });
};
