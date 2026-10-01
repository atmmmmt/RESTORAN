# WebAR Product Virtual Try-On

A self-contained module that lets a customer point their phone at themselves —
or at their table — and see a product before buying.

It is deliberately isolated: the host store touches **one config file** and drops
**one component** next to its add-to-cart button. Nothing inside `features/virtual-try-on/`
is store-specific.

---

## 1. Adapted to this codebase

The original brief assumed Next.js + TypeScript. This project is **Vite + React (JavaScript)**,
so the module was built to the same architecture with two deliberate deviations:

| Brief | Here | Why |
|---|---|---|
| `.tsx` / `.ts` | `.jsx` / `.js` | The project has no TypeScript toolchain. The full type contract lives in `types/virtualTryOn.types.js` as JSDoc typedefs — editors still autocomplete and type-check. |
| Next.js routing | React Router | Existing app router. No behavioural difference for this feature. |

Everything else — file layout, component names, API shape, schema fields — matches the brief.

---

## 2. Performance: the important part

**AR code is never in the initial download.** Verified against a production build:

```
EAGER (every visitor)      1,480 KB   ← AR portion: 0 KB
DEFERRED (on viewer open)  1,317 KB
  ar-three          911 KB
  ar-model-viewer   254 KB
  ar-mediapipe      151 KB
```

Three things make that true, and all three are load-bearing:

1. **Dynamic imports** — the modal, viewers, trackers and renderers are `lazy()` / `import()`.
2. **`vite.config.js` chunk names** — `ar-mediapipe`, `ar-model-viewer`, `ar-three`.
   Without these, `node_modules` falls through to `vendor`, which *is* in the entry's
   static graph, so all 1.3 MB becomes an eager download.
3. **Package-name matching, not substring matching.** `manualChunks` splits on the
   resolved package name. Substring matching silently sorted `lit-element` into `vendor`
   while `@lit/reactive-element` went to the AR chunk — one static edge from `vendor`
   to the AR chunk, and the whole payload became eager again.

> ⚠️ If you change `manualChunks`, re-check that no `ar-*` chunk appears in
> `dist/index.html`'s `modulepreload` list. That list is exactly "what every visitor pays for".

**Per-product cost when AR is off:** zero bytes and zero requests. `getPublic` inlines a
small `virtualTryOn` summary into the menu payload, so a 40-item menu makes **no** extra
requests, and `VirtualTryOnButton` returns `null` before importing anything.

---

## 3. Files

### Backend
| File | Role |
|---|---|
| `models/schemas/virtualTryOnSchema.js` | Sub-schema + `TRY_ON_TYPES`. Every field defaulted, so old products load unchanged — **no migration needed**. |
| `models/Product.js` | Embeds the sub-schema (one line). |
| `middleware/modelUpload.js` | Upload guard. Validates **magic bytes**, not the client's MIME type. |
| `routes/virtualTryOnRoutes.js` | The API. Reads public, writes admin-only, rate limited, audit logged. |
| `routes/productRoutes.js` | Mounts it at `/:productId/virtual-try-on`. |
| `controllers/productController.js` | Inlines the try-on summary into the public menu. |

### Frontend module
```
features/virtual-try-on/
  components/   VirtualTryOnButton · VirtualTryOnModal · CameraPermissionScreen
                CameraFeed · TrackingCanvas · Product3DViewer · ARSpaceViewer
                CaptureControls · TrackingStatus
  trackers/     createTracker (shared MediaPipe loader) · handTracker · faceTracker · poseTracker
  renderers/    baseRenderer · ringRenderer · braceletRenderer
                necklaceRenderer · earringsRenderer · glassesRenderer
  hooks/        useCamera · useThreeScene · useBodyTracking · useTryOnCalibration
  services/     virtualTryOnApi · analytics
  config/       storeConfig · i18n
  types/        virtualTryOn.types
  utils/        landmarkMath · smoothing · modelLoader · deviceSupport · cameraPermissions
  admin/        VirtualTryOnSection · CalibrationPreview
```

### Store integration (the only store-owned files)
| File | Change |
|---|---|
| `config/virtualTryOn.config.js` | **The one file you edit per store.** |
| `pages/customer/ProductDetailPage.jsx` | `<VirtualTryOnButton />` |
| `pages/customer/MenuPage.jsx` | `<VirtualTryOnBadge />` on cards |
| `pages/admin/ProductFormPage.jsx` | `<VirtualTryOnSection />` |
| `vite.config.js` | AR chunk splitting |

---

## 4. API

```
GET    /api/products/:productId/virtual-try-on          public
PATCH  /api/products/:productId/virtual-try-on          admin
POST   /api/products/:productId/virtual-try-on/model    admin  (?kind=ios → USDZ)
DELETE /api/products/:productId/virtual-try-on/model    admin  (?kind=ios)
POST   /api/products/:productId/virtual-try-on/preview  admin
POST   /api/products/:productId/virtual-try-on/copy-from/:sourceId
POST   /api/products/:productId/virtual-try-on/reset
```

Uploads: 15 MB GLB/glTF, 25 MB USDZ, 30 uploads / 15 min. Replaced files are deleted
from Cloudinary. Admin writes are audit-logged (`[VTO-AUDIT]`).

**Validation is by file signature.** `glTF` magic + version + declared length for GLB;
JSON parse + `asset.version` for glTF (external `.bin` references are rejected — export
as embedded GLB); zip header for USDZ.

---

