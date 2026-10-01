import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Store } from 'lucide-react'
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
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-50 to-pink-50 flex items-center justify-center p-4"
      style={{ fontFamily: 'Cairo, sans-serif', direction: 'rtl' }}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(193,138,74,0.12), rgba(246,185,26,0.12))' }}>
            <Store size={32} style={{ color: '#C18A4A' }} />
          </div>
          <h1 className="text-2xl font-black text-gray-800">بوابة مركز البيع</h1>
          <p className="text-gray-500 text-sm font-bold mt-1">سجّل دخولك لإدارة مخزونك</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-bold text-gray-700 mb-1.5 block">اسم المستخدم</label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-pink-400 focus:outline-none font-bold text-base"
              placeholder="اسم المستخدم"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700 mb-1.5 block">كلمة السر</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-pink-400 focus:outline-none font-bold text-base"
              placeholder="••••••"
              autoComplete="current-password"
            />
          </div>
          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-3.5 rounded-2xl font-black text-white text-base shadow-lg disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #C18A4A, #F6B91A)' }}
          >
            {loading ? '...' : 'دخول'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
