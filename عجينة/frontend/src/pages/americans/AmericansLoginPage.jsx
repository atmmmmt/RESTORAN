import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Building2, Loader2, LockKeyhole, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'

export default function AmericansLoginPage() {
  const [email, setEmail] = useState('americans@restoran.local')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, logout } = useAuth()
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    if (!email || !password) return toast.error('أدخل البريد وكلمة السر')
    setLoading(true)
    try {
      const session = await login(email, password)
      if (session.user?.role !== 'americans_manager') {
        logout()
        return toast.error('هذا الرابط مخصص لإدارة الأميركان فقط')
      }
      navigate('/americans/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.message || 'بيانات الدخول غير صحيحة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl"
      style={{ background: 'linear-gradient(135deg,#2C1206 0%,#4B2212 45%,#F3E7D8 160%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center text-white mb-7">
          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 mx-auto mb-4 flex items-center justify-center">
            <Building2 size={30} className="text-[#F1C75B]" />
          </div>
          <h1 className="text-2xl font-black">إدارة الأميركان</h1>
          <p className="text-sm text-white/65 mt-2 font-bold">اللوحة المالية الموحدة — لوليز + عجينة وطحينة</p>
        </div>

        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-7 shadow-2xl space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <LockKeyhole size={18} className="text-[#8B4513]" />
            <h2 className="font-black text-[#2C1206]">تسجيل الدخول</h2>
          </div>

          <div>
            <label className="block text-sm font-black text-[#5F4A3B] mb-2">البريد الإلكتروني</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-[#E8D5C0] outline-none focus:border-[#8B4513] font-bold"
              autoComplete="username" />
          </div>

          <div>
            <label className="block text-sm font-black text-[#5F4A3B] mb-2">كلمة السر</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-[#E8D5C0] outline-none focus:border-[#8B4513] font-bold"
              placeholder="••••••••••" autoComplete="current-password" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl text-white font-black flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#8B4513,#5C2D0E)' }}>
            {loading ? <><Loader2 size={17} className="animate-spin" /> جاري الدخول...</> : <><LogIn size={17} /> دخول</>}
          </button>

          <p className="text-[11px] text-center text-[#9A8879] font-bold pt-1">
            هذا الحساب مخصص للعرض المالي لفرع الأميركان في المحلين فقط.
          </p>
        </motion.form>
      </div>
    </div>
  )
}
