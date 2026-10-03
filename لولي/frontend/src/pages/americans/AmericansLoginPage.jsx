import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import AmericansPortal from '../../services/americansPortal'

function BrandMark({ size = 80 }) {
  const [failed, setFailed] = useState(false)
  if (!failed) {
    return <img src="/americans-logo.png" alt="إدارة الأميركان"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 20 }} />
  }
  return (
    <div style={{ width: size, height: size }}
      className="rounded-[24px] flex items-center justify-center bg-[#C49B49] text-[#111315] font-black text-2xl">
      AM
    </div>
  )
}

export default function AmericansLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('americans@restoran.local')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (AmericansPortal.token()) navigate('/americans/dashboard', { replace: true })
  }, [navigate])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await AmericansPortal.login(email.trim(), password)
      navigate('/americans/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.message || 'بيانات الدخول غير صحيحة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4" dir="rtl"
      style={{ background: '#0F1113', fontFamily: 'Tajawal, Cairo, sans-serif' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 80% 8%, rgba(196,155,73,.17), transparent 30%), radial-gradient(circle at 8% 92%, rgba(196,155,73,.08), transparent 34%)' }} />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-[440px]">
        <div className="text-center mb-8">
          <div className="mx-auto w-fit mb-5"><BrandMark /></div>
          <div className="text-[#C49B49] text-[11px] font-black tracking-[.25em] mb-2">AMERICANS MANAGEMENT</div>
          <h1 className="text-white text-3xl font-black">إدارة الأميركان</h1>
          <p className="text-white/45 text-sm mt-2 font-bold">البوابة المالية الموحدة للمطاعم</p>
        </div>

        <form onSubmit={submit} className="rounded-[28px] border border-white/10 p-7 sm:p-8"
          style={{ background: 'rgba(24,27,30,.96)', boxShadow: '0 35px 90px rgba(0,0,0,.38)' }}>
          <div className="flex items-center justify-between gap-3 mb-7">
            <div>
              <div className="text-white font-black text-lg">دخول الإدارة</div>
              <div className="text-white/35 text-xs mt-1">الوصول للبيانات المالية فقط</div>
            </div>
            <ShieldCheck size={24} className="text-[#C49B49]" />
          </div>

          <label className="block text-white/60 text-xs font-black mb-2">البريد الإلكتروني</label>
          <div className="relative mb-4">
            <Mail size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#C49B49]" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full rounded-2xl bg-white/[.055] border border-white/10 text-white pr-11 pl-4 outline-none focus:border-[#C49B49] transition font-bold"
              style={{ height: 52 }} />
          </div>

          <label className="block text-white/60 text-xs font-black mb-2">كلمة السر</label>
          <div className="relative mb-6">
            <LockKeyhole size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#C49B49]" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full rounded-2xl bg-white/[.055] border border-white/10 text-white pr-11 pl-4 outline-none focus:border-[#C49B49] transition font-bold"
              style={{ height: 52 }} placeholder="••••••••••" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full rounded-2xl font-black flex items-center justify-center gap-2 disabled:opacity-60 transition hover:-translate-y-0.5"
            style={{ height: 52, background: '#C49B49', color: '#111315', boxShadow: '0 12px 30px rgba(196,155,73,.18)' }}>
            {loading ? <><Loader2 size={18} className="animate-spin" /> جاري الدخول</> : 'دخول إلى اللوحة'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
