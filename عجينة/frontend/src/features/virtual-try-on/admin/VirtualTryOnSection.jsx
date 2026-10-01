import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  Sparkles, Upload, Trash2, Save, RotateCcw, Copy, Loader2,
  ChevronDown, ChevronUp, Apple, Image as ImageIcon, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'

import virtualTryOnApi from '../services/virtualTryOnApi'
import { DEFAULT_TRY_ON, TRY_ON_TYPES, BODY_TRACKED_TYPES } from '../types/virtualTryOn.types'

/* The preview brings Three.js with it — keep it out of the dashboard bundle. */
const CalibrationPreview = lazy(() => import('./CalibrationPreview'))

const TYPE_OPTIONS = [
  { value: 'none',          label: 'بدون تجربة' },
  { value: 'generic-space', label: 'عرض في المساحة (عام)' },
  { value: 'furniture',     label: 'أثاث / منتج منزلي' },
  { value: 'ring',          label: 'خاتم — تتبّع الإصبع' },
  { value: 'bracelet',      label: 'إسورة — تتبّع المعصم' },
  { value: 'watch',         label: 'ساعة — تتبّع المعصم' },
  { value: 'necklace',      label: 'قلادة — تتبّع الرقبة والكتفين' },
  { value: 'earrings',      label: 'أقراط — تتبّع الأذن' },
  { value: 'glasses',       label: 'نظارة — تتبّع الوجه' },
  { value: 'clothing',      label: 'ملابس — تتبّع الجسم' },
]

const STATUS_META = {
  draft:      { label: 'مسودة',      color: '#8A7A6A', bg: 'rgba(138,122,106,0.12)' },
  processing: { label: 'قيد التجهيز', color: '#B8860B', bg: 'rgba(212,160,23,0.15)' },
  ready:      { label: 'جاهزة',      color: '#2E7A4A', bg: 'rgba(46,122,74,0.12)' },
  disabled:   { label: 'معطّلة',     color: '#C05050', bg: 'rgba(192,80,80,0.12)' },
}

const inputCls = 'w-full px-3 py-2 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm'

function Slider({ label, value, min, max, step, onChange, suffix = '' }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-bold text-brand-gray">{label}</label>
        <span className="text-xs font-black text-fuchsia tabular-nums">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-fuchsia" />
    </div>
  )
}

