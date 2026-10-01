/**
 * Localization for WebAR Virtual Try-On (Arabic + English).
 *
 * Kept inside the module so it travels with it — a host store doesn't need
 * to add keys to its own translation files to make the viewer speak.
 */

export const STRINGS = {
  ar: {
    /* Buttons */
    tryItOn: 'جرّبيها عليكِ',
    tryItOnGeneric: 'جرّب القطعة',
    viewInSpace: 'شاهد المنتج في مساحتك',
    view360: 'عرض المنتج 360°',
    viewPiece360: 'عرض القطعة 360°',
    arExperience: 'تجربة بالواقع المعزز',

    /* Permission screen */
    permissionTitle: 'إذن الكاميرا',
    permissionMessage: 'نحتاج إلى إذن استخدام الكاميرا لعرض القطعة عليكِ مباشرة. تتم معالجة الصورة داخل جهازك ولا يتم حفظ الفيديو أو رفعه إلى الخادم.',
    permissionAllow: 'السماح بالكاميرا',
    permissionCancel: 'ليس الآن',
    permissionDenied: 'تم رفض إذن الكاميرا',
    permissionDeniedHelp: 'لتفعيلها: افتح إعدادات المتصفح ← أذونات الموقع ← الكاميرا ← السماح، ثم أعد تحميل الصفحة.',
    permissionInsecure: 'الكاميرا تعمل فقط على اتصال آمن (HTTPS).',
    noCameraFound: 'لم نعثر على كاميرا في هذا الجهاز',
    cameraInUse: 'الكاميرا مستخدمة من تطبيق آخر — أغلقه وحاول مجدداً',

    /* Loading + tracking states */
    startingCamera: 'جاري تشغيل الكاميرا...',
    loadingModel: 'جاري تحميل المنتج...',
    loadingEngine: 'جاري تجهيز التجربة...',
    detectingHand: 'جاري التعرّف على اليد...',
    detectingFace: 'جاري التعرّف على الوجه...',
    detectingBody: 'جاري التعرّف على الجسم...',
    moveHandIntoFrame: 'حرّكي يدك داخل الإطار',
    moveFaceIntoFrame: 'اجعلي وجهك داخل الإطار',
    handNotFound: 'لم نتمكن من العثور على اليد',
    faceNotFound: 'لم نتمكن من العثور على الوجه',
    bodyNotFound: 'لم نتمكن من العثور على الجسم',
    moveCloser: 'اقتربي قليلًا من الكاميرا',
    moveFarther: 'ابتعدي قليلًا عن الكاميرا',
    centerYourself: 'توسّطي الإطار من فضلك',
    locked: 'تم تثبيت القطعة',

    /* Fallbacks */
    deviceUnsupported: 'هذا الجهاز لا يدعم التجربة المباشرة',
    view3DInstead: 'يمكنك مشاهدة المنتج بتقنية ثلاثية الأبعاد',
    noWebGL: 'متصفحك لا يدعم العرض ثلاثي الأبعاد',
    lowPerformance: 'جهازك في وضع الأداء المنخفض — عرضنا لك التجربة ثلاثية الأبعاد',
    noModel: 'لا يوجد نموذج ثلاثي الأبعاد لهذا المنتج',
    loadFailed: 'تعذّر تحميل التجربة',
    retry: 'إعادة المحاولة',

    /* Controls */
    close: 'إغلاق',
    switchCamera: 'تبديل الكاميرا',
    capture: 'التقاط صورة',
    resetPosition: 'إعادة الضبط',
    addToCart: 'أضف إلى الطلب',
    chooseAnother: 'اختر منتجاً آخر',
    fullscreen: 'ملء الشاشة',
    exitFullscreen: 'إنهاء ملء الشاشة',
    autoRotate: 'دوران تلقائي',
    placeInRoom: 'ضعه في مساحتك',
    savePhoto: 'حفظ الصورة',
    sharePhoto: 'مشاركة',
    discardPhoto: 'تجاهل',

    /* Selection */
    selectFinger: 'اختاري الإصبع',
    fingerThumb: 'الإبهام', fingerIndex: 'السبابة', fingerMiddle: 'الوسطى',
    fingerRing: 'البنصر', fingerPinky: 'الخنصر',
    selectHand: 'اختاري اليد',
    handLeft: 'اليسرى', handRight: 'اليمنى', handBoth: 'كلتاهما',
    sideLeft: 'يسار', sideRight: 'يمين', sideBoth: 'الاثنان',

    /* Quality */
    trackingQuality: 'جودة التتبّع',
    qualityNone: 'لا يوجد', qualityPoor: 'ضعيفة',
    qualityGood: 'جيدة', qualityStrong: 'ممتازة',

    /* Privacy */
    privacyNotice: 'تتم المعالجة داخل جهازك — لا نحفظ الفيديو ولا نرفعه',
    photoConsent: 'سيتم حفظ الصورة على جهازك فقط عند ضغطك على "حفظ".',
    dragToRotate: 'اسحب للتدوير · قرّص للتكبير',
  },

  en: {
    tryItOn: 'Try It On',
    tryItOnGeneric: 'Try It On',
    viewInSpace: 'View in Your Space',
    view360: 'View 360°',
    viewPiece360: 'View 360°',
    arExperience: 'Augmented Reality',

    permissionTitle: 'Camera permission',
    permissionMessage: 'We need camera access to show the piece on you in real time. Processing happens on your device — no video is stored or uploaded to our servers.',
    permissionAllow: 'Allow camera',
    permissionCancel: 'Not now',
    permissionDenied: 'Camera permission denied',
    permissionDeniedHelp: 'To enable: open browser settings → site permissions → camera → allow, then reload the page.',
    permissionInsecure: 'The camera only works over a secure (HTTPS) connection.',
    noCameraFound: 'No camera found on this device',
    cameraInUse: 'The camera is in use by another app — close it and try again',

    startingCamera: 'Starting camera…',
    loadingModel: 'Loading product…',
    loadingEngine: 'Preparing the experience…',
    detectingHand: 'Looking for your hand…',
    detectingFace: 'Looking for your face…',
    detectingBody: 'Looking for your body…',
    moveHandIntoFrame: 'Move your hand into the frame',
    moveFaceIntoFrame: 'Bring your face into the frame',
    handNotFound: 'We couldn’t find your hand',
    faceNotFound: 'We couldn’t find your face',
    bodyNotFound: 'We couldn’t find your body',
    moveCloser: 'Move a little closer',
    moveFarther: 'Move back a little',
    centerYourself: 'Please centre yourself in the frame',
    locked: 'Locked on',

    deviceUnsupported: 'This device doesn’t support live try-on',
    view3DInstead: 'You can still view the product in 3D',
    noWebGL: 'Your browser doesn’t support 3D rendering',
    lowPerformance: 'Your device is in low-performance mode — showing the 3D view instead',
    noModel: 'No 3D model available for this product',
    loadFailed: 'Couldn’t load the experience',
    retry: 'Try again',

    close: 'Close',
    switchCamera: 'Switch camera',
    capture: 'Take photo',
    resetPosition: 'Reset',
    addToCart: 'Add to order',
    chooseAnother: 'Choose another product',
    fullscreen: 'Full screen',
    exitFullscreen: 'Exit full screen',
    autoRotate: 'Auto rotate',
    placeInRoom: 'Place in your space',
    savePhoto: 'Save photo',
    sharePhoto: 'Share',
    discardPhoto: 'Discard',

    selectFinger: 'Choose a finger',
    fingerThumb: 'Thumb', fingerIndex: 'Index', fingerMiddle: 'Middle',
    fingerRing: 'Ring', fingerPinky: 'Pinky',
    selectHand: 'Choose a hand',
    handLeft: 'Left', handRight: 'Right', handBoth: 'Both',
    sideLeft: 'Left', sideRight: 'Right', sideBoth: 'Both',

    trackingQuality: 'Tracking quality',
    qualityNone: 'None', qualityPoor: 'Poor',
    qualityGood: 'Good', qualityStrong: 'Excellent',

    privacyNotice: 'Processed on your device — nothing is stored or uploaded',
    photoConsent: 'The photo is saved to your device only when you press “Save”.',
    dragToRotate: 'Drag to rotate · pinch to zoom',
  },
}

/** Translator bound to a locale, falling back to Arabic then the key itself. */
export function createTranslator(locale = 'ar') {
  const table = STRINGS[locale] || STRINGS.ar
  return key => table[key] ?? STRINGS.ar[key] ?? key
}

/** Map a tracking hint from landmarkMath onto a customer-facing string. */
export function hintToKey(hint, trackerKind = 'hand') {
  switch (hint) {
    case 'too-far': return 'moveCloser'
    case 'too-close': return 'moveFarther'
    case 'off-centre': return 'centerYourself'
    case 'locked': return 'locked'
    case 'not-found':
      return trackerKind === 'face' ? 'faceNotFound'
        : trackerKind === 'pose' ? 'bodyNotFound' : 'handNotFound'
    default:
      return trackerKind === 'face' ? 'detectingFace'
        : trackerKind === 'pose' ? 'detectingBody' : 'detectingHand'
  }
}
