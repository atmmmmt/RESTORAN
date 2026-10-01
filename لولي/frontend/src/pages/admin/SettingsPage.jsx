import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  ChefHat, Image, BarChart3, Store, Smartphone,
  Lock, Globe, UtensilsCrossed, Save, Upload, AlertCircle,
} from 'lucide-react'
import { settingsAPI, siteSettingsAPI, uploadAPI } from '../../services/api'
import PageHeader from '../../components/common/PageHeader'
import Button from '../../components/common/Button'
import { useAuth } from '../../hooks/useAuth'
import ProfitSharesCard from '../../components/admin/ProfitSharesCard'
import PrinterSetupCard from '../../components/admin/PrinterSetupCard'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const { user } = useAuth()
  const fileRef = useRef(null)

  /* ── Password form ── */
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)

  /* ── Site settings ── */
  const [site, setSite]               = useState({ heroImage: '', waNumber: '', instagramUrl: '', beholdFeedId: '', comingSoonEnabled: false })
  const [togglingCS, setTogglingCS]   = useState(false)
  const siteRef                       = useRef({ heroImage: '', waNumber: '', instagramUrl: '', beholdFeedId: '' })
  const [siteLoading, setSiteLoading] = useState(true)
  const [siteSaving, setSiteSaving]   = useState(false)
  const [uploading, setUploading]     = useState(false)

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
        beholdFeedId: current.beholdFeedId,
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
              <div className="font-black text-brand-dark text-lg">{user?.name || "مدير لوليز"}</div>
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
            أضيفي رابط صفحتك وخدمة Behold لعرض آخر البوستات تلقائياً على الموقع
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
                placeholder="https://instagram.com/loliskitchen"
                dir="ltr"
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm"
              />
              <p className="text-xs text-brand-gray-light mt-1 font-medium">
                الرابط الكامل لصفحتك على الانستغرام
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-brand-dark mb-2 block">
                Behold Feed ID — لعرض آخر البوستات
              </label>
              <input
                type="text"
                value={site.beholdFeedId || ''}
                onChange={e => setSite(s => ({ ...s, beholdFeedId: e.target.value.trim() }))}
                placeholder="XXXXXXXXXXXXXXXX"
                dir="ltr"
                className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-sm"
              />
              <p className="text-xs text-brand-gray-light mt-1 font-medium">
                مجاني 100% —{' '}
                <a href="https://behold.so" target="_blank" rel="noopener noreferrer"
                  className="text-fuchsia underline">سجّلي على behold.so</a>
                {' '}← اربطي انستغرامك ← اعملي Feed ← انسخي الـ ID
              </p>
            </div>
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

        {/* ── Receipt printers ── */}
        <PrinterSetupCard />

        {/* ── Profit shares & monthly settlement (page is admin-only) ── */}
        <ProfitSharesCard />

        {/* ── Brand info ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-fuchsia to-fuchsia-dark text-white rounded-2xl p-6 lg:col-span-2">
          <h2 className="font-black text-xl mb-2">لوليز — نظام الإدارة</h2>
          <p className="text-white/80 font-bold text-sm mb-4">نظام إدارة المطعم — بُني بكثير من الحب والاهتمام</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { Icon: UtensilsCrossed, label: 'إدارة المنتجات' },
              { Icon: BarChart3, label: 'تتبع الأرباح' },
              { Icon: Store, label: 'مراكزنا' },
              { Icon: Smartphone, label: 'طلبات واتساب' },
            ].map(({ Icon, label }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                <div className="flex justify-center mb-1"><Icon size={24} /></div>
                <div className="text-xs font-bold">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-xs text-white/75 font-bold">الإصدار 1.0.0 | © 2026 لوليز</div>
        </motion.div>

      </div>
    </div>
  )
}
