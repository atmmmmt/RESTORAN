/**
 * Store-level WebAR Virtual Try-On configuration.
 *
 * This is the ONLY file a store customises. The module under
 * src/features/virtual-try-on/ stays untouched and portable — dropping it
 * into a jewellery store means changing `supportedTypes` here, nothing more.
 */

/** @type {import('../features/virtual-try-on/types/virtualTryOn.types').VirtualTryOnStoreConfig} */
export const storeVirtualTryOnConfig = {
  enabled: true,

  /* This store sells food, so only space placement makes sense: a customer
     sees the platter or cake at true size on their own table before ordering.
     Body-tracked types are deliberately excluded — leaving them out is what
     guarantees MediaPipe is never downloaded here. */
  supportedTypes: ['generic-space', 'furniture'],

  // Empty = derive the label from the product type and locale.
  primaryButtonLabel: '',
  secondaryButtonLabel: '',
  cameraPrivacyMessage: '',

  themeMode: 'inherit',
  allowCustomerCapture: true,
  allowSharing: true,
  showAddToCartInsideViewer: true,
}

/* ────────────────────────────────────────────────────────────
   Example: jewellery store
   ────────────────────────────────────────────────────────────
   export const storeVirtualTryOnConfig = {
     enabled: true,
     supportedTypes: ['ring', 'bracelet', 'necklace', 'earrings', 'watch'],
     primaryButtonLabel: 'جرّبي القطعة عليكِ',
     secondaryButtonLabel: 'عرض القطعة 360°',
     cameraPrivacyMessage:
       'نحتاج إلى إذن استخدام الكاميرا لعرض القطعة عليكِ مباشرة. '
       + 'تتم معالجة الصورة داخل جهازك ولا يتم حفظ الفيديو أو رفعه إلى الخادم.',
     themeMode: 'inherit',
     allowCustomerCapture: true,
     allowSharing: true,
     showAddToCartInsideViewer: true,
   }

   Example: furniture store
   ────────────────────────────────────────────────────────────
   export const storeVirtualTryOnConfig = {
     enabled: true,
     supportedTypes: ['furniture', 'generic-space'],
     primaryButtonLabel: 'شاهد المنتج في مساحتك',
     secondaryButtonLabel: 'عرض المنتج 360°',
     cameraPrivacyMessage: '',
     themeMode: 'inherit',
     allowCustomerCapture: true,
     allowSharing: true,
     showAddToCartInsideViewer: false,
   }
   ──────────────────────────────────────────────────────────── */

export default storeVirtualTryOnConfig
