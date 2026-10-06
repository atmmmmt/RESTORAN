import { useState, useEffect } from 'react'
import { Outlet, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { onQueueChange, queueSize } from '../services/offline'
import { useAuth, ROLE_LABELS } from '../hooks/useAuth'
import {
  Menu, LayoutDashboard, Croissant, Wheat, ShoppingCart, CookingPot,
  Banknote, Trash2, Store, ClipboardList, Tag, Landmark, TrendingUp,
  Lock, Users, Wallet, Star, Settings, LogOut, Bell, ChefHat,
  Fingerprint, UserCog, Receipt, WifiOff, UploadCloud, Grid3x3, BadgePercent, FileSpreadsheet,
} from 'lucide-react'

function ConnectionStatus() {
  const [online, setOnline]  = useState(typeof navigator === 'undefined' || navigator.onLine)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const up   = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)

    queueSize().then(setPending)
    const unsubscribe = onQueueChange(setPending)
    const poll = setInterval(() => queueSize().then(setPending), 15000)

    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      unsubscribe()
      clearInterval(poll)
    }
  }, [])

  if (online && !pending) return null

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black"
      style={online
        ? { background: 'rgba(246,185,26,0.15)', color: '#8A6508' }
        : { background: 'rgba(192,80,80,0.12)', color: '#C05050' }}>
      {online
        ? <><UploadCloud size={13} /> {pending} بانتظار المزامنة</>
        : <><WifiOff size={13} /> غير متصل{pending ? ` · ${pending} محفوظة` : ''}</>}
    </div>
  )
}

const NAV_ITEMS = [
  { path: '/admin/dashboard',     Icon: LayoutDashboard, label: 'لوحة التحكم' },
  { path: '/admin/pos',           Icon: Receipt,         label: 'طلب داخلي',   cashierVisible: true },
  { path: '/admin/kitchen',       Icon: ChefHat,         label: 'شاشة المطبخ', cashierVisible: true },
  { path: '/admin/products',      Icon: Croissant,       label: 'المنتجات' },
  { path: '/admin/ingredients',   Icon: Wheat,           label: 'المكونات' },
  { path: '/admin/purchases',     Icon: ShoppingCart,    label: 'المشتريات',   cashierVisible: true },
  { path: '/admin/production',    Icon: CookingPot,      label: 'الإنتاج' },
  { path: '/admin/sales',         Icon: Banknote,        label: 'المبيعات' },
  { path: '/admin/waste',         Icon: Trash2,          label: 'الهدر' },
  { path: '/admin/centers',       Icon: Store,           label: 'مراكزنا' },
  { path: '/admin/orders',        Icon: ClipboardList,   label: 'الطلبات' },
  { path: '/admin/offers',        Icon: Tag,             label: 'العروض' },
  { path: '/admin/cash',          Icon: Landmark,        label: 'الكاش' },
  { path: '/admin/reports',       Icon: TrendingUp,      label: 'التقارير' },
  { path: '/admin/finance',       Icon: BadgePercent,    label: 'المالية والضرائب' },
  { path: '/admin/financial-reports', Icon: FileSpreadsheet, label: 'تقارير المالية' },
  { path: '/admin/daily-closing', Icon: Lock,            label: 'الجرد اليومي' },
  { path: '/admin/attendance',    Icon: Fingerprint,     label: 'الحضور والبصمة' },
  { path: '/admin/employees',     Icon: Users,           label: 'الموظفين',       adminOnly: true },
  { path: '/admin/payroll',       Icon: Wallet,          label: 'الأجور اليومية', adminOnly: true },
  { path: '/admin/users',         Icon: UserCog,         label: 'المستخدمين',     adminOnly: true },
  { path: '/admin/reviews',       Icon: Star,            label: 'آراء العملاء' },
  { path: '/admin/settings',      Icon: Settings,        label: 'الإعدادات',      adminOnly: true },
]

const BOTTOM_NAV_ITEMS = [
  { path: '/admin/dashboard', Icon: LayoutDashboard, label: 'الرئيسية' },
  { path: '/admin/pos',       Icon: Receipt,         label: 'طلب' },
  { path: '/admin/orders',    Icon: ClipboardList,   label: 'الطلبات' },
  { path: '/admin/cash',      Icon: Landmark,        label: 'الكاش' },
]

