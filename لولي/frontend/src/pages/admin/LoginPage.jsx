import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Loader2, LogIn } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { user } = await login(email, password)
      // Cashier's whole world is the counter — everything else 403s anyway.
      navigate(user?.role === 'cashier' ? '/admin/pos' : '/admin/dashboard')
    } catch (err) {
      toast.error(err.message || 'فشل تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #F6EFE6 0%, #F1E6D6 50%, #EDE0CE 100%)' }}
      dir="rtl"
    >
      {/* Decorative blobs */}
      <div className="absolute top-[-80px] right-[-80px] w-72 h-72 rounded-full opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #C18A4A, transparent)' }} />
      <div className="absolute bottom-[-60px] left-[-60px] w-56 h-56 rounded-full opacity-15 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #F6B91A, transparent)' }} />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, type: 'spring', damping: 18 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, type: 'spring', damping: 14, delay: 0.1 }}
            className="inline-block mb-4"
          >
            <div className="relative inline-block">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="h-32 w-32 rounded-full overflow-hidden mx-auto"
                  style={{ boxShadow: '0 10px 28px rgba(32,22,15,0.28)' }}>
                  <img
                    src="/brand/luliz-logo-round.png"
                    alt="لوليز"
                    className="h-full w-full object-cover"
                    
                    draggable={false}
                  />
                </div>
              </motion.div>
            </div>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm font-bold"
            style={{ color: '#7A6855' }}
          >
            لوحة تحكم المطعم
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.45 }}
          className="rounded-3xl p-8"
          style={{
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(232,213,192,0.8)',
            boxShadow: '0 20px 60px rgba(32,22,15,0.12), 0 4px 16px rgba(32,22,15,0.06)',
          }}
        >
          <h2 className="text-xl font-black mb-6 text-center flex items-center justify-center gap-2" style={{ color: '#20160F' }}>
            <Lock size={19} style={{ color: '#C18A4A' }} /> تسجيل الدخول
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#20160F' }}>
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl font-bold text-sm outline-none transition-all"
                style={{
                  background: '#F6EFE6',
                  border: '2px solid #EAD9C2',
                  color: '#20160F',
                  fontFamily: 'Tajawal, Cairo, sans-serif',
                }}
                onFocus={e => { e.target.style.borderColor = '#C18A4A' }}
                onBlur={e => { e.target.style.borderColor = '#EAD9C2' }}
                placeholder="example@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#20160F' }}>
                كلمة السر
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl font-bold text-sm outline-none transition-all"
                style={{
                  background: '#F6EFE6',
                  border: '2px solid #EAD9C2',
                  color: '#20160F',
                  fontFamily: 'Tajawal, Cairo, sans-serif',
                }}
                onFocus={e => { e.target.style.borderColor = '#C18A4A' }}
                onBlur={e => { e.target.style.borderColor = '#EAD9C2' }}
                placeholder="••••••"
                required
              />
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.02, y: loading ? 0 : -1 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              className="w-full py-3.5 font-black text-base rounded-2xl text-white mt-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              style={{
                background: loading
                  ? '#A08E7A'
                  : 'linear-gradient(135deg, #C18A4A 0%, #6A4422 100%)',
                boxShadow: loading ? 'none' : '0 6px 20px rgba(193,138,74,0.35)',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={17} className="animate-spin" />
                  جاري الدخول...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <LogIn size={17} /> دخول
                </span>
              )}
            </motion.button>
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-xs mt-6 font-bold"
          style={{ color: '#A08E7A' }}
        >
          لوليز — نظام إدارة المطعم © 2026
        </motion.p>
      </motion.div>
    </div>
  )
}
