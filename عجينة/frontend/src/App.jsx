import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './hooks/useAuth'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

import CustomerLayout from './layouts/CustomerLayout'
import PasswordGate   from './components/common/PasswordGate'
import AdminLayout    from './layouts/AdminLayout'

const HomePage           = lazy(() => import('./pages/customer/HomePage'))
const MenuPage           = lazy(() => import('./pages/customer/MenuPage'))
const ProductDetailPage  = lazy(() => import('./pages/customer/ProductDetailPage'))
const OffersPage         = lazy(() => import('./pages/customer/OffersPage'))
const AboutPage          = lazy(() => import('./pages/customer/AboutPage'))
const CustomerCentersPage= lazy(() => import('./pages/customer/CentersPage'))
const OrderPage          = lazy(() => import('./pages/customer/OrderPage'))

const LoginPage          = lazy(() => import('./pages/admin/LoginPage'))
const DashboardPage      = lazy(() => import('./pages/admin/DashboardPage'))
const ProductsPage       = lazy(() => import('./pages/admin/ProductsPage'))
const CategoriesPage     = lazy(() => import('./pages/admin/CategoriesPage'))
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
const FinancePage        = lazy(() => import('./pages/admin/FinancePage'))
const AmericansManagementPage = lazy(() => import('./pages/admin/AmericansManagementPage'))
const DailyClosingPage   = lazy(() => import('./pages/admin/DailyClosingPage'))
const SettingsPage       = lazy(() => import('./pages/admin/SettingsPage'))
const ReviewsPage        = lazy(() => import('./pages/admin/ReviewsPage'))
const EmployeesPage      = lazy(() => import('./pages/admin/EmployeesPage'))
const PayrollPage        = lazy(() => import('./pages/admin/PayrollPage'))
const UsersPage          = lazy(() => import('./pages/admin/UsersPage'))
const AttendancePage     = lazy(() => import('./pages/admin/AttendancePage'))
const PosPage            = lazy(() => import('./pages/admin/PosPage'))
const ReturnsPage        = lazy(() => import('./pages/admin/ReturnsPage'))
const KitchenPage        = lazy(() => import('./pages/admin/KitchenPage'))

const AmericansLoginPage    = lazy(() => import('./pages/americans/AmericansLoginPage'))
const AmericansPortalPage   = lazy(() => import('./pages/americans/AmericansPortalPage'))

const CenterPortalLogin     = lazy(() => import('./pages/center/CenterPortalLogin'))
const CenterPortalDashboard = lazy(() => import('./pages/center/CenterPortalDashboard'))

function PageShell() {
  return <div style={{ minHeight: '60vh', background: '#FAF5ED' }} />
}

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/admin/login" replace />
}

function AdminOnlyRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading && !user) return <PageShell />
  if (user && user.role !== 'admin') return <Navigate to="/admin/dashboard" replace />
  return children
}

const ROLE_HOME = {
  admin: '/admin/dashboard', supervisor: '/admin/dashboard', viewer: '/admin/dashboard',
  cashier: '/admin/pos', kitchen: '/admin/kitchen', americans_manager: '/admin/americans',
}

function RoleRoute({ roles, children }) {
  const { user, loading } = useAuth()
  if (loading && !user) return <PageShell />
  if (!user) return <Navigate to="/admin/login" replace />
  return roles.includes(user.role)
    ? children
    : <Navigate to={ROLE_HOME[user.role] || '/admin/dashboard'} replace />
}

