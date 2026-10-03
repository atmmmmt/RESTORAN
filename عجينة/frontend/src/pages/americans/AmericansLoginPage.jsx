import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'

const GOLD = '#C49B49'
const BG = '#0F1113'

function BrandMark({ size = 84 }) {
  const [failed, setFailed] = useState(false)
  if (!failed) {
    return <img src="/americans-logo.png" alt="The American Family Club"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 20 }} />
  }
  return (
    <div style={{ width: size, height: size, background: '#1C2C1A', color: 'white', border: '2px solid white' }}
      className="rounded-[24px] flex items-center justify-center font-black text-xl">
      AM
    </div>
  )
}

export default function AmericansLoginPage() {
  const navigate = useNavigate()
  const { login, logout, user, token } = useAuth()
  const [email, setEmail] = useState('americans@restoran.local')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (token && user?.role === 'americans_manager') {
      navigate('/americans/dashboard', { replace: true })
    }
  }, [token, user, navigate])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const session = await login(email.trim(), password)
      if (session.user?.role !== 'americans_manager') {
        logout()
        toast.error('هذا الرابط مخصص لإدارة الأميركان فقط')
        return
      }
      navigate('/americans/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.message || 'بيانات الدخول غير صحيحة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4" dir="rtl"
      style={{ background: BG, fontFamily: 'Tajawal, Cairo, sans-serif' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 80% 8%, rgba(196,155,73,.17), transparent 30%), radial-gradient(circle at 8% 92%, rgba(28,44,26,.28), transparent 34%)' }} />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-[440px]">
        <div className="text-center mb-8">
          <div className="mx-auto w-fit mb-5"><BrandMark /></div>
          <div className="text-[11px] font-black tracking-[.24em] mb-2" style={{ color: GOLD }}>THE AMERICAN FAMILY CLUB</div>
          <h1 className="text-white text-3xl font-black">إدارة الأميركان</h1>
          <p className="text-white/45 text-sm mt-2 font-bold">البوابة المالية الموحدة للمطاعم</p>
        </div>

        <form onSubmit={submit} className="rounded-[28px] border border-white/10 p-7 sm:p-8"
          style={{ background: 'rgba(24,27,30,.96)', boxShadow: '0 35px 90px rgba(0,0,0,.38)' }}>
          <div className="flex items-center justify-between gap-3 mb-7">
            <div>
              <div className="text-white font-black text-lg">دخول الإدارة</div>
              <div className="text-white/35 text-xs mt-1">وصول مالي موحّد للمطاعم المضافة</div>
            </div>
            <ShieldCheck size={24} style={{ color: GOLD }} />
          </div>

          <label className="block text-white/60 text-xs font-black mb-2">البريد الإلكتروني</label>
          <div className="relative mb-4">
            <Mail size={17} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: GOLD }} />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full rounded-2xl bg-white/[.055] border border-white/10 text-white pr-11 pl-4 outline-none transition font-bold"
              style={{ height: 52 }} />
          </div>

          <label className="block text-white/60 text-xs font-black mb-2">كلمة السر</label>
          <div className="relative mb-6">
            <LockKeyhole size={17} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: GOLD }} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full rounded-2xl bg-white/[.055] border border-white/10 text-white pr-11 pl-4 outline-none transition font-bold"
              style={{ height: 52 }} placeholder="••••••••••" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full rounded-2xl font-black flex items-center justify-center gap-2 disabled:opacity-60 transition hover:-translate-y-0.5"
            style={{ height: 52, background: GOLD, color: BG, boxShadow: '0 12px 30px rgba(196,155,73,.18)' }}>
            {loading ? <><Loader2 size={18} className="animate-spin" /> جاري الدخول</> : 'دخول إلى اللوحة'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
