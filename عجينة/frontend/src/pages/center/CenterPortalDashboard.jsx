import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, Store, Home, Users, Wallet, Receipt, ShoppingBag, ShoppingCart, Trash2, LogOut, Fingerprint, Settings } from 'lucide-react'
import { centerPortalAPI } from '../../services/api'
import toast from 'react-hot-toast'
import CenterEmployeesTab from './CenterEmployeesTab'
import CenterSalaryTab from './CenterSalaryTab'
import CenterExpensesTab from './CenterExpensesTab'
import CenterWasteTab from './CenterWasteTab'
import CenterPurchasesTab from './CenterPurchasesTab'
import CenterAttendanceTab from './CenterAttendanceTab'
import CenterPosTab from './CenterPosTab'
import CenterSettingsTab from './CenterSettingsTab'
import PageHeader from '../../components/common/PageHeader'
import StatCard from '../../components/common/StatCard'

const fmt = (n) => Number(n || 0).toLocaleString('ar-SY')
const fmtDate = (d) => new Date(d).toLocaleDateString('ar-SY', { year: 'numeric', month: 'short', day: 'numeric' })

const NAV_ITEMS = [
  { key: 'overview',  Icon: Home,         label: 'الرئيسية' },
  { key: 'pos',       Icon: ShoppingBag,  label: 'الكاشير' },
  { key: 'employees', Icon: Users,        label: 'الموظفون' },
  { key: 'salary',    Icon: Wallet,       label: 'الرواتب' },
  { key: 'attendance', Icon: Fingerprint, label: 'الحضور والبصمة' },
  { key: 'expenses',  Icon: Receipt,      label: 'المصاريف' },
  { key: 'purchases', Icon: ShoppingCart, label: 'المشتريات' },
  { key: 'waste',     Icon: Trash2,       label: 'الهدر' },
  { key: 'settings',  Icon: Settings,     label: 'إعدادات الفرع' },
]

