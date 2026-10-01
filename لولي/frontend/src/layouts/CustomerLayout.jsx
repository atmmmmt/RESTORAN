import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import {
  ArrowLeft,
  Clock3,
  Download,
  Heart,
  Home,
  MapPin,
  Menu,
  Package,
  ShoppingBag,
  Store,
  Tag,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import ComingSoonPage from '../pages/customer/ComingSoonPage'
import WhatsAppIcon from '../components/common/WhatsAppIcon'
import { tenantHeader } from '../services/api'
import { usePwaInstall } from '../hooks/usePwaInstall'
import { useCart } from '../context/CartContext'
import { formatCurrency } from '../utils/formatters'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'
const WA_NUMBER = import.meta.env.VITE_WA_NUMBER || '963XXXXXXXXX'

const NAV_ITEMS = [
  { to: '/', label: 'الرئيسية', Icon: Home, end: true },
  { to: '/menu', label: 'المنيو', Icon: UtensilsCrossed },
  { to: '/offers', label: 'العروض', Icon: Tag },
  { to: '/centers', label: 'مراكز البيع', Icon: Store },
  { to: '/about', label: 'عن لوليز', Icon: Heart },
]

/* The app-style tab bar shown at the bottom of the screen on mobile —
   a smaller, action-oriented subset of NAV_ITEMS with "اطلب" pinned as
   the raised, primary tab in the middle. */
const TAB_ITEMS = [
  { to: '/', label: 'الرئيسية', Icon: Home, end: true },
  { to: '/menu', label: 'المنيو', Icon: UtensilsCrossed },
  { to: '/order', label: 'اطلب', Icon: ShoppingBag, primary: true },
  { to: '/offers', label: 'العروض', Icon: Tag },
  { to: '/centers', label: 'المراكز', Icon: Store },
]

/* Mobile-only install card: floats in from the bottom once the browser says
   the site can be installed (or on iPhone, where it can only be added by hand).
   Tapping it installs / shows the steps; tapping ✕ or installing hides it —
   remembered so it doesn't nag on every visit. */
const INSTALL_DISMISS_KEY = 'luliz_install_dismissed'

function InstallPrompt() {
  const { canInstall, isIos, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(INSTALL_DISMISS_KEY) === '1' } catch { return false }
  })
  const [iosSteps, setIosSteps] = useState(false)

  const hide = () => {
    setDismissed(true)
    try { localStorage.setItem(INSTALL_DISMISS_KEY, '1') } catch { /* private mode */ }
  }

  const open = async () => {
    if (canInstall) { await promptInstall(); hide() }
    else setIosSteps(true)
  }

  const visible = !dismissed && (canInstall || isIos)

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="site-install-card"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.3, delay: 0.8 }}
          role="dialog"
          aria-label="ثبّت تطبيق لوليز"
        >
          <button type="button" className="site-install-card-close" onClick={hide} aria-label="إغلاق"><X size={16} /></button>
          <button type="button" className="site-install-card-body" onClick={iosSteps ? hide : open}>
            <img src="/brand/luliz-logo-round.png" alt="" />
            <span>
              <b>ثبّت تطبيق لوليز</b>
              <small>{iosSteps ? 'من سفاري: زر المشاركة ← إضافة إلى الشاشة الرئيسية' : 'اطلب أسرع — بضغطة من شاشتك الرئيسية'}</small>
            </span>
            {!iosSteps && <span className="site-install-card-cta"><Download size={16} /> تثبيت</span>}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* Floating "sticky cart" pill — mobile only (see CSS), shown whenever the
   cart has items so it's never a mystery where the cart went. Sits just
   above the bottom tab bar and jumps straight to checkout. */
function FloatingCartBar() {
  const { totalCount, totalPrice } = useCart()
  const location = useLocation()

  if (totalCount === 0 || location.pathname === '/order') return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.18 }}
        className="site-floating-cart-wrap"
      >
        <Link to="/order" className="site-floating-cart">
          <span className="site-floating-cart-icon">
            <ShoppingBag size={18} />
            <span className="site-cart-badge">{totalCount > 9 ? '9+' : totalCount}</span>
          </span>
          <span className="site-floating-cart-text">عرض السلة</span>
          <span className="site-floating-cart-total">{formatCurrency(totalPrice)}</span>
        </Link>
      </motion.div>
    </AnimatePresence>
  )
}