function PrivateCenterRoute({ children }) {
  const token = localStorage.getItem('luliz_center_token')
  return token ? children : <Navigate to="/center-portal/login" replace />
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: { direction: 'rtl', fontFamily: 'Cairo, sans-serif', fontSize: '14px', fontWeight: '700' },
          success: { style: { background: '#EEF4E5', color: '#3a5a1e', border: '1px solid #7C9A52' } },
          error:   { style: { background: '#FFF5EC', color: '#5C2D0E', border: '1px solid #8B4513' } },
        }}
      />

      <Suspense fallback={<PageShell />}>
        <Routes>
          <Route element={<CustomerLayout />}>
            <Route path="/"         element={<HomePage />} />
            <Route path="/menu"     element={<MenuPage />} />
            <Route path="/menu/:id" element={<ProductDetailPage />} />
            <Route path="/offers"   element={<OffersPage />} />
            <Route path="/about"    element={<AboutPage />} />
            <Route path="/centers"  element={<CustomerCentersPage />} />
            <Route path="/order"    element={<OrderPage />} />
          </Route>

          <Route path="/americans" element={<Navigate to="/americans/dashboard" replace />} />
          <Route path="/americans/login" element={<AmericansLoginPage />} />
          <Route path="/americans/dashboard" element={<AmericansPortalPage />} />

          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin/kitchen" element={<PrivateRoute><RoleRoute roles={['admin', 'supervisor', 'cashier', 'kitchen']}><KitchenPage /></RoleRoute></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<RoleRoute roles={['admin', 'supervisor', 'viewer']}><DashboardPage /></RoleRoute>} />
            <Route path="americans" element={<RoleRoute roles={['admin', 'americans_manager']}><AmericansManagementPage /></RoleRoute>} />
            <Route path="products" element={<RoleRoute roles={['admin', 'supervisor']}><ProductsPage /></RoleRoute>} />
            <Route path="categories" element={<RoleRoute roles={['admin', 'supervisor']}><CategoriesPage /></RoleRoute>} />
            <Route path="products/new" element={<RoleRoute roles={['admin', 'supervisor']}><ProductFormPage /></RoleRoute>} />
            <Route path="products/:id/edit" element={<RoleRoute roles={['admin', 'supervisor']}><ProductFormPage /></RoleRoute>} />
            <Route path="ingredients" element={<RoleRoute roles={['admin', 'supervisor']}><IngredientsPage /></RoleRoute>} />
            <Route path="purchases" element={<RoleRoute roles={['admin', 'supervisor']}><PurchasesPage /></RoleRoute>} />
            <Route path="production" element={<RoleRoute roles={['admin', 'supervisor']}><ProductionPage /></RoleRoute>} />
            <Route path="sales" element={<RoleRoute roles={['admin', 'supervisor']}><SalesPage /></RoleRoute>} />
            <Route path="waste" element={<RoleRoute roles={['admin', 'supervisor']}><WastePage /></RoleRoute>} />
            <Route path="centers" element={<RoleRoute roles={['admin', 'supervisor']}><CentersPage /></RoleRoute>} />
            <Route path="centers/:id" element={<RoleRoute roles={['admin', 'supervisor']}><CenterDetailPage /></RoleRoute>} />
            <Route path="orders" element={<RoleRoute roles={['admin', 'supervisor']}><OrdersPage /></RoleRoute>} />
            <Route path="offers" element={<RoleRoute roles={['admin', 'supervisor']}><AdminOffersPage /></RoleRoute>} />
            <Route path="cash" element={<RoleRoute roles={['admin', 'supervisor']}><CashPage /></RoleRoute>} />
            <Route path="reports" element={<RoleRoute roles={['admin', 'supervisor', 'viewer']}><ReportsPage /></RoleRoute>} />
            <Route path="finance" element={<RoleRoute roles={['admin', 'supervisor', 'viewer']}><FinancePage /></RoleRoute>} />
            <Route path="daily-closing" element={<RoleRoute roles={['admin', 'supervisor']}><DailyClosingPage /></RoleRoute>} />
            <Route path="reviews" element={<RoleRoute roles={['admin', 'supervisor']}><ReviewsPage /></RoleRoute>} />
            <Route path="pos" element={<RoleRoute roles={['admin', 'supervisor', 'cashier']}><PosPage /></RoleRoute>} />
            <Route path="returns" element={<RoleRoute roles={['admin', 'supervisor', 'cashier']}><ReturnsPage /></RoleRoute>} />

            <Route path="settings"   element={<AdminOnlyRoute><SettingsPage /></AdminOnlyRoute>} />
            <Route path="employees"  element={<AdminOnlyRoute><PasswordGate title="ملف الموظفين" hint="هذه الصفحة تحتوي بيانات الموظفين — أدخل كلمة السر للمتابعة"><EmployeesPage /></PasswordGate></AdminOnlyRoute>} />
            <Route path="payroll"    element={<AdminOnlyRoute><PasswordGate title="حسابات الرواتب" hint="هذه الصفحة تحتوي رواتب الموظفين — أدخل كلمة السر للمتابعة"><PayrollPage /></PasswordGate></AdminOnlyRoute>} />
            <Route path="users"      element={<AdminOnlyRoute><UsersPage /></AdminOnlyRoute>} />
            <Route path="attendance" element={<RoleRoute roles={['admin', 'supervisor']}><AttendancePage /></RoleRoute>} />
          </Route>

          <Route path="/center-portal/login"     element={<CenterPortalLogin />} />
          <Route path="/center-portal/dashboard" element={<PrivateCenterRoute><CenterPortalDashboard /></PrivateCenterRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