function SidebarContent({ centerInfo, tab, setTab, onLogout, onLinkClick }) {
  return (
    <div className="w-64 h-full flex flex-col" style={{ background: 'linear-gradient(180deg, #2C1206 0%, #3D1A0E 60%, #2C1206 100%)' }}>
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(212,160,23,0.2)', border: '1.5px solid rgba(212,160,23,0.4)' }}
          >
            <Store size={20} style={{ color: '#D4A017' }} />
          </div>
          <div>
            <div className="text-white font-black text-sm leading-tight">بوابة الفروع</div>
            <div className="text-[#D4A017] text-xs font-bold">لوحة إدارة الفرع</div>
          </div>
        </div>
      </div>

      {/* Center info */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="text-sm font-black text-white">{centerInfo?.name || 'الفرع'}</div>
        {centerInfo?.location && (
          <div className="text-xs" style={{ color: 'rgba(212,160,23,0.8)' }}>{centerInfo.location}</div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto scrollbar-hide">
        {NAV_ITEMS.map(({ key, Icon, label }) => {
          const isActive = tab === key
          return (
            <button
              key={key}
              onClick={() => { setTab(key); onLinkClick?.() }}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm font-bold transition-all duration-200 relative ${
                isActive
                  ? 'text-white border-r-[3px] border-[#D4A017]'
                  : 'text-white/65 hover:text-white hover:bg-white/6'
              }`}
              style={isActive ? { background: 'rgba(212,160,23,0.12)' } : {}}
            >
              <Icon size={17} strokeWidth={isActive ? 2.5 : 2} className="w-5 flex-shrink-0" />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-white/10">
        <motion.button
          whileHover={{ x: -3 }}
          whileTap={{ scale: 0.97 }}
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-bold text-white/60 hover:text-white hover:bg-white/8 transition-all"
        >
          <LogOut size={16} />
          تسجيل الخروج
        </motion.button>
      </div>
    </div>
  )
}

export default function CenterPortalDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const centerInfo = JSON.parse(localStorage.getItem('luliz_center_info') || '{}')

  const load = () => {
    setLoading(true)
    centerPortalAPI.getMe()
      .then(r => setData(r.data))
      .catch(() => {
        toast.error('انتهت الجلسة')
        logout()
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const logout = () => {
    localStorage.removeItem('luliz_center_token')
    localStorage.removeItem('luliz_center_info')
    navigate('/center-portal/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg" style={{ fontFamily: "'Cairo', 'Tajawal', sans-serif" }} dir="rtl">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">⏳</div>
          <p className="font-bold text-brand-gray">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  const { center, balance, recentSales = [] } = data || {}
  const inventory = center?.inventory || []
  const lowStock = inventory.filter(i => i.quantity < (center?.lowStockThreshold || 5))

  return (
    <div className="flex h-screen overflow-hidden bg-brand-bg" style={{ fontFamily: "'Cairo', 'Tajawal', sans-serif" }} dir="rtl">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-shrink-0 shadow-2xl">
        <SidebarContent centerInfo={center || centerInfo} tab={tab} setTab={setTab} onLogout={logout} />
      </div>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute right-0 top-0 h-full shadow-2xl"
            >
              <SidebarContent
                centerInfo={center || centerInfo}
                tab={tab}
                setTab={setTab}
                onLogout={logout}
                onLinkClick={() => setSidebarOpen(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="h-16 flex items-center justify-between px-6 flex-shrink-0 border-b bg-white"
          style={{ borderColor: '#E8D5C0', boxShadow: '0 1px 12px rgba(44,18,6,0.07)' }}
        >
          <button
            className="lg:hidden p-2 rounded-xl bg-brand-bg transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6 text-brand-dark" />
          </button>

          <div className="text-sm font-bold hidden sm:block text-brand-gray">
            {center?.name} {center?.location ? `· ${center.location}` : ''}
          </div>

          <div className="w-9 h-9 lg:hidden" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {tab === 'pos' && <CenterPosTab onSale={load} />}
          {tab === 'employees' && <CenterEmployeesTab />}
          {tab === 'salary' && <CenterSalaryTab />}
          {tab === 'attendance' && <CenterAttendanceTab />}
          {tab === 'expenses' && <CenterExpensesTab />}
          {tab === 'purchases' && <CenterPurchasesTab />}
          {tab === 'settings' && <CenterSettingsTab />}
          {/* Waste needs the branch's own stock list to pick from. */}
          {tab === 'waste' && <CenterWasteTab inventory={data?.center?.inventory || []} />}

          {tab === 'overview' && (
            <div className="max-w-3xl mx-auto space-y-5">
              <PageHeader title={`مرحباً، ${center?.name || ''}`} subtitle="نظرة عامة على أداء فرعك" />

              {/* Low stock alert */}
              {lowStock.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">⚠️</span>
                    <span className="font-black text-amber-800">تنبيه: مخزون منخفض</span>
                  </div>
                  <div className="space-y-1">
                    {lowStock.map(item => (
                      <div key={item.productId} className="flex justify-between text-sm font-bold text-amber-700">
                        <span>{item.productNameSnapshot}</span>
                        <span>متبقي: {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Balance cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard label="المبلغ المستحق" value={fmt(balance?.amountOwed)} icon="💰" color="fuchsia" />
                <StatCard label="إجمالي البضاعة" value={fmt(balance?.totalDelivered)} icon="📦" color="blue" />
                <StatCard label="إجمالي المدفوع" value={fmt(balance?.totalCollected)} icon="✅" color="mint" />
              </div>

              {/* Inventory */}
              <div className="bg-white rounded-2xl shadow-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-black text-brand-dark text-base">📦 المخزون الحالي</h2>
                </div>
                {inventory.length === 0 ? (
                  <div className="text-center py-8 text-brand-gray-light font-bold">لا يوجد مخزون حتى الآن</div>
                ) : (
                  <div className="space-y-2">
                    {inventory.map(item => {
                      const isLow = item.quantity < (center?.lowStockThreshold || 5)
                      const isEmpty = item.quantity === 0
                      return (
                        <div key={item.productId}
                          className={`flex items-center justify-between p-3 rounded-xl border ${
                            isEmpty ? 'bg-red-50 border-red-200' :
                            isLow   ? 'bg-amber-50 border-amber-200' :
                                      'bg-brand-bg border-brand-border'
                          }`}>
                          <span className="font-bold text-brand-dark text-sm">{item.productNameSnapshot}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-black text-base ${
                              isEmpty ? 'text-red-600' : isLow ? 'text-amber-700' : 'text-green-700'
                            }`}>
                              {item.quantity}
                            </span>
                            {isEmpty && <span className="text-xs font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-lg">نفدت</span>}
                            {isLow && !isEmpty && <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">منخفض</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Recent Sales */}
              {recentSales.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card p-5">
                  <h2 className="font-black text-brand-dark text-base mb-3">🧾 آخر المبيعات</h2>
                  <div className="space-y-2">
                    {recentSales.map(s => (
                      <div key={s._id} className="flex items-center justify-between p-3 bg-brand-bg rounded-xl">
                        <div>
                          <div className="font-bold text-sm text-brand-dark">{s.productNameSnapshot}</div>
                          <div className="text-xs text-brand-gray">{fmtDate(s.saleDate)}</div>
                        </div>
                        <div className="text-left">
                          <div className="font-black text-brand-gray">{s.quantity} قطعة</div>
                          {s.totalAmount > 0 && (
                            <div className="text-xs font-bold text-fuchsia">{fmt(s.totalAmount)} ل.س</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
