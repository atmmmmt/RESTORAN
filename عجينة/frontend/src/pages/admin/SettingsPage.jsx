import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  ChefHat, Image, BarChart3, Store, Smartphone,
  Lock, Globe, UtensilsCrossed, Save, Upload, AlertCircle, Percent, Clock,
} from 'lucide-react'
import { settingsAPI, siteSettingsAPI, uploadAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'
import ThermalPrinterSettings from '../../components/common/ThermalPrinterSettings'

export default function SettingsPage() {
  const { user } = useAuth()
  const fileRef = useRef(null)

  /* ── Password form ── */
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)

  /* ── Site settings ── */
  const [site, setSite]               = useState({ heroImage: '', waNumber: '', instagramUrl: '', comingSoonEnabled: false })
  const [togglingCS, setTogglingCS]   = useState(false)
  const siteRef                       = useRef({ heroImage: '', waNumber: '', instagramUrl: '' })
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteSaving, setSiteSaving]   = useState(false)
  const [uploading, setUploading]     = useState(false)

  /* ── Partner's cut ──
     A flat share of the takings, printed on every receipt and on the
     end-of-day report. Kept here so the owner can change it without
     anyone touching the code. */
  const [investor, setInvestor] = useState({
    enabled: true, name: 'الأميركان', takeawayPercent: 10, dineInPercent: 15, percent: 15,
  })
  const [invLoading, setInvLoading] = useState(true)
  const [invSaving, setInvSaving]   = useState(false)

  useEffect(() => {
    settingsAPI.getInvestor()
      .then(r => setInvestor(r.data.investor))
      .catch(() => {})
      .finally(() => setInvLoading(false))
  }, [])

  const RATE_FIELDS = [
    ['takeawayPercent', 'سفري %'],
    ['dineInPercent',   'بالمحل %'],
    ['percent',         'توصيل وطلبات الموقع %'],
  ]

  const saveInvestor = async () => {
    const rates = {}
    for (const [key] of RATE_FIELDS) {
      const pct = Number(investor[key])
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return toast.error('النسبة يجب أن تكون بين 0 و 100')
      rates[key] = pct
    }
    setInvSaving(true)
    try {
      const r = await settingsAPI.updateInvestor({ enabled: investor.enabled, name: investor.name, ...rates })
      setInvestor(r.data.investor)
      toast.success(r.data.message)
    } catch (e) { toast.error(e.message || 'فشل الحفظ') }
    finally { setInvSaving(false) }
  }

  /* ── Opening hours ──
     The working day runs from opening to closing even past midnight, so the
     day's log, order numbers and end-of-day report don't split at 12:00. */
  const [hours, setHours] = useState({ openingTime: '10:00', closingTime: '04:00' })
  const [hoursLoading, setHoursLoading] = useState(true)
  const [hoursSaving, setHoursSaving]   = useState(false)

  useEffect(() => {
    settingsAPI.getBusinessHours()
      .then(r => setHours(r.data.hours))
      .catch(() => {})
      .finally(() => setHoursLoading(false))
  }, [])

  const saveHours = async () => {
    if (!hours.openingTime || !hours.closingTime) return toast.error('حدّد ساعة الفتح والإغلاق')
    setHoursSaving(true)
    try {
      const r = await settingsAPI.updateBusinessHours({ openingTime: hours.openingTime, closingTime: hours.closingTime })
      setHours(r.data.hours)
      toast.success(r.data.message)
    } catch (e) { toast.error(e.message || 'فشل الحفظ') }
    finally { setHoursSaving(false) }
  }

  const shopClock = iso => iso
    ? new Date(iso).toLocaleString('ar-EG', { timeZone: 'Asia/Damascus', weekday: 'long', hour: '2-digit', minute: '2-digit' })
    : '—'

  /* ── Instagram connection — the token lives on the server only ── */
  const [ig, setIg]           = useState(null)
  const [igToken, setIgToken] = useState('')
  const [igBusy, setIgBusy]   = useState(false)

  const loadIg = () => siteSettingsAPI.instagramStatus().then(r => setIg(r.data)).catch(() => {})
  useEffect(() => { loadIg() }, [])

  const connectInstagram = async () => {
    if (!igToken.trim()) return toast.error('الصق مفتاح الوصول أولاً')
    setIgBusy(true)
    try {
      const r = await siteSettingsAPI.connectInstagram(igToken.trim())
      toast.success(r.data.message)
      setIgToken('')
      loadIg()
    } catch (e) { toast.error(e.message || 'تعذّر ربط الحساب') }
    finally { setIgBusy(false) }
  }

  const disconnectInstagram = async () => {
    if (!confirm('فصل حساب الانستغرام؟ ستختفي المنشورات من الموقع.')) return
    setIgBusy(true)
    try { await siteSettingsAPI.disconnectInstagram(); toast.success('تم فصل الحساب'); loadIg() }
    catch (e) { toast.error(e.message || 'تعذّر الفصل') }
    finally { setIgBusy(false) }
  }

  // Keep ref in sync with state
  useEffect(() => { siteRef.current = site }, [site])

  useEffect(() => {
    siteSettingsAPI.get()
      .then(r => setSite(r.data.settings || {}))
      .finally(() => setSiteLoading(false))
  }, [])

  /* ── Handlers ── */
  const changePassword = async () => {
    if (!pwForm.currentPassword || !pwForm.newPassword) return toast.error('جميع الحقول مطلوبة')
    if (pwForm.newPassword !== pwForm.confirmPassword)  return toast.error('كلمتا السر غير متطابقتين')
    if (pwForm.newPassword.length < 6)                  return toast.error('كلمة السر يجب أن تكون 6 أحرف على الأقل')
    setSaving(true)
    try {
      await settingsAPI.updatePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
      toast.success('تم تغيير كلمة السر بنجاح')
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (e) { toast.error(e.message || 'كلمة السر الحالية غير صحيحة') }
    finally { setSaving(false) }
  }

  const handleHeroUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const r = await uploadAPI.upload(file)
      setSite(s => ({ ...s, heroImage: r.data.url }))
      toast.success('تم رفع الصورة — لا تنسي الحفظ!')
    } catch { toast.error('فشل رفع الصورة') }
    finally { setUploading(false); e.target.value = '' }
  }

  const saveSiteSettings = async () => {
    setSiteSaving(true)
    const current = siteRef.current          // always fresh value
    console.log('Saving:', current.heroImage?.slice(0, 60))
    try {
      await siteSettingsAPI.update({
        heroImage:    current.heroImage,
        waNumber:     current.waNumber,
        instagramUrl: current.instagramUrl,
        /* One link per line; the server extracts the codes and keeps order. */
        ...(current.instagramPostsText !== undefined
          ? { instagramPosts: current.instagramPostsText.split(/\s+/).filter(Boolean) }
          : {}),
      })
      toast.success('تم حفظ إعدادات الموقع')
    } catch { toast.error('فشل الحفظ') }
    finally { setSiteSaving(false) }
  }

  const toggleComingSoon = async () => {
    const next = !site.comingSoonEnabled
    setTogglingCS(true)
    try {
      await siteSettingsAPI.update({ comingSoonEnabled: next })
      setSite(s => ({ ...s, comingSoonEnabled: next }))
      toast.success(next ? 'وضع قريباً مفعّل — الموقع مخفي' : 'الموقع مرئي للزوار')
    } catch { toast.error('فشل التحديث') }
    finally { setTogglingCS(false) }
  }

  const set = (k, v) => setPwForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <PageHeader title="الإعدادات" subtitle="إعدادات الحساب والموقع" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Profile info ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-card p-6">
          <h2 className="font-black text-brand-dark mb-5 flex items-center gap-2">
            <ChefHat size={18} className="text-fuchsia" /> معلومات الحساب
          </h2>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-light to-fuchsia flex items-center justify-center">
              <ChefHat size={28} className="text-white" />
            </div>
            <div>
              <div className="font-black text-brand-dark text-lg">{user?.name || 'مدير عجينة وطحينة'}</div>
              <div className="text-brand-gray font-bold">{user?.email}</div>
              <div className="text-xs text-fuchsia font-bold mt-1 flex items-center gap-1">
                <UtensilsCrossed size={11} /> مدير المطعم
              </div>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            {[
              { label: 'البريد الإلكتروني', val: user?.email },
              { label: 'رقم الهاتف', val: user?.phone || '—' },
              { label: 'الدور', val: 'مدير النظام' },
            ].map(row => (
              <div key={row.label} className="flex justify-between py-2 border-b border-brand-border">
                <span className="text-brand-gray font-bold">{row.label}</span>
                <span className="font-black text-brand-dark">{row.val}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Change password ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-card p-6">
          <h2 className="font-black text-brand-dark mb-5 flex items-center gap-2">
            <Lock size={18} className="text-fuchsia" /> تغيير كلمة السر
          </h2>
          <div className="space-y-4">
            {[
              { label: 'كلمة السر الحالية',  key: 'currentPassword' },
              { label: 'كلمة السر الجديدة',  key: 'newPassword' },
              { label: 'تأكيد كلمة السر',    key: 'confirmPassword' },
            ].map(field => (
              <div key={field.key}>
                <label className="text-sm font-bold text-brand-dark mb-1.5 block">{field.label}</label>
                <input type="password" value={pwForm[field.key]} onChange={e => set(field.key, e.target.value)}
                  className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold"
                  placeholder="••••••" />
              </div>
            ))}
            <Button onClick={changePassword} loading={saving} className="w-full">تغيير كلمة السر</Button>
          </div>
        </motion.div>

        {/* ── Site settings — hero image ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl shadow-card p-6 lg:col-span-2">
          <h2 className="font-black text-brand-dark mb-1 flex items-center gap-2">
            <Image size={18} className="text-fuchsia" /> إعدادات الموقع
          </h2>
          <p className="text-brand-gray text-sm font-medium mb-6">
            الصورة التي تظهر في الهيرو على الصفحة الرئيسية — يمكنك تغييرها في أي وقت
          </p>

          {siteLoading ? (
            <div className="h-48 rounded-2xl bg-brand-bg animate-pulse" />
          ) : (
            <div className="grid lg:grid-cols-2 gap-6 items-start">

              {/* Preview */}
              <div>
                <div className="text-xs font-bold text-brand-gray mb-2">معاينة الصورة الحالية</div>
                <div
                  className="relative rounded-2xl overflow-hidden border-2 border-dashed border-brand-border bg-brand-bg flex items-center justify-center"
                  style={{ minHeight: 200 }}>
                  {site.heroImage ? (
                    <img
                      src={site.heroImage}
                      alt="Hero"
                      className="w-full h-52 object-contain p-4"
                    />
                  ) : (
                    <div className="text-center py-10">
                      <Image size={40} className="mx-auto mb-3 text-brand-gray-light" />
                      <div className="text-brand-gray-light text-sm font-bold">لا توجد صورة</div>
                      <div className="text-xs text-brand-gray-light mt-1">ارفع صورة لتظهر هنا</div>
                    </div>
                  )}
                </div>

                {site.heroImage && (
                  <button
                    onClick={() => setSite(s => ({ ...s, heroImage: '' }))}
                    className="mt-2 text-xs text-red-400 hover:text-red-600 font-bold transition-colors">
                    × حذف الصورة (سيظهر اللوغو الافتراضي)
                  </button>
                )}
              </div>

              {/* Upload + WA number */}
              <div className="space-y-5">
                {/* Upload area */}
                <div>
                  <div className="text-xs font-bold text-brand-dark mb-3">رفع صورة جديدة</div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleHeroUpload}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className={`w-full rounded-2xl border-2 border-dashed py-8 flex flex-col items-center gap-2 transition-all font-bold text-sm
                      ${uploading
                        ? 'border-fuchsia/40 bg-fuchsia/5 text-fuchsia cursor-wait'
                        : 'border-brand-border hover:border-fuchsia hover:bg-fuchsia/5 text-brand-gray hover:text-fuchsia cursor-pointer'
                      }`}>
                    {uploading ? (
                      <>
                        <div className="w-8 h-8 border-3 border-fuchsia border-t-transparent rounded-full animate-spin" />
                        جاري الرفع...
                      </>
                    ) : (
                      <>
                        <Upload size={28} className="text-brand-gray" />
                        اضغط لاختيار صورة
                        <span className="text-xs text-brand-gray-light font-medium">PNG, JPG, WebP — حتى 5 ميغا</span>
                      </>
                    )}
                  </button>
                </div>

                {/* WhatsApp number */}
                <div>
                  <label className="text-xs font-bold text-brand-dark mb-2 block">
                    رقم واتساب <Smartphone size={12} className="inline" />
                    <span className="text-brand-gray-light font-medium mr-1">(بدون + مثال: 963991234567)</span>
                  </label>
                  <input
                    type="text"
                    value={site.waNumber || ''}
                    onChange={e => setSite(s => ({ ...s, waNumber: e.target.value }))}
                    placeholder="963991234567"
                    dir="ltr"
                    className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm"
                  />
                </div>

                {/* Save */}
                <Button
                  onClick={saveSiteSettings}
                  loading={siteSaving}
                  className="w-full">
                  <Save size={15} className="inline ml-1" /> حفظ إعدادات الموقع
                </Button>
              </div>
            </div>
          )}
        </motion.div>

        {/* ── Instagram settings ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          className="bg-white rounded-2xl shadow-card p-6 lg:col-span-2">
          <h2 className="font-black text-brand-dark mb-1 flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] text-fuchsia" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
            </svg> إعدادات الانستغرام
          </h2>
          <p className="text-brand-gray text-sm font-medium mb-5">
            رابط صفحتك، وربط الحساب لعرض آخر المنشورات مباشرة من انستغرام — بدون أي خدمة وسيطة
          </p>
          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-bold text-brand-dark mb-2 block">
                رابط صفحة الانستغرام
              </label>
              <input
                type="url"
                value={site.instagramUrl || ''}
                onChange={e => setSite(s => ({ ...s, instagramUrl: e.target.value }))}
                placeholder="https://www.instagram.com/3ajineh.w.t7ineh/"
                dir="ltr"
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm"
              />
              <p className="text-xs text-brand-gray-light mt-1 font-medium">
                الرابط الكامل لصفحتك على الانستغرام
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-brand-dark mb-2 block">
                ربط الحساب لعرض آخر المنشورات
              </label>
              {ig?.connected ? (
                <div className="rounded-xl p-4 bg-green-50 border border-green-200 space-y-1.5">
                  <div className="text-sm font-black text-green-700">
                    ✓ متصل بحساب <span dir="ltr">@{ig.username}</span>
                  </div>
                  <div className="text-xs font-medium text-green-700">
                    {ig.postCount} منشور معروض على الموقع
                    {ig.fetchedAt ? ` — آخر تحديث ${new Date(ig.fetchedAt).toLocaleString('ar-EG')}` : ''}
                  </div>
                  {ig.expiresAt && (
                    <div className="text-xs font-medium text-green-700">
                      المفتاح يتجدد تلقائياً — صالح حتى {new Date(ig.expiresAt).toLocaleDateString('ar-EG')}
                    </div>
                  )}
                  {ig.error && <div className="text-xs font-bold text-red-600">آخر خطأ: {ig.error}</div>}
                  <button onClick={disconnectInstagram} disabled={igBusy}
                    className="text-xs font-bold text-red-600 hover:underline pt-1">فصل الحساب</button>
                </div>
              ) : (
                <>
                  <textarea value={igToken} onChange={e => setIgToken(e.target.value)} rows={3} dir="ltr"
                    placeholder="IGAA…"
                    className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-mono text-xs" />
                  <Button onClick={connectInstagram} loading={igBusy} className="mt-2 w-full">ربط الحساب</Button>
                  <details className="mt-3 text-xs text-brand-gray font-medium leading-relaxed">
                    <summary className="cursor-pointer font-bold text-fuchsia">كيف أحصل على المفتاح؟ (مرة واحدة)</summary>
                    <ol className="list-decimal pr-5 mt-2 space-y-1">
                      <li>حوّل الحساب إلى حساب احترافي (Business أو Creator) من إعدادات تطبيق انستغرام — مجاناً.</li>
                      <li>ادخل <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-fuchsia underline">developers.facebook.com/apps</a> وأنشئ تطبيقاً من نوع Business.</li>
                      <li>أضف منتج «Instagram» واختر «API setup with Instagram login».</li>
                      <li>في «Generate access tokens» اربط حساب <span dir="ltr">@3ajineh.w.t7ineh</span> ثم اضغط «Generate token».</li>
                      <li>انسخ المفتاح، الصقه هنا، واضغط «ربط الحساب».</li>
                    </ol>
                    <p className="mt-2">المفتاح يُحفظ على السيرفر فقط ولا يظهر في الموقع، ويتجدد تلقائياً قبل انتهائه.</p>
                  </details>
                </>
              )}
            </div>
          </div>
          <div className="mt-5">
            <label className="text-xs font-bold text-brand-dark mb-2 block">
              المنشورات المعروضة على الموقع
            </label>
            <textarea
              rows={6}
              dir="ltr"
              value={site.instagramPostsText ?? (site.instagramPosts || []).map(x => `https://www.instagram.com/${x.kind}/${x.code}/`).join('\n')}
              onChange={e => setSite(v => ({ ...v, instagramPostsText: e.target.value }))}
              placeholder="https://www.instagram.com/reel/XXXXXXXXXXX/"
              className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-mono text-xs"
            />
            <p className="text-xs text-brand-gray-light mt-1 font-medium leading-relaxed">
              رابط منشور في كل سطر — الترتيب هو ترتيب العرض (ضع المثبّتة أولاً)، ويظهر أول 6 منها.
              لإضافة منشور جديد: افتح المنشور على انستغرام ← «نسخ الرابط» ← الصقه هنا ← احفظ.
              لا يحتاج أي ربط أو مفتاح.
            </p>
          </div>
          <div className="mt-5">
            <Button onClick={saveSiteSettings} loading={siteSaving} className="w-full lg:w-auto px-8">
              <Save size={15} className="inline ml-1" /> حفظ إعدادات الانستغرام
            </Button>
          </div>
        </motion.div>

        {/* ── Coming Soon toggle ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }}
          className="bg-white rounded-2xl shadow-card p-6 lg:col-span-2">
          <h2 className="font-black text-brand-dark mb-1 flex items-center gap-2">
            <Lock size={18} className="text-fuchsia" /> وضع "قريباً"
          </h2>
          <p className="text-brand-gray text-sm font-medium mb-5">
            عند التفعيل يُخفى الموقع عن الزوار ويُعرض لهم فقط صفحة "انتظرونا قريباً"
          </p>
          <div className={`flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${
            site.comingSoonEnabled
              ? 'bg-amber-50 border-amber-300'
              : 'bg-green-50 border-green-200'
          }`}>
            <div>
              <div className={`font-black text-lg ${site.comingSoonEnabled ? 'text-amber-800' : 'text-green-700'}`}>
                {site.comingSoonEnabled
                ? <><Lock size={16} className="inline ml-1" />الموقع مخفي — وضع قريباً</>
                : <><Globe size={16} className="inline ml-1" />الموقع مرئي للزوار</>
              }
              </div>
              <div className={`text-sm font-bold mt-0.5 ${site.comingSoonEnabled ? 'text-amber-600' : 'text-green-600'}`}>
                {site.comingSoonEnabled
                  ? 'الزوار يرون صفحة "انتظرونا قريباً" فقط'
                  : 'الموقع يعمل بشكل طبيعي'}
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={toggleComingSoon}
              disabled={togglingCS || siteLoading}
              className={`px-6 py-3 rounded-2xl font-black text-white text-sm shadow-md transition-all disabled:opacity-50 ${
                site.comingSoonEnabled
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-amber-500 hover:bg-amber-600'
              }`}>
              {togglingCS ? '...' : site.comingSoonEnabled ? 'تفعيل الموقع' : 'إخفاء الموقع'}
            </motion.button>
          </div>
        </motion.div>

        {/* ── Partner's percentage ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }}
          className="bg-white rounded-2xl shadow-card p-6 lg:col-span-2">
          <h2 className="font-black text-brand-dark mb-1 flex items-center gap-2">
            <Percent size={18} className="text-fuchsia" /> نسبة الشريك (صاحب المحل)
          </h2>
          <p className="text-brand-gray text-sm font-medium mb-5">
            نسبة من مبيعات كل طلب حسب نوعه — تُحسب على تقرير طلبات اليوم وتقرير الوردية
          </p>

          {invLoading ? (
            <div className="h-20 rounded-2xl bg-brand-bg animate-pulse" />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="text-xs font-bold text-brand-dark mb-2 block">اسم الشريك</label>
                <input value={investor.name || ''}
                  onChange={e => setInvestor(i => ({ ...i, name: e.target.value }))}
                  placeholder="الأميركان"
                  className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm" />
              </div>
              {RATE_FIELDS.map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs font-bold text-brand-dark mb-2 block">{label}</label>
                  <input type="number" min="0" max="100" step="0.5" value={investor[key] ?? 0}
                    onChange={e => setInvestor(i => ({ ...i, [key]: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-black text-sm" />
                </div>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={() => setInvestor(i => ({ ...i, enabled: !i.enabled }))}
                  className={`flex-1 py-3 rounded-xl font-black text-sm transition-colors ${
                    investor.enabled ? 'bg-green-500 text-white' : 'bg-brand-bg text-brand-gray'
                  }`}>
                  {investor.enabled ? 'مفعّلة' : 'موقوفة'}
                </button>
                <Button onClick={saveInvestor} loading={invSaving} icon={<Save size={15} />}>حفظ</Button>
              </div>
            </div>
          )}
        </motion.div>

        {/* ── Opening hours ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.195 }}
          className="bg-white rounded-2xl shadow-card p-6 lg:col-span-2">
          <h2 className="font-black text-brand-dark mb-1 flex items-center gap-2">
            <Clock size={18} className="text-fuchsia" /> ساعات العمل
          </h2>
          <p className="text-brand-gray text-sm font-medium mb-5">
            اليوم يبدأ مع الفتح ويستمر حتى الإغلاق حتى لو بعد منتصف الليل — طلبات الساعة 2 بالليل تُحسب على نفس اليوم،
            وأرقام الطلبات وسجل اليوم وتقرير نهاية اليوم كلها تمشي على هالساعات
          </p>

          {hoursLoading ? (
            <div className="h-20 rounded-2xl bg-brand-bg animate-pulse" />
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="text-xs font-bold text-brand-dark mb-2 block">ساعة الفتح</label>
                  <input type="time" value={hours.openingTime || ''}
                    onChange={e => setHours(h => ({ ...h, openingTime: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-black text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-brand-dark mb-2 block">ساعة الإغلاق</label>
                  <input type="time" value={hours.closingTime || ''}
                    onChange={e => setHours(h => ({ ...h, closingTime: e.target.value }))}
                    className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-black text-sm" />
                </div>
                <Button onClick={saveHours} loading={hoursSaving} icon={<Save size={15} />}>حفظ</Button>
              </div>
              {hours.currentDay && (
                <div className="mt-4 text-xs font-bold text-brand-gray bg-brand-bg rounded-xl px-4 py-3">
                  يوم العمل الحالي: <span className="text-brand-dark">{hours.currentDay}</span>
                  {' — '}من {shopClock(hours.dayStartsAt)} حتى {shopClock(hours.dayEndsAt)}
                </div>
              )}
            </>
          )}
        </motion.div>

        <ThermalPrinterSettings />

        {/* ── Brand info ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-fuchsia to-fuchsia-dark text-white rounded-2xl p-6 lg:col-span-2">
          <h2 className="font-black text-xl mb-2">عجينة وطحينة — نظام الإدارة</h2>
          <p className="text-white/80 font-bold text-sm mb-4">نظام إدارة المطعم — بُني بكثير من الحب والاهتمام</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { Icon: UtensilsCrossed, label: 'إدارة المنتجات' },
              { Icon: BarChart3, label: 'تتبع الأرباح' },
              { Icon: Store, label: 'فروعنا' },
              { Icon: Smartphone, label: 'طلبات واتساب' },
            ].map(({ Icon, label }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                <div className="flex justify-center mb-1"><Icon size={24} /></div>
                <div className="text-xs font-bold">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-xs text-white/75 font-bold">الإصدار 1.0.0 | © {new Date().getFullYear()} عجينة وطحينة</div>
        </motion.div>

      </div>
    </div>
  )
}