## 5. Configuring a store

```js
// src/config/virtualTryOn.config.js
export const storeVirtualTryOnConfig = {
  enabled: true,
  supportedTypes: ['generic-space', 'furniture'],   // ← the important line
  primaryButtonLabel: '',        // '' = derive from product type + locale
  secondaryButtonLabel: '',
  cameraPrivacyMessage: '',      // '' = localized default
  themeMode: 'inherit',
  allowCustomerCapture: true,
  allowSharing: true,
  showAddToCartInsideViewer: true,
}
```

`supportedTypes` is a hard gate. **This store lists only space types, which is what
guarantees MediaPipe is never fetched here** — a bakery has no use for finger tracking.

### Theming
The module reads CSS custom properties and inherits automatically:
`--vto-primary`, `--vto-surface`, `--vto-radius`, falling back to the store's own
`--aj-caramel`, `--font-heading`, `--font-body`. RTL/LTR comes from `<html dir>`,
locale from `<html lang>`. Nothing is hardcoded.

---

## 6. Example configurations

### Jewellery — ring
```js
{
  enabled: true, type: 'ring', status: 'ready',
  model3DUrl: 'https://…/gold-ring.glb',
  iosModelUrl: 'https://…/gold-ring.usdz',
  scale: 1.0,
  positionOffset: { x: 0, y: 0, z: 0 },
  rotationOffset: { x: 90, y: 0, z: 0 },   // most ring models export Z-up
  minimumScale: 0.3, maximumScale: 2.0,
  targetHand: 'both',
  trackingSmoothing: 0.6,
  showShadow: true, allowManualAdjustment: true,
}
```

### Food platter — space AR (this store)
```js
{
  enabled: true, type: 'generic-space', status: 'ready',
  model3DUrl: 'https://…/mixed-platter.glb',
  iosModelUrl: 'https://…/mixed-platter.usdz',
  scale: 1.0,
  positionOffset: { x: 0, y: 0, z: 0 },
  rotationOffset: { x: 0, y: 0, z: 0 },
  placement: 'floor',      // 'floor' also covers tables
  showShadow: true,
}
```

---

## 7. Preparing models

**GLB (web + Android)**
1. Export glTF 2.0 **Binary (.glb)** — embedded, never a `.gltf` with external `.bin`.
2. Real-world scale in metres (a ring ≈ 0.02 m). The loader normalises to 1 unit and
   recentres the pivot, so `scale: 1` is a sane starting point either way.
3. Origin at the point that should sit on the body — the ring's centre, the necklace's clasp.
4. Compress: `gltf-transform optimize in.glb out.glb --compress draco --texture-size 1024`
5. Target < 3 MB. Draco and Meshopt are both decoded automatically.

**USDZ (iOS AR Quick Look)**
- `usdzconvert model.glb model.usdz`, or Reality Converter (macOS), or
  `gltf-transform` → Blender → USDZ.
- Only needed for **space AR** on iOS. Live body try-on uses the GLB on all platforms.

---

## 8. Testing

**Android (Chrome)**
1. Serve over HTTPS — `getUserMedia` and WebXR both refuse plain HTTP.
2. Space AR → "شاهد المنتج في مساحتك" should hand off to Scene Viewer.
3. Body try-on → permission screen → allow → tracking within ~2 s.
4. DevTools → Network → confirm `ar-*.js` load **only after** opening a viewer.

**iPhone (Safari)**
1. HTTPS again; Safari blocks the camera on `http://` even on localhost.
2. Space AR needs a **USDZ** — without one it correctly falls back to the 3D viewer.
3. Add to Home Screen and re-test: standalone PWA mode has its own permission state.

**Fallback chain — force each rung**
| Force | How | Expect |
|---|---|---|
| No WebGL | `chrome://flags` → disable WebGL | product image |
| Permission denied | deny at the prompt | 3D viewer + settings help |
| Low performance | DevTools → CPU 6× throttle | 3D viewer + "low performance" note |
| No model | clear `model3DUrl` | button hidden entirely |

---

## 9. Known limitations

| Area | Limitation |
|---|---|
| iOS Safari | No WebXR. Space AR goes through Quick Look and **needs a USDZ**. |
| iOS < 14.3 | No `getUserMedia` in standalone PWA mode → 3D viewer only. |
| Firefox mobile | No Scene Viewer / Quick Look → 3D viewer only. |
| In-app browsers | Instagram/Facebook/TikTok webviews often block camera → 3D viewer. |
| Necklaces | Hardest to calibrate: the anchor sits between chin and shoulders where no landmark exists. Expect per-product offset tuning. Hidden below 0.55 pose confidence rather than shown wrong. |
| Occlusion | `enableOcclusion` is stored and exposed but not yet rendered — real occlusion needs a depth/segmentation pass that costs more than it returns on mid-range phones. |
| Low-end Android | < 2 GB RAM devices are routed to the 3D viewer automatically. |
| Lighting | Very dark or backlit scenes degrade MediaPipe detection sharply. |
| Clothing | Uses torso pose landmarks — good for placement, not for true cloth simulation. |

---

## 10. Privacy

- Tracking runs **entirely in the browser**. No frame ever reaches the backend.
- The camera opens only after an explicit press on the permission screen.
- Every exit path — close, Escape, unmount, tab hidden — stops all tracks.
- Captured photos live in memory as a data URL and are written to the device **only**
  when the customer presses Save.
- Analytics records counts and durations only: never landmarks, frames or images.
