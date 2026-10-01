import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './hooks/useAuth'
import { CartProvider } from './context/CartContext'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  /* Keep the install manifest in step with in-app navigation: dashboard pages
     install the dashboard app, everything else installs the customer app. */
  useEffect(() => {
    const link = document.getElementById('app-manifest')
    if (!link) return
    const admin = pathname.startsWith('/admin') || pathname.startsWith('/center-portal')
    const href = admin ? '/manifest-admin.webmanifest' : '/manifest.webmanifest'
    if (link.getAttribute('href') !== href) link.setAttribute('href', href)
  }, [pathname])

  return null
}

/* ── Layouts (small — load eagerly) ─────── */
import CustomerLayout from './layouts/CustomerLayout'
import AdminLayout    from './layouts/AdminLayout'

/* ── Customer pages (lazy — code split) ─── */
const HomePage           = lazy(() => import('./pages/customer/HomePage'))
const MenuPage           = lazy(() => import('./pages/customer/MenuPage'))
const ProductDetailPage  = lazy(() => import('./pages/customer/ProductDetailPage'))
const OffersPage         = lazy(() => import('./pages/customer/OffersPage'))
const AboutPage          = lazy(() => import('./pages/customer/AboutPage'))
const CustomerCentersPage= lazy(() => import('./pages/customer/CentersPage'))
const OrderPage          = lazy(() => import('./pages/customer/OrderPage'))

/* ── Admin pages (lazy — separate chunk) ── */
const LoginPage          = lazy(() => import('./pages/admin/LoginPage'))
const DashboardPage      = lazy(() => import('./pages/admin/DashboardPage'))
const ProductsPage       = lazy(() => import('./pages/admin/ProductsPage'))
const ProductFormPage    = lazy(() => import('./pages/admin/ProductFormPage'))
const IngredientsPage    = lazy(() => import('./pages/admin/IngredientsPage'))
const PurchasesPage      = lazy(() => import('./pages/admin/PurchasesPage'))
const ProductionPage     = lazy(() => import('./pages/admin/ProductionPage'))
const SalesPage          = lazy(() => import('./pages/admin/SalesPage'))
const WastePage          = lazy(() => import('./pages/admin/WastePage'))
const CentersPage        = lazy(() => import('./pages/admin/CentersPage'))
const CenterDetailPage   = lazy(() => import('./pages/admin/CenterDetailPage'))
const OrdersPage         = lazy(() => import('./pages/admin/OrdersPage'))
const AdminOffersPage    = lazy(() => import('./pages/admin/OffersPage'))
const CashPage           = lazy(() => import('./pages/admin/CashPage'))
const ReportsPage        = lazy(() => import('./pages/admin/ReportsPage'))
const DailyClosingPage   = lazy(() => import('./pages/admin/DailyClosingPage'))
const SettingsPage       = lazy(() => import('./pages/admin/SettingsPage'))
const ReviewsPage        = lazy(() => import('./pages/admin/ReviewsPage'))
const EmployeesPage      = lazy(() => import('./pages/admin/EmployeesPage'))
const PayrollPage        = lazy(() => import('./pages/admin/PayrollPage'))
const UsersPage          = lazy(() => import('./pages/admin/UsersPage'))
const AttendancePage     = lazy(() => import('./pages/admin/AttendancePage'))
const PosPage            = lazy(() => import('./pages/admin/PosPage'))
const KitchenPage        = lazy(() => import('./pages/admin/KitchenPage'))

/* ── Center portal (lazy) ─────────────── */
const CenterPortalLogin     = lazy(() => import('./pages/center/CenterPortalLogin'))
const CenterPortalDashboard = lazy(() => import('./pages/center/CenterPortalDashboard'))

/* Minimal page-level loading fallback — no spinner, just keeps background color */
function PageShell() {
  return <div style={{ minHeight: '60vh', background: '#F6EFE6' }} />
}

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/admin/login" replace />
}

/** Gate for admin-only pages. Supervisors get bounced to the dashboard. */
function AdminOnlyRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading && !user) return <PageShell />
  if (user && user.role !== 'admin') return <Navigate to="/admin/dashboard" replace />
  return children
}

