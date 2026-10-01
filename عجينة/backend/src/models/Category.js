'use strict';

const mongoose = require('mongoose');

/**
 * A menu section.
 *
 * Categories used to exist only as a free-text field on Product, which meant
 * there was nowhere to hang a picture, no way to reorder them, and a rename
 * was a silent split: change the spelling on one product and the storefront
 * grew a second, near-identical section. This model makes the category a
 * thing that can be edited, pictured and ordered — while Product keeps
 * storing the *name*, so nothing that reads products has to change.
 *
 * `name` is therefore the join key and must stay unique; renaming one is a
 * transaction that rewrites every product that referenced the old name (see
 * categoryRoutes).
 */
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم التصنيف مطلوب'],
      trim: true,
      unique: true,
    },

    /* Hosted on Cloudinary like product images. publicId is kept so the old
       file can be removed when the picture is replaced, instead of quietly
       accumulating orphans on the account. */
    image:         { type: String, trim: true, default: '' },
    imagePublicId: { type: String, trim: true, default: null },

    description: { type: String, trim: true, default: '' },

    /* Storefront ordering. Gaps are fine — the list is sorted, never indexed
       by position, so a drag-and-drop reorder only has to rewrite the rows
       that actually moved. */
    sortOrder: { type: Number, default: 0 },

    /* Hidden from the customer menu without deleting it or its products —
       what you want for a seasonal section. */
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

categorySchema.index({ sortOrder: 1, name: 1 });

module.exports = mongoose.model('Category', categorySchema);
