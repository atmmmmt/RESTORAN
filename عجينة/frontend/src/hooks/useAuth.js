import { useState, useCallback, useEffect } from 'react'
import { authAPI } from '../services/api'

const TOKEN_KEY = 'luliz_admin_token'
const USER_KEY  = 'luliz_admin_user'

/** Read the cached user synchronously so role gating renders correctly on first paint. */
function readCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function useAuth() {
  const [user, setUser]       = useState(readCachedUser)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      authAPI.getMe()
        .then(res => {
          setUser(res.data.user)
          localStorage.setItem(USER_KEY, JSON.stringify(res.data.user))
        })
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
          setUser(null)
        })
        .finally(() => setLoading(false))
    } else {
      setUser(null)
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await authAPI.login({ email, password })
    localStorage.setItem(TOKEN_KEY, res.data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(res.data.user))
    setUser(res.data.user)
    return res.data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  const token = localStorage.getItem(TOKEN_KEY)
  const role  = user?.role || null

  return {
    user, loading, token, login, logout, role,
    isAuthenticated: !!user,
    isAdmin:      role === 'admin',
    isSupervisor: role === 'supervisor',
    /** Admin-only areas: employees, payroll, users, settings. */
    canManageStaff: role === 'admin',
  }
}

/** Roles available in the dashboard, with Arabic labels + what each may do. */
export const ROLE_LABELS = {
  admin:      'مدير',
  supervisor: 'مشرف',
  cashier:    'كاشير',
  kitchen:    'فريق المطبخ',
  viewer:     'مشاهد فقط',
}

export const ROLE_DESCRIPTIONS = {
  admin:      'صلاحية كاملة — يشمل الموظفين والرواتب والمستخدمين والإعدادات',
  supervisor: 'العمليات اليومية: المشتريات، المبيعات، الإنتاج، الطلبات — بدون بيانات الموظفين والرواتب',
  cashier:    'إنشاء طلبات الكاشير، طباعتها ومتابعة حالاتها فقط',
  kitchen:    'مشاهدة شاشة المطبخ وتحديث حالة تجهيز الطلبات فقط',
  viewer:     'اطلاع فقط بدون أي تعديل',
}