function Vec3Editor({ label, value, onChange, min, max, step, suffix = '' }) {
  return (
    <div>
      <div className="text-xs font-black text-brand-dark mb-2">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {['x', 'y', 'z'].map(axis => (
          <div key={axis}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-brand-gray uppercase">{axis}</label>
              <span className="text-[11px] font-black text-fuchsia tabular-nums">
                {value[axis]}{suffix}
              </span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value[axis]}
              onChange={e => onChange({ ...value, [axis]: Number(e.target.value) })}
              className="w-full accent-fuchsia" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * "Virtual Try-On / الواقع المعزز" panel for the product form.
 *
 * Everything is scoped to one product and saved through the dedicated
 * try-on endpoints, so it never interferes with the product form's own save.
 */
export default function VirtualTryOnSection({ productId, productName, allProducts = [] }) {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState(DEFAULT_TRY_ON)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(null)   // 'glb' | 'ios' | 'preview'
  const [uploadPct, setUploadPct] = useState(0)
  const [dirty, setDirty] = useState(false)

  const glbInput = useRef(null)
  const usdzInput = useRef(null)
  const previewInput = useRef(null)

  const load = useCallback(async () => {
    if (!productId) return
    setLoading(true)
    try {
      const res = await virtualTryOnApi.get(productId)
      setConfig({ ...DEFAULT_TRY_ON, ...res.data.virtualTryOn })
      setDirty(false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [productId])

  // Load lazily — an admin editing price shouldn't pay for this request.
  useEffect(() => { if (open && productId) load() }, [open, productId, load])

  const patch = updates => { setConfig(prev => ({ ...prev, ...updates })); setDirty(true) }

  const save = async () => {
    setSaving(true)
    try {
      const res = await virtualTryOnApi.update(productId, config)
      setConfig({ ...DEFAULT_TRY_ON, ...res.data.virtualTryOn })
      setDirty(false)
      toast.success(res.data.message)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const upload = async (file, kind) => {
    if (!file) return
    setUploading(kind)
    setUploadPct(0)
    try {
      const res = kind === 'preview'
        ? await virtualTryOnApi.uploadPreview(productId, file, setUploadPct)
        : await virtualTryOnApi.uploadModel(productId, file, { kind, onProgress: setUploadPct })
      setConfig({ ...DEFAULT_TRY_ON, ...res.data.virtualTryOn })
      toast.success(res.data.message)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setUploading(null)
      setUploadPct(0)
    }
  }

  const removeModel = async kind => {
    if (!confirm(kind === 'ios' ? 'حذف نموذج USDZ؟' : 'حذف النموذج ثلاثي الأبعاد؟')) return
    try {
      const res = await virtualTryOnApi.deleteModel(productId, kind)
      setConfig({ ...DEFAULT_TRY_ON, ...res.data.virtualTryOn })
      toast.success(res.data.message)
    } catch (e) { toast.error(e.message) }
  }

  const reset = async () => {
    if (!confirm('إعادة كل قيم المعايرة للافتراضي؟ الملفات المرفوعة لن تتأثر.')) return
    try {
      const res = await virtualTryOnApi.reset(productId)
      setConfig({ ...DEFAULT_TRY_ON, ...res.data.virtualTryOn })
      setDirty(false)
      toast.success(res.data.message)
    } catch (e) { toast.error(e.message) }
  }

  const copyFrom = async sourceId => {
    if (!sourceId) return
    try {
      const res = await virtualTryOnApi.copyFrom(productId, sourceId)
      setConfig({ ...DEFAULT_TRY_ON, ...res.data.virtualTryOn })
      setDirty(false)
      toast.success(res.data.message)
    } catch (e) { toast.error(e.message) }
  }

  if (!productId) {
    return (
      <div className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={17} className="text-fuchsia" />
          <h3 className="font-black text-brand-dark">التجربة الافتراضية / الواقع المعزز</h3>
        </div>
        <p className="text-xs text-brand-gray font-medium">
          احفظ المنتج أولاً، ثم يمكنك رفع النموذج ثلاثي الأبعاد ومعايرته.
        </p>
      </div>
    )
  }

  const status = STATUS_META[config.status] || STATUS_META.draft
  const isBody = BODY_TRACKED_TYPES.includes(config.type)

  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 text-right hover:bg-brand-bg/50 transition-colors">
        <div className="flex items-center gap-2">
          <Sparkles size={17} className="text-fuchsia" />
          <h3 className="font-black text-brand-dark">التجربة الافتراضية / الواقع المعزز</h3>
          <span className="text-xs px-2 py-0.5 rounded-lg font-black"
            style={{ background: status.bg, color: status.color }}>
            {status.label}
          </span>
          {config.enabled && (
            <span className="text-xs px-2 py-0.5 rounded-lg font-black bg-green-50 text-green-600">مفعّلة</span>
          )}
        </div>
        {open ? <ChevronUp size={17} className="text-brand-gray" /> : <ChevronDown size={17} className="text-brand-gray" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-brand-border pt-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 size={18} className="animate-spin text-fuchsia" />
              <span className="text-sm font-bold text-brand-gray">جاري التحميل…</span>
            </div>
          ) : (
            <>
              {/* Enable + type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-3 rounded-xl bg-brand-bg cursor-pointer">
                  <input type="checkbox" checked={config.enabled}
                    onChange={e => patch({ enabled: e.target.checked })}
                    className="w-4 h-4 accent-fuchsia" />
                  <div>
                    <div className="text-sm font-black text-brand-dark">تفعيل التجربة</div>
                    <div className="text-[11px] text-brand-gray font-medium">يظهر الزر للعملاء عند الجاهزية</div>
                  </div>
                </label>

                <div>
                  <label className="text-xs font-bold text-brand-gray mb-1 block">نوع التجربة</label>
                  <select value={config.type} onChange={e => patch({ type: e.target.value })}
                    className={`${inputCls} bg-white`}>
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Assets */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { kind: 'glb', label: 'نموذج GLB / glTF', hint: 'مطلوب · حتى 15 ميغا', ref: glbInput,
                    accept: '.glb,.gltf', url: config.model3DUrl, Icon: Upload },
                  { kind: 'ios', label: 'نموذج USDZ', hint: 'اختياري · لأجهزة Apple', ref: usdzInput,
                    accept: '.usdz', url: config.iosModelUrl, Icon: Apple },
                  { kind: 'preview', label: 'صورة معاينة', hint: 'بديل احتياطي', ref: previewInput,
                    accept: 'image/*', url: config.previewImageUrl, Icon: ImageIcon },
                ].map(({ kind, label, hint, ref, accept, url, Icon }) => (
                  <div key={kind} className="rounded-xl border-2 border-dashed border-brand-border p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={13} className="text-fuchsia" />
                      <span className="text-xs font-black text-brand-dark">{label}</span>
                    </div>
                    <div className="text-[11px] text-brand-gray-light font-medium mb-2">{hint}</div>

                    {url ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[11px] font-black text-green-600">
                          <CheckCircle2 size={12} /> مرفوع
                        </span>
                        {kind !== 'preview' && (
                          <button type="button" onClick={() => removeModel(kind)}
                            className="text-[11px] text-red-500 font-bold hover:text-red-600">
                            <Trash2 size={12} className="inline" /> حذف
                          </button>
                        )}
                        <button type="button" onClick={() => ref.current?.click()}
                          className="text-[11px] text-fuchsia font-bold hover:underline mr-auto">استبدال</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => ref.current?.click()}
                        disabled={uploading === kind}
                        className="w-full py-2 rounded-lg text-xs font-bold bg-fuchsia-bg text-fuchsia hover:bg-fuchsia-light transition-colors disabled:opacity-50">
                        {uploading === kind ? `${uploadPct}%` : 'اختر ملفاً'}
                      </button>
                    )}

                    {uploading === kind && (
                      <div className="mt-2 h-1 rounded-full bg-brand-border overflow-hidden">
                        <div className="h-full bg-fuchsia transition-all" style={{ width: `${uploadPct}%` }} />
                      </div>
                    )}

                    <input ref={ref} type="file" accept={accept} className="hidden"
                      onChange={e => { upload(e.target.files?.[0], kind); e.target.value = '' }} />
                  </div>
                ))}
              </div>

              {!config.model3DUrl && (
                <div className="flex items-start gap-2 rounded-xl p-3 bg-amber-50 border border-amber-200">
                  <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <span className="text-xs font-bold text-amber-800">
                    ارفع نموذج GLB لتتمكّن من المعايرة وتفعيل التجربة للعملاء.
                  </span>
                </div>
              )}

              {/* Live calibration */}
              {config.model3DUrl && (
                <Suspense fallback={
                  <div className="h-24 flex items-center justify-center gap-2 rounded-2xl bg-brand-bg">
                    <Loader2 size={16} className="animate-spin text-fuchsia" />
                    <span className="text-xs font-bold text-brand-gray">جاري تجهيز المعاينة…</span>
                  </div>
                }>
                  <CalibrationPreview
                    modelUrl={config.model3DUrl}
                    calibration={config}
                    onChange={patch}
                  />
                </Suspense>
              )}

              {/* Numeric controls */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-4">
                  <Slider label="الحجم" value={config.scale} min={0.05} max={5} step={0.01}
                    onChange={v => patch({ scale: v })} />
                  <Vec3Editor label="إزاحة الموضع" value={config.positionOffset}
                    onChange={v => patch({ positionOffset: v })} min={-2} max={2} step={0.01} />
                  <Vec3Editor label="إزاحة الدوران (درجة)" value={config.rotationOffset}
                    onChange={v => patch({ rotationOffset: v })} min={-180} max={180} step={1} suffix="°" />
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Slider label="أدنى حجم" value={config.minimumScale} min={0.01} max={2} step={0.01}
                      onChange={v => patch({ minimumScale: v })} />
                    <Slider label="أقصى حجم" value={config.maximumScale} min={0.1} max={10} step={0.1}
                      onChange={v => patch({ maximumScale: v })} />
                  </div>

                  {isBody && (
                    <>
                      <Slider label="نعومة الحركة" value={config.trackingSmoothing} min={0} max={0.95} step={0.05}
                        onChange={v => patch({ trackingSmoothing: v })} />

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-brand-gray mb-1 block">اليد المستهدفة</label>
                          <select value={config.targetHand} onChange={e => patch({ targetHand: e.target.value })}
                            className={`${inputCls} bg-white`}>
                            <option value="both">كلتاهما</option>
                            <option value="left">اليسرى</option>
                            <option value="right">اليمنى</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-brand-gray mb-1 block">الجهة (أقراط)</label>
                          <select value={config.targetSide} onChange={e => patch({ targetSide: e.target.value })}
                            className={`${inputCls} bg-white`}>
                            <option value="both">الاثنان</option>
                            <option value="left">يسار</option>
                            <option value="right">يمين</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  {!isBody && (
                    <div>
                      <label className="text-xs font-bold text-brand-gray mb-1 block">مكان الوضع</label>
                      <select value={config.placement} onChange={e => patch({ placement: e.target.value })}
                        className={`${inputCls} bg-white`}>
                        <option value="floor">على الأرض / الطاولة</option>
                        <option value="wall">على الحائط</option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-2">
                    {[
                      ['showShadow', 'إظهار الظل'],
                      ['enableOcclusion', 'الإخفاء خلف الأجسام (Occlusion)'],
                      ['allowManualAdjustment', 'السماح للعميل بالتعديل يدوياً'],
                    ].map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={config[key]}
                          onChange={e => patch({ [key]: e.target.checked })}
                          className="w-4 h-4 accent-fuchsia" />
                        <span className="text-xs font-bold text-brand-dark">{label}</span>
                      </label>
                    ))}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-brand-gray mb-1 block">الحالة</label>
                    <select value={config.status} onChange={e => patch({ status: e.target.value })}
                      className={`${inputCls} bg-white`}>
                      <option value="draft">مسودة</option>
                      <option value="processing">قيد التجهيز</option>
                      <option value="ready" disabled={!config.model3DUrl}>جاهزة (تظهر للعملاء)</option>
                      <option value="disabled">معطّلة</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-brand-border">
                <button type="button" onClick={save} disabled={saving || !dirty}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black bg-fuchsia text-white hover:bg-fuchsia-dark transition-colors disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  حفظ المعايرة
                </button>

                <button type="button" onClick={reset}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-brand-bg text-brand-gray hover:bg-brand-offwhite transition-colors">
                  <RotateCcw size={14} /> إعادة الضبط
                </button>

                {allProducts.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Copy size={14} className="text-brand-gray" />
                    <select defaultValue="" onChange={e => { copyFrom(e.target.value); e.target.value = '' }}
                      className="px-3 py-2 border-2 border-brand-border rounded-xl text-xs font-bold bg-white focus:border-fuchsia focus:outline-none">
                      <option value="">نسخ الإعدادات من منتج…</option>
                      {allProducts.filter(p => p._id !== productId).map(p => (
                        <option key={p._id} value={p._id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {dirty && (
                  <span className="text-[11px] font-bold text-amber-600 mr-auto">تغييرات غير محفوظة</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