function SidebarContent({ user, onLogout, onLinkClick }) {
  const isAdmin   = user?.role === 'admin'
  const isCashier = user?.role === 'cashier'
  const items = isCashier
    ? NAV_ITEMS.filter(i => i.cashierVisible)
    : NAV_ITEMS.filter(i => !i.adminOnly || isAdmin)

  return (
    <div className="w-64 h-full min-h-0 flex flex-col" style={{ background: 'linear-gradient(180deg, #20160F 0%, #6A4422 60%, #20160F 100%)' }}>
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img src="/brand/luliz-logo-round.png" alt="لوليز" className="h-12 w-12 rounded-full shadow-lg" draggable={false} />
          <div>
            <div className="text-white font-black text-sm leading-tight">لوليز</div>
            <div className="text-[#F6B91A] text-xs font-bold">لوحة التحكم</div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(246,185,26,0.2)', border: '1.5px solid rgba(246,185,26,0.4)' }}>
            <ChefHat size={17} style={{ color: '#F6B91A' }} />
          </div>
          <div>
            <div className="text-sm font-black text-white">{user?.name || 'المدير'}</div>
            <div className="text-xs" style={{ color: 'rgba(246,185,26,0.8)' }}>
              {ROLE_LABELS[user?.role] || 'مدير المطعم'}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 min-h-0 py-3 overflow-y-auto overscroll-contain admin-sidebar-scroll">
        {items.map(({ path, Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            onClick={onLinkClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-sm font-bold transition-all duration-200 relative ${
                isActive
                  ? 'text-white border-r-[3px] border-[#F6B91A]'
                  : 'text-white/65 hover:text-white hover:bg-white/6'
              }`
            }
            style={({ isActive }) => isActive ? { background: 'rgba(246,185,26,0.12)' } : {}}
          >
            {({ isActive }) => (
              <>
                <Icon size={17} strokeWidth={isActive ? 2.5 : 2} className="w-5 flex-shrink-0" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <motion.button
          whileHover={{ x: -3 }}
          whileTap={{ scale: 0.97 }}
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-bold text-white/60 hover:text-white hover:bg-white/8 transition-all"
        >
          <LogOut size={16} /> تسجيل الخروج
        </motion.button>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  const CASHIER_PATHS = ['/admin/pos', '/admin/purchases']
  if (user?.role === 'cashier' && !CASHIER_PATHS.includes(location.pathname)) {
    return <Navigate to="/admin/pos" replace />
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F6EFE6' }} dir="rtl">
      <div className="hidden lg:flex flex-shrink-0 h-screen shadow-2xl">
        <SidebarContent user={user} onLogout={handleLogout} onLinkClick={() => {}} />
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="absolute right-0 top-0 h-full shadow-2xl">
              <SidebarContent user={user} onLogout={handleLogout} onLinkClick={() => setSidebarOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 lg:h-16 flex items-center justify-between px-4 lg:px-6 flex-shrink-0 border-b sticky top-0 z-30"
          style={{ background: '#FFFFFF', borderColor: '#EAD9C2', boxShadow: '0 1px 12px rgba(32,22,15,0.07)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <button className="lg:hidden p-2 -mr-1 rounded-xl transition-colors flex-shrink-0" style={{ background: '#F6EFE6' }} onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" style={{ color: '#20160F' }} />
            </button>
            <div className="min-w-0">
              <div className="text-[13px] lg:text-sm font-black truncate" style={{ color: '#20160F' }}>
                {new Date().toLocaleDateString('ar-SY', { weekday: 'long' })}
              </div>
              <div className="text-[11px] lg:text-sm font-bold truncate hidden sm:block" style={{ color: '#7A6855' }}>
                {new Date().toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <ConnectionStatus />
            <motion.div whileHover={{ scale: 1.08 }} className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors flex-shrink-0"
              style={{ background: '#FDF4EA', border: '1.5px solid #EAD9C2' }}>
              <Bell size={17} style={{ color: '#C18A4A' }} />
            </motion.div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6"><Outlet /></main>
      </div>

      {user?.role !== 'cashier' && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch shadow-[0_-4px_20px_rgba(32,22,15,0.1)]"
          style={{ background: '#FFFFFF', borderTop: '1px solid #EAD9C2', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {BOTTOM_NAV_ITEMS.map(({ path, Icon, label }) => (
            <NavLink key={path} to={path}
              className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-black transition-colors ${isActive ? 'text-fuchsia' : 'text-brand-gray'}`}>
              {({ isActive }) => <><Icon size={22} strokeWidth={isActive ? 2.3 : 1.9} />{label}</>}
            </NavLink>
          ))}
          <button onClick={() => setSidebarOpen(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-black text-brand-gray">
            <Grid3x3 size={22} strokeWidth={1.9} /> المزيد
          </button>
        </nav>
      )}
    </div>
  )
}
