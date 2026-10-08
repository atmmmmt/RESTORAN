import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { onQueueChange, queueSize } from '../services/offline'
import { centersAPI, getActiveCenterId, setActiveCenterId } from '../services/api'
import { useAuth, ROLE_LABELS } from '../hooks/useAuth'
import {
  Menu, LayoutDashboard, Croissant, LayoutGrid, Wheat, ShoppingCart, CookingPot,
  Banknote, Trash2, Store, ClipboardList, Tag, Landmark, TrendingUp,
  Lock, Users, Wallet, Star, Settings, LogOut, Bell, ChefHat,
  Fingerprint, UserCog, Receipt, WifiOff, UploadCloud, Undo2, BadgePercent, Building2, FileSpreadsheet,
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
  { path: '/admin/americans', Icon: Building2, label: 'إدارة الأميركان', roles: ['admin', 'americans_manager'] },
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
  { path: '/admin/financial-reports', Icon: FileSpreadsheet, label: 'المالية والورديات', roles: [...MANAGEMENT, 'viewer'] },
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
  const americans = user?.role === 'americans_manager'

  return (
    <div className="w-64 h-full flex flex-col" style={{ background: 'linear-gradient(180deg, #2C1206 0%, #3D1A0E 60%, #2C1206 100%)' }}>
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-2xl p-2 shadow-lg inline-flex items-center justify-center w-12 h-12">
            {americans ? <Building2 size={25} style={{ color: '#8B4513' }} /> : <img src="/logo.png" alt="عجينة وطحينة" className="h-9 w-auto object-contain" draggable={false} />}
          </div>
          <div>
            <div className="text-white font-black text-sm leading-tight">{americans ? 'إدارة الأميركان' : 'عجينة وطحينة'}</div>
            <div className="text-[#D4A017] text-xs font-bold">{americans ? 'الإدارة المالية للمحلين' : 'لوحة التحكم'}</div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(212,160,23,0.2)', border: '1.5px solid rgba(212,160,23,0.4)' }}>
            {americans ? <Building2 size={17} style={{ color: '#D4A017' }} /> : <ChefHat size={17} style={{ color: '#D4A017' }} />}
          </div>
          <div>
            <div className="text-sm font-black text-white">{user?.name || (americans ? 'إدارة الأميركان' : 'المدير')}</div>
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
  const [centers, setCenters] = useState([])
  const [activeCenterId, setActiveCenterState] = useState(getActiveCenterId())
  const [branchReady, setBranchReady] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const canSwitchBranch = ['admin', 'supervisor', 'viewer'].includes(user?.role)

  useEffect(() => {
    if (!canSwitchBranch) {
      setBranchReady(true)
      return
    }

    let alive = true
    centersAPI.getAll()
      .then(res => {
        if (!alive) return
        const list = (res.data.centers || []).filter(center => center.isActive !== false)
        setCenters(list)

        const saved = getActiveCenterId()
        const valid = list.find(center => String(center._id) === String(saved))
        const fallback = list.find(center => /الأميركان|اميركان/.test(center.name || ''))
          || list.find(center => /القلعة/.test(center.name || ''))
          || list[0]

        const next = valid?._id || fallback?._id || ''
        if (next && String(next) !== String(saved)) setActiveCenterId(next)
        setActiveCenterState(next ? String(next) : '')
      })
      .catch(() => {
        if (alive) setActiveCenterState(getActiveCenterId())
      })
      .finally(() => {
        if (alive) setBranchReady(true)
      })

    return () => { alive = false }
  }, [canSwitchBranch])

  const changeBranch = value => {
    if (!value || String(value) === String(activeCenterId)) return
    setActiveCenterId(value)
    setActiveCenterState(value)
    window.location.reload()
  }

  const activeCenter = centers.find(center => String(center._id) === String(activeCenterId))

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  return (
    <>
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
            {canSwitchBranch && branchReady && centers.length > 0 && (
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 bg-white"
                style={{ borderColor: '#E8D5C0', minWidth: 190 }}>
                <Building2 size={16} style={{ color: '#8B4513' }} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black leading-none mb-1" style={{ color: '#9B836F' }}>الفرع النشط</div>
                  <select value={activeCenterId} onChange={e => changeBranch(e.target.value)}
                    className="w-full bg-transparent outline-none border-0 p-0 text-sm font-black cursor-pointer"
                    style={{ color: '#2C1206' }}>
                    {centers.map(center => (
                      <option key={center._id} value={center._id}>{center.name}</option>
                    ))}
                  </select>
                </div>
              </label>
            )}
            <ConnectionStatus />
            <motion.div whileHover={{ scale: 1.08 }} className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors"
              style={{ background: '#FDF4EA', border: '1.5px solid #E8D5C0' }}>
              <Bell size={17} style={{ color: '#8B4513' }} />
            </motion.div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {!branchReady && canSwitchBranch
            ? <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Building2 size={34} className="mx-auto mb-3" style={{ color: '#8B4513' }} />
                  <div className="font-black" style={{ color: '#2C1206' }}>جاري تجهيز بيانات الفرع…</div>
                </div>
              </div>
            : <div key={activeCenterId || 'default'}>
                {canSwitchBranch && activeCenter && (
                  <div className="mb-4 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-black"
                    style={{ background: '#FFF8EF', border: '1px solid #E8D5C0', color: '#5C321E' }}>
                    <Building2 size={15} />
                    أنت تعمل الآن على فرع: <span style={{ color: '#A96734' }}>{activeCenter.name}</span>
                  </div>
                )}
                <Outlet />
              </div>
          }
        </main>
      </div>
    </div>
    </>
  )
}
