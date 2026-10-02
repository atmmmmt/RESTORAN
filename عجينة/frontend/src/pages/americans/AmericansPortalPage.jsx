import { Navigate, useNavigate } from 'react-router-dom'
import { Building2, LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import AmericansManagementPage from '../admin/AmericansManagementPage'

export default function AmericansPortalPage() {
  const { user, loading, token, logout } = useAuth()
  const navigate = useNavigate()

  if (loading && token) {
    return <div className="min-h-screen bg-[#FAF5ED] flex items-center justify-center font-black text-[#7A6855]">جاري تحميل الحساب…</div>
  }
  if (!token || !user) return <Navigate to="/americans/login" replace />
  if (user.role !== 'americans_manager') return <Navigate to="/admin/dashboard" replace />

  const signOut = () => {
    logout()
    navigate('/americans/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#FAF5ED]" dir="rtl">
      <header className="sticky top-0 z-30 bg-[#2C1206] text-white shadow-lg">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
              <Building2 size={21} className="text-[#F1C75B]" />
            </div>
            <div className="min-w-0">
              <div className="font-black leading-tight truncate">إدارة الأميركان</div>
              <div className="text-[11px] text-white/60 font-bold truncate">لوليز + عجينة وطحينة · الإدارة المالية الموحدة</div>
            </div>
          </div>
          <button onClick={signOut}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 transition flex items-center gap-2 text-sm font-black shrink-0">
            <LogOut size={16} /> خروج
          </button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 sm:p-6">
        <AmericansManagementPage />
      </main>
    </div>
  )
}
