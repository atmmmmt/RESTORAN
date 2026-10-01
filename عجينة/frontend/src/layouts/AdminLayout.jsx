import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { onQueueChange, queueSize } from '../services/offline'
import { useAuth, ROLE_LABELS } from '../hooks/useAuth'
import {
  Menu, LayoutDashboard, Croissant, LayoutGrid, Wheat, ShoppingCart, CookingPot,
  Banknote, Trash2, Store, ClipboardList, Tag, Landmark, TrendingUp,
  Lock, Users, Wallet, Star, Settings, LogOut, Bell, ChefHat,
  Fingerprint, UserCog, Receipt, WifiOff, UploadCloud, Undo2, BadgePercent,
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
        ? { background: 'rgba(212,160,23,0.15)', color: '#8A6508' }
        : { background: 'rgba(192,80,80,0.12)', color: '#C05050' }}>
      {online
        ? <><UploadCloud size={13} /> {pending} بانتظار المزامنة</>
        : <><WifiOff size={13} /> غير متصل{pending ? ` · ${pending} محفوظة` : ''}</>}
    </div>
  )
}

const MANAGEMENT = ['admin', 'supervisor']
const NAV_ITEMS = [
  { path: '/admin/dashboard', Icon: LayoutDashboard, label: 'لوحة التحكم', roles: [...MANAGEMENT, 'viewer'] },
  { path: '/admin/pos', Icon: Receipt, label: 'طلب داخلي', roles: ['admin', 'supervisor', 'cashier'] },
  { path: '/admin/kitchen', Icon: ChefHat, label: 'شاشة المطبخ', roles: ['admin', 'supervisor', 'cashier', 'kitchen'] },
  { path: '/admin/returns', Icon: Undo2, label: 'المرتجع', roles: ['admin', 'supervisor', 'cashier'] },
  { path: '/admin/products', Icon: Croissant, label: 'المنتجات', roles: MANAGEMENT },
  { path: '/admin/categories', Icon: LayoutGrid, label: 'التصنيفات', roles: MANAGEMENT },
  { path: '/admin/ingredients', Icon: Wheat, label: 'المكونات', roles: MANAGEMENT },
  { path: '/admin/purchases', Icon: ShoppingCart, label: 'المشتريات', roles: MANAGEMENT },
  { path: '/admin/production', Icon: CookingPot, label: 'الإنتاج', roles: MANAGEMENT },
  { path: '/admin/sales', Icon: Banknote, label: 'المبيعات', roles: MANAGEMENT },
  { path: '/admin/waste', Icon: Trash2, label: 'الهدر', roles: MANAGEMENT },
  { path: '/admin/centers', Icon: Store, label: 'فروعنا', roles: MANAGEMENT },
  { path: '/admin/orders', Icon: ClipboardList, label: 'الطلبات', roles: MANAGEMENT },
  { path: '/admin/offers', Icon: Tag, label: 'العروض', roles: MANAGEMENT },
  { path: '/admin/cash', Icon: Landmark, label: 'الكاش', roles: MANAGEMENT },
  { path: '/admin/reports', Icon: TrendingUp, label: 'التقارير', roles: [...MANAGEMENT, 'viewer'] },
  { path: '/admin/finance', Icon: BadgePercent, label: 'المالية والضرائب', roles: [...MANAGEMENT, 'viewer'] },
  { path: '/admin/daily-closing', Icon: Lock, label: 'الجرد اليومي', roles: ['admin', 'supervisor'] },
  { path: '/admin/attendance', Icon: Fingerprint, label: 'الحضور والبصمة', roles: ['admin', 'supervisor'] },
  { path: '/admin/employees', Icon: Users, label: 'الموظفين', roles: ['admin'] },
  { path: '/admin/payroll', Icon: Wallet, label: 'الرواتب', roles: ['admin'] },
  { path: '/admin/users', Icon: UserCog, label: 'المستخدمين', roles: ['admin'] },
  { path: '/admin/reviews', Icon: Star, label: 'آراء العملاء', roles: MANAGEMENT },
  { path: '/admin/settings', Icon: Settings, label: 'الإعدادات', roles: ['admin'] },
]

function SidebarContent({ user, onLogout, onLinkClick }) {
  const items = NAV_ITEMS.filter(i => i.roles.includes(user?.role))

  return (
    <div className="w-64 h-full flex flex-col" style={{ background: 'linear-gradient(180deg, #2C1206 0%, #3D1A0E 60%, #2C1206 100%)' }}>
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-2xl p-1.5 shadow-lg inline-block">
            <img src="/logo.png" alt="عجينة وطحينة" className="h-10 w-auto object-contain" draggable={false} />
          </div>
          <div>
            <div className="text-white font-black text-sm leading-tight">عجينة وطحينة</div>
            <div className="text-[#D4A017] text-xs font-bold">لوحة التحكم</div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(212,160,23,0.2)', border: '1.5px solid rgba(212,160,23,0.4)' }}>
            <ChefHat size={17} style={{ color: '#D4A017' }} />
          </div>
          <div>
            <div className="text-sm font-black text-white">{user?.name || 'المدير'}</div>
            <div className="text-xs" style={{ color: 'rgba(212,160,23,0.8)' }}>
              {ROLE_LABELS[user?.role] || 'مدير المطعم'}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto scrollbar-hide">
        {items.map(({ path, Icon, label }) => (
          <NavLink key={path} to={path} onClick={onLinkClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-sm font-bold transition-all duration-200 relative ${
                isActive ? 'text-white border-r-[3px] border-[#D4A017]' : 'text-white/65 hover:text-white hover:bg-white/6'
              }`
            }
            style={({ isActive }) => isActive ? { background: 'rgba(212,160,23,0.12)' } : {}}>
            {({ isActive }) => <><Icon size={17} strokeWidth={isActive ? 2.5 : 2} className="w-5 flex-shrink-0" />{label}</>}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <motion.button whileHover={{ x: -3 }} whileTap={{ scale: 0.97 }} onClick={onLogout}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-bold text-white/60 hover:text-white hover:bg-white/8 transition-all">
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

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#FAF5ED' }} dir="rtl">
      <div className="hidden lg:flex flex-shrink-0 shadow-2xl">
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
        <header className="h-16 flex items-center justify-between px-6 flex-shrink-0 border-b"
          style={{ background: '#FFFFFF', borderColor: '#E8D5C0', boxShadow: '0 1px 12px rgba(44,18,6,0.07)' }}>
          <button className="lg:hidden p-2 rounded-xl transition-colors" style={{ background: '#FAF5ED' }} onClick={() => setSidebarOpen(true)}>
            <Menu className="w-6 h-6" style={{ color: '#2C1206' }} />
          </button>

          <div className="text-sm font-bold hidden sm:block" style={{ color: '#7A6855' }}>
            {new Date().toLocaleDateString('ar-SY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>

          <div className="flex items-center gap-2">
            <ConnectionStatus />
            <motion.div whileHover={{ scale: 1.08 }} className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors"
              style={{ background: '#FDF4EA', border: '1.5px solid #E8D5C0' }}>
              <Bell size={17} style={{ color: '#8B4513' }} />
            </motion.div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6"><Outlet /></main>
      </div>
    </div>
  )
}
