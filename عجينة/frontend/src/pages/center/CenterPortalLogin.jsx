import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Store, Loader2, LogIn } from 'lucide-react'
import { centerPortalAPI } from '../../services/api'
import toast from 'react-hot-toast'

export default function CenterPortalLogin() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) return toast.error('أدخل بيانات الدخول')
    setLoading(true)
    try {
      const res = await centerPortalAPI.login(form)
      localStorage.setItem('luliz_center_token', res.data.token)
      localStorage.setItem('luliz_center_info', JSON.stringify(res.data.center))
      navigate('/center-portal/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.message || 'بيانات الدخول غير صحيحة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #FAF5ED 0%, #F5EDE0 50%, #EDE0CE 100%)', fontFamily: "'Cairo', 'Tajawal', sans-serif" }}
      dir="rtl"
    >
      {/* Decorative blobs */}
      <div className="absolute top-[-80px] right-[-80px] w-72 h-72 rounded-full opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #8B4513, transparent)' }} />
      <div className="absolute bottom-[-60px] left-[-60px] w-56 h-56 rounded-full opacity-15 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #D4A017, transparent)' }} />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, type: 'spring', damping: 18 }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, type: 'spring', damping: 14, delay: 0.1 }}
            className="inline-block mb-4"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(139,69,19,0.12), rgba(212,160,23,0.12))', boxShadow: '0 8px 24px rgba(44,18,6,0.15)' }}
            >
              <Store size={32} style={{ color: '#8B4513' }} />
            </motion.div>
          </motion.div>
          <h1 className="text-2xl font-black" style={{ color: '#2C1206' }}>بوابة الفروع</h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm font-bold mt-1"
            style={{ color: '#7A6855' }}
          >
            سجّل دخولك لإدارة فرعك
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
            boxShadow: '0 20px 60px rgba(44,18,6,0.12), 0 4px 16px rgba(44,18,6,0.06)',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#2C1206' }}>
                اسم المستخدم
              </label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                className="w-full px-4 py-3 rounded-2xl font-bold text-sm outline-none transition-all"
                style={{
                  background: '#FAF5ED',
                  border: '2px solid #E8D5C0',
                  color: '#2C1206',
                }}
                onFocus={e => { e.target.style.borderColor = '#8B4513' }}
                onBlur={e => { e.target.style.borderColor = '#E8D5C0' }}
                placeholder="اسم المستخدم"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#2C1206' }}>
                كلمة السر
              </label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full px-4 py-3 rounded-2xl font-bold text-sm outline-none transition-all"
                style={{
                  background: '#FAF5ED',
                  border: '2px solid #E8D5C0',
                  color: '#2C1206',
                }}
                onFocus={e => { e.target.style.borderColor = '#8B4513' }}
                onBlur={e => { e.target.style.borderColor = '#E8D5C0' }}
                placeholder="••••••"
                autoComplete="current-password"
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
                  ? '#A09080'
                  : 'linear-gradient(135deg, #8B4513 0%, #5C2D0E 100%)',
                boxShadow: loading ? 'none' : '0 6px 20px rgba(139,69,19,0.35)',
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
      </motion.div>
    </div>
  )
}
