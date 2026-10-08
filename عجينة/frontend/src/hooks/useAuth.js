import { useState, useCallback, useEffect } from 'react'
import { authAPI } from '../services/api'

const TOKEN_KEY = 'luliz_admin_token'
const USER_KEY  = 'luliz_admin_user'

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
    const cachedUser = readCachedUser()

    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }

    /* Login already returned a signed token + user. Do not gate the first
       admin render on a second /auth/me request: if that refresh endpoint is
       temporarily unavailable during a deploy, the old flow created an
       endless login → dashboard → login loop. */
    if (cachedUser) {
      setUser(cachedUser)
      setLoading(false)

      // Refresh profile quietly. A failed refresh must not destroy a freshly
      // established session; protected feature APIs remain the source of truth.
      authAPI.getMe()
        .then(res => {
          if (res?.data?.user) {
            setUser(res.data.user)
            localStorage.setItem(USER_KEY, JSON.stringify(res.data.user))
          }
        })
        .catch(() => {})
      return
    }

    // Legacy session with a token but no cached user: recover the profile once.
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
    isAmericansManager: role === 'americans_manager',
    canManageStaff: role === 'admin',
  }
}

export const ROLE_LABELS = {
  admin:      'مدير',
  supervisor: 'مشرف',
  cashier:    'كاشير',
  kitchen:    'فريق المطبخ',
  viewer:     'مشاهد فقط',
  americans_manager: 'إدارة الأميركان',
}

export const ROLE_DESCRIPTIONS = {
  admin:      'صلاحية كاملة — يشمل الموظفين والرواتب والمستخدمين والإعدادات',
  supervisor: 'العمليات اليومية: المشتريات، المبيعات، الإنتاج، الطلبات — بدون بيانات الموظفين والرواتب',
  cashier:    'إنشاء طلبات الكاشير، طباعتها ومتابعة حالاتها فقط',
  kitchen:    'مشاهدة شاشة المطبخ وتحديث حالة تجهيز الطلبات فقط',
  viewer:     'اطلاع فقط بدون أي تعديل',
  americans_manager: 'اطلاع مالي موحّد على فرع الأميركان في لوليز وعجينة وطحينة فقط، بدون صلاحيات المالك أو تعديل الإعدادات',
}
