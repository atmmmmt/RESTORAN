import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, ShieldCheck, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../../services/api'
import Button from './Button'
import toast from 'react-hot-toast'

/**
 * Locks a page behind the signed-in user's own password.
 *
 * The dashboard normally stays open all day on the counter machine, so a
 * page that carries private information — what each person is paid, the
 * staff file — is one stray click away from anyone walking past. This asks
 * for the password again before the page renders at all, and it asks every
 * time the page is opened: nothing is remembered between visits, which is
 * the whole point.
 */
export default function PasswordGate({ title, hint, children }) {
  const [unlocked, setUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const navigate = useNavigate()

  if (unlocked) return children

  const unlock = async e => {
    e?.preventDefault()
    if (!password) return toast.error('أدخل كلمة السر')
    setChecking(true)
    try {
      await authAPI.verifyPassword(password)
      setPassword('')
      setUnlocked(true)
    } catch (err) {
      toast.error(err.message || 'كلمة السر غير صحيحة')
      setPassword('')
    } finally { setChecking(false) }
  }

  return (
    <div className="flex items-center justify-center py-10">
      <motion.form
        onSubmit={unlock}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-card p-8 w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'rgba(169,103,52,0.12)' }}>
          <Lock size={28} style={{ color: '#A96734' }} />
        </div>

        <h2 className="font-black text-brand-dark text-xl mb-1">{title || 'صفحة محمية'}</h2>
        <p className="text-brand-gray font-bold text-sm mb-6">
          {hint || 'أدخل كلمة السر الخاصة بك للمتابعة'}
        </p>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••"
          className="w-full px-4 py-3 border-2 border-brand-border rounded-xl focus:border-fuchsia focus:outline-none font-bold text-center tracking-widest mb-4"
        />

        <Button type="submit" loading={checking} className="w-full" icon={<ShieldCheck size={16} />}>
          فتح الصفحة
        </Button>

        <button type="button" onClick={() => navigate('/admin/dashboard')}
          className="mt-4 text-xs text-brand-gray hover:text-brand-dark font-bold inline-flex items-center gap-1">
          العودة للوحة التحكم <ArrowRight size={12} />
        </button>
      </motion.form>
    </div>
  )
}