/** `/admin` with no sub-path — lands each role somewhere they can actually see. */
function AdminIndexRedirect() {
  const { user, loading } = useAuth()
  if (loading && !user) return <PageShell />
  return <Navigate to={user?.role === 'cashier' ? '/admin/pos' : '/admin/dashboard'} replace />
}

function PrivateCenterRoute({ children }) {
  const token = localStorage.getItem('luliz_center_token')
  return token ? children : <Navigate to="/center-portal/login" replace />
}

export default function App() {
  return (
    <CartProvider>
      <ScrollToTop />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: { direction: 'rtl', fontFamily: 'Cairo, sans-serif', fontSize: '14px', fontWeight: '700' },
          success: { style: { background: '#EAF7EE', color: '#1F7A43', border: '1px solid #3FA96A' } },
          error:   { style: { background: '#F6EFE6', color: '#6A4422', border: '1px solid #C18A4A' } },
        }}
      />

      <Suspense fallback={<PageShell />}>
        <Routes>
          {/* ── Customer Site ─────────────────────────── */}
          <Route element={<CustomerLayout />}>
            <Route path="/"         element={<HomePage />} />
            <Route path="/menu"     element={<MenuPage />} />
            <Route path="/menu/:id" element={<ProductDetailPage />} />
            <Route path="/offers"   element={<OffersPage />} />
            <Route path="/about"    element={<AboutPage />} />
            <Route path="/centers"  element={<CustomerCentersPage />} />
            <Route path="/order"    element={<OrderPage />} />
          </Route>

          {/* ── Admin ──────────────────────────────────── */}
          <Route path="/admin/login" element={<LoginPage />} />

          {/* Kitchen display runs full-screen, outside the sidebar chrome */}
          <Route path="/admin/kitchen" element={<PrivateRoute><KitchenPage /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
            <Route index element={<AdminIndexRedirect />} />
            <Route path="dashboard"    element={<DashboardPage />} />
            <Route path="products"     element={<ProductsPage />} />
            <Route path="products/new" element={<ProductFormPage />} />
            <Route path="products/:id/edit" element={<ProductFormPage />} />
            <Route path="ingredients"  element={<IngredientsPage />} />
            <Route path="purchases"    element={<PurchasesPage />} />
            <Route path="production"   element={<ProductionPage />} />
            <Route path="sales"        element={<SalesPage />} />
            <Route path="waste"        element={<WastePage />} />
            <Route path="centers"      element={<CentersPage />} />
            <Route path="centers/:id"  element={<CenterDetailPage />} />
            <Route path="orders"       element={<OrdersPage />} />
            <Route path="offers"       element={<AdminOffersPage />} />
            <Route path="cash"         element={<CashPage />} />
            <Route path="reports"      element={<ReportsPage />} />
            <Route path="daily-closing" element={<DailyClosingPage />} />
            <Route path="reviews"      element={<ReviewsPage />} />
            <Route path="pos"          element={<PosPage />} />

            {/* Admin-only */}
            <Route path="settings"   element={<AdminOnlyRoute><SettingsPage /></AdminOnlyRoute>} />
            <Route path="employees"  element={<AdminOnlyRoute><EmployeesPage /></AdminOnlyRoute>} />
            <Route path="payroll"    element={<AdminOnlyRoute><PayrollPage /></AdminOnlyRoute>} />
            <Route path="users"      element={<AdminOnlyRoute><UsersPage /></AdminOnlyRoute>} />
            {/* Readable by supervisors — the page hides every write control
                for them, and the API rejects the writes regardless. */}
            <Route path="attendance" element={<AttendancePage />} />
          </Route>

          {/* ── Center Portal ──────────────────────────── */}
          <Route path="/center-portal/login"     element={<CenterPortalLogin />} />
          <Route path="/center-portal/dashboard" element={<PrivateCenterRoute><CenterPortalDashboard /></PrivateCenterRoute>} />

          {/* ── Fallback ───────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </CartProvider>
  )
}