function BottomTabBar() {
  const { totalCount } = useCart()
  return (
    <nav className="site-bottom-tabs" aria-label="التنقل السريع">
      {TAB_ITEMS.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `site-bottom-tab ${item.primary ? 'is-primary' : ''} ${isActive ? 'is-active' : ''}`}
        >
          <span className="site-bottom-tab-icon">
            <item.Icon size={item.primary ? 22 : 20} />
            {item.to === '/order' && totalCount > 0 && (
              <span className="site-cart-badge">{totalCount > 9 ? '9+' : totalCount}</span>
            )}
          </span>
          <span className="site-bottom-tab-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function LolisLogo({ variant = 'banner' }) {
  if (variant === 'banner') {
    return (
      <Link to="/" className="site-brand site-brand-banner" aria-label="العودة إلى الصفحة الرئيسية">
        <img src="/images/header-logo.png" alt="لوليز — نكهة وأصول" draggable={false} />
      </Link>
    )
  }
  return (
    <Link to="/" className="site-brand" aria-label="العودة إلى الصفحة الرئيسية">
      <img src="/brand/luliz-logo-round.png" alt="" width="52" height="52" draggable={false} />
      <span>
        <b>لوليز</b>
        <small>نكهة وأصول</small>
      </span>
    </Link>
  )
}

function DesktopHeader({ scrolled }) {
  const { totalCount } = useCart()
  return (
    <header className={`site-header site-header-desktop ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="site-shell site-header-row">
        <LolisLogo />

        <nav className="site-nav" aria-label="التنقل الرئيسي">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => isActive ? 'is-active' : ''}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-header-actions">
          <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="site-wa-link">
            <WhatsAppIcon size={17} /> تواصل معنا
          </a>
          <Link to="/order" className="site-order-link">
            اطلب الآن
            <span className="site-order-link-icon">
              <ShoppingBag size={17} />
              {totalCount > 0 && <span className="site-cart-badge">{totalCount > 9 ? '9+' : totalCount}</span>}
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}

function MobileHeader({ open, setOpen }) {
  const { totalCount } = useCart()
  return (
    <header className="site-header site-header-mobile">
      <div className="site-mobile-row">
        <button
          type="button"
          className="site-menu-button"
          aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen(value => !value)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>

        <LolisLogo />

        <Link to="/order" className="site-mobile-order" aria-label="اطلب الآن">
          <span className="site-order-link-icon">
            <Package size={19} />
            {totalCount > 0 && <span className="site-cart-badge">{totalCount > 9 ? '9+' : totalCount}</span>}
          </span>
          <span className="site-mobile-order-label">اطلب</span>
        </Link>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-navigation"
            className="site-mobile-panel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <nav aria-label="التنقل على الجوال">
              {NAV_ITEMS.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => isActive ? 'is-active' : ''}
                >
                  <item.Icon size={19} />
                  <span>{item.label}</span>
                  <ArrowLeft size={16} />
                </NavLink>
              ))}
            </nav>
            <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="site-mobile-wa">
              <WhatsAppIcon size={19} /> احكوا معنا على واتساب
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-shell site-footer-grid">
        <div className="site-footer-brand">
          <LolisLogo variant="circle" />
          <p>أكل بيتي بطعم أصيل، نجهّزه بعناية ونوصله بمحبة.</p>
          <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon size={17} /> راسلونا على واتساب
          </a>
        </div>

        <div className="site-footer-column">
          <h2>روابط سريعة</h2>
          <nav aria-label="روابط التذييل">
            {NAV_ITEMS.slice(0, 4).map(item => <Link to={item.to} key={item.to}>{item.label}</Link>)}
            <Link to="/order">اطلب الآن</Link>
          </nav>
        </div>

        <div className="site-footer-column">
          <h2>ساعات العمل</h2>
          <p><Clock3 size={17} /><span>السبت – الخميس<br /><b>9 صباحًا – 9 مساءً</b></span></p>
          <p><Clock3 size={17} /><span>الجمعة<br /><b>2 ظهرًا – 9 مساءً</b></span></p>
        </div>

        <div className="site-footer-column">
          <h2>تلاقونا</h2>
          <p><MapPin size={17} /><span>دمشق، سوريا<br /><b>توصيل ومراكز بيع</b></span></p>
          <Link to="/centers" className="site-footer-inline">شوفوا مراكز البيع <ArrowLeft size={15} /></Link>
        </div>
      </div>

      <div className="site-shell site-footer-bottom">
        <span>© {new Date().getFullYear()} لوليز. جميع الحقوق محفوظة.</span>
        <span>
          صمم وطور من قبل{' '}
          <a href="https://prootech-agency.com/" target="_blank" rel="noopener noreferrer">
            Prootech Agency
          </a>
        </span>
      </div>
    </footer>
  )
}

export default function CustomerLayout() {
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [comingSoon, setComingSoon] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  useEffect(() => {
    fetch(`${API_URL}/site-settings`, { headers: tenantHeader })
      .then(response => response.json())
      .then(data => { if (data.settings?.comingSoonEnabled) setComingSoon(true) })
      .catch(() => {})
  }, [])

  if (comingSoon) return <ComingSoonPage />

  return (
    <MotionConfig reducedMotion="user">
      <div className="site-frame" dir="rtl">
        <a className="site-skip-link" href="#main-content">تخطّي إلى المحتوى</a>
        <DesktopHeader scrolled={scrolled} />
        <MobileHeader open={mobileOpen} setOpen={setMobileOpen} />

        <main id="main-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        <SiteFooter />

        <a
          href={`https://wa.me/${WA_NUMBER}`}
          target="_blank"
          rel="noopener noreferrer"
          className="site-whatsapp-fab"
          aria-label="تواصل معنا على واتساب"
        >
          <WhatsAppIcon size={25} />
        </a>

        <InstallPrompt />
        <FloatingCartBar />
        <BottomTabBar />
      </div>
    </MotionConfig>
  )
}
