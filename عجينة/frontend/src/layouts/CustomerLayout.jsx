import { useState, useEffect, useRef } from 'react'
import { tenantHeader } from '../services/api'
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom'
import {
  Home, UtensilsCrossed, Tag, Store, Info, Package,
  MessageCircle, ShoppingBag, Clock, Phone, CheckCircle2,
  Wheat, Truck, Heart, ChefHat, Flame, Cookie,
  Instagram, Facebook, Twitter,
} from 'lucide-react'
import ComingSoonPage from '../pages/customer/ComingSoonPage'
import { useWaNumber } from '../hooks/useWaNumber'
import { useSiteSettings } from '../hooks/useSiteSettings'
import PoweredBy from '../components/common/PoweredBy'

const API_URL   = import.meta.env.VITE_API_URL  || 'http://localhost:3002/api'
/* WhatsApp number comes from Settings — see hooks/useWaNumber.js. */

const NAV_ITEMS = [
  { to: '/',        label: 'الرئيسية',    Icon: Home,            end: true },
  { to: '/menu',    label: 'المنيو',      Icon: UtensilsCrossed },
  { to: '/offers',  label: 'العروض',      Icon: Tag },
  { to: '/centers', label: 'فروعنا', Icon: Store },
  { to: '/about',   label: 'عن المطعم',   Icon: Info },
  { to: '/order',   label: 'اطلب الآن',   Icon: Package },
]

/* ── Logo ────────────────────────────────── */
function Logo({ size = 'md' }) {
  const h = size === 'sm' ? 'h-12' : 'h-16'
  return (
    <Link to="/" className="flex-shrink-0 inline-flex items-center gap-2">
      <img
        src="/logo.png"
        alt="عجينة وطحينة"
        className={`${h} w-auto object-contain`}
        draggable={false}
        loading="eager"
      />
    </Link>
  )
}

/* ── Desktop Header ──────────────────────── */
function DesktopHeader({ scrolled }) {
  const wa = useWaNumber()
  return (
    <header
      className="hidden lg:block sticky top-0 z-50 transition-all duration-500"
      style={{
        background: scrolled
          ? 'rgba(251,247,240,0.97)'
          : 'rgba(251,247,240,0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: scrolled
          ? '0 2px 28px rgba(53,32,23,0.09), 0 1px 0 rgba(231,210,183,0.7)'
          : '0 1px 0 rgba(231,210,183,0.5)',
      }}
    >
      <div className="container-custom flex items-center gap-6 h-[70px]">
        <Logo />
        <nav className="flex items-center gap-0.5 mr-2">
          {NAV_ITEMS.slice(0, 5).map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `lolis-nav-link ${isActive ? 'active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5">
          <a
            href={`https://wa.me/${wa}`}
            target="_blank" rel="noopener noreferrer"
            className="lolis-btn lolis-btn-sm lolis-btn-wa"
            style={{ background: '#25D366', fontSize: '0.85rem' }}
          >
            واتساب <MessageCircle size={15} />
          </a>
          <Link to="/order" className="lolis-btn lolis-btn-sm"
            style={{
              background: 'linear-gradient(135deg, #A96734 0%, #6F3E25 100%)',
              color: '#FBF7F0',
              fontSize: '0.9rem',
              fontWeight: 800,
              padding: '0.55rem 1.25rem',
              borderRadius: '9999px',
              boxShadow: '0 3px 14px rgba(169,103,52,0.32)',
            }}>
            اطلب الآن <ShoppingBag size={16} />
          </Link>
        </div>
      </div>
    </header>
  )
}

/* ── Mobile Header ───────────────────────── */
function MobileHeader() {
  return (
    <header
      className="lg:hidden sticky top-0 z-40 px-4 py-2.5 flex items-center justify-between"
      style={{ background: '#FFFFFF', borderBottom: '1px solid #E8D5C0', boxShadow: '0 1px 8px rgba(44,18,6,0.06)' }}
    >
      <Logo size="sm" />
      <Link to="/order" className="lolis-btn lolis-btn-sm lolis-btn-pink">
        اطلب <ShoppingBag size={15} />
      </Link>
    </header>
  )
}

const FOOTER_SECTIONS = [
  { Icon: Cookie,          label: 'المعجنات' },
  { Icon: Flame,           label: 'الخَبز الطازج' },
  { Icon: Wheat,           label: 'المكونات' },
  { Icon: Tag,             label: 'العروض الخاصة' },
  { Icon: Package,         label: 'طلبات الجملة' },
]

const SOCIALS = [
  { Icon: Instagram, href: 'https://instagram.com' },
  { Icon: Facebook,  href: 'https://facebook.com' },
  { Icon: Twitter,   href: 'https://twitter.com' },
]

/* ── Footer ──────────────────────────────── */
function Footer() {
  const waNumber = useWaNumber()
  const { instagramUrl } = useSiteSettings()
  /* The icon used to point at instagram.com itself, not the account. */
  const socials = SOCIALS.map(x => (x.Icon === Instagram && instagramUrl ? { ...x, href: instagramUrl } : x))
  return (
    <footer className="hidden lg:block text-white relative overflow-hidden"
      style={{
        backgroundColor: '#FAF5ED',
        backgroundImage: 'url(/footer.png)',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        paddingTop: '2.5rem',
      }}>
      <div className="container-custom pt-16 pb-10 relative z-10">
        <div className="grid grid-cols-12 gap-8 pb-12" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}>

          {/* Brand */}
          <div className="col-span-4 text-center flex flex-col items-center">
            <div className="mb-5">
              <img src="/logo.png" alt="عجينة وطحينة" className="h-24 w-auto object-contain" draggable={false} loading="lazy" />
            </div>
            <p className="text-sm font-medium leading-relaxed mb-5 lolis-body max-w-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
              معجنات ومكونات شهية مُحضَّرة يومياً بأجود المكونات الطازجة.
            </p>
            <div className="flex items-center justify-center gap-2.5">
              {socials.map(({ Icon, href }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <Icon size={15} style={{ color: '#ffffff' }} />
                </a>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="col-span-2">
            <h4 className="font-black text-sm mb-6 lolis-body" style={{ color: '#ffffff' }}>روابط سريعة</h4>
            <div className="space-y-3.5">
              {NAV_ITEMS.map(({ to, label, Icon, end }) => (
                <NavLink key={to} to={to} end={end}
                  className="flex items-center gap-2.5 text-sm font-medium transition-colors lolis-body group"
                  style={{ color: 'rgba(255,255,255,0.8)' }}
                >
                  <Icon size={15} strokeWidth={2} className="transition-colors" style={{ color: '#E7D2B7' }} />
                  <span className="group-hover:text-white transition-colors">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>

          {/* Our sections */}
          <div className="col-span-3">
            <h4 className="font-black text-sm mb-6 lolis-body" style={{ color: '#ffffff' }}>أقسامنا</h4>
            <div className="space-y-3.5">
              {FOOTER_SECTIONS.map(({ Icon, label }) => (
                <div key={label} className="flex items-center gap-2.5 text-sm font-medium lolis-body cursor-default"
                  style={{ color: 'rgba(255,255,255,0.8)' }}>
                  <Icon size={15} strokeWidth={2} style={{ color: '#E7D2B7' }} /> {label}
                </div>
              ))}
            </div>
          </div>

          {/* Hours + Contact */}
          <div className="col-span-3">
            <h4 className="font-black text-sm mb-6 lolis-body flex items-center gap-2" style={{ color: '#ffffff' }}>
              <Clock size={15} /> أوقات العمل
            </h4>
            <div className="space-y-4 mb-6">
              {[['السبت – الخميس', '9:00 م – 11:00 م'], ['الجمعة', '2:00 م – 11:00 م']].map(([day, time]) => (
                <div key={day} className="flex items-center justify-between text-sm">
                  <span className="font-medium lolis-body" style={{ color: 'rgba(255,255,255,0.75)' }}>{day}</span>
                  <span className="font-black lolis-body flex items-center gap-1.5" style={{ color: '#ffffff' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#25D366' }} /> {time}
                  </span>
                </div>
              ))}
            </div>
            <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between p-4 rounded-2xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <div>
                <div className="text-xs font-medium lolis-body mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>تواصل معنا</div>
                <div className="font-black text-sm lolis-body" dir="ltr" style={{ color: '#ffffff' }}>
                  +{waNumber.replace(/(\d{3})(?=\d)/g, '$1 ')}
                </div>
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(37,211,102,0.2)' }}>
                <MessageCircle size={17} style={{ color: '#25D366' }} />
              </div>
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 flex items-center justify-between text-xs font-medium lolis-body" style={{ color: 'rgba(255,255,255,0.6)' }}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#25D366' }} />
            متاح الآن للطلبات
          </div>
          <div>© {new Date().getFullYear()} عجينة وطحينة — جميع الحقوق محفوظة</div>
        </div>
        <PoweredBy className="pt-4 text-center lolis-body" style={{ color: 'rgba(255,255,255,0.55)' }} />
      </div>
    </footer>
  )
}

/* ── Mobile Bottom Nav ───────────────────── */
function MobileNav() {
  const location = useLocation()
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40"
      style={{
        background: 'rgba(251,247,240,0.97)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(231,210,183,0.7)',
        boxShadow: '0 -4px 24px rgba(53,32,23,0.07)',
      }}
    >
      <div className="flex justify-around items-center px-1 pt-1.5 pb-5 max-w-[500px] mx-auto">
        {NAV_ITEMS.map(({ to, label, Icon, end }) => {
          const isActive = end
            ? location.pathname === to
            : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-2xl transition-all duration-200"
              style={{ color: isActive ? '#352017' : '#A09080' }}
            >
              <span
                className="w-11 h-8 flex items-center justify-center rounded-xl transition-all duration-250"
                style={{
                  background: isActive ? 'rgba(169,103,52,0.12)' : 'transparent',
                  transform: isActive ? 'scale(1.08) translateY(-2px)' : 'scale(1)',
                }}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8}
                  style={{ color: isActive ? '#A96734' : '#A09080' }}
                />
              </span>
              <span className="text-[9px] font-bold lolis-body leading-none"
                style={{ color: isActive ? '#352017' : '#A09080' }}>
                {label.split(' ')[0]}
              </span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

/* ── Page Hero (non-home pages) ─────────── */
const PAGE_TITLES = {
  '/menu':    'المنيو',
  '/offers':  'العروض',
  '/centers': 'فروعنا',
  '/about':   'عن المطعم',
  '/order':   'اطلب الآن',
}

function PageHero({ pathname }) {
  const isHome = pathname === '/'
  if (isHome) return null

  const base = Object.keys(PAGE_TITLES).find(k => pathname === k || pathname.startsWith(k + '/'))
  const title = PAGE_TITLES[base] || ''

  return (
    <div className="relative overflow-hidden"
      style={{
        backgroundImage: 'url(/hero-all.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        minHeight: '361px',
      }}>

      {/* Wheat decorations */}
      <img src="/wheat-left.png" alt="" aria-hidden="true" loading="lazy"
        className="absolute bottom-0 left-0 select-none pointer-events-none opacity-40"
        style={{ width: 'clamp(60px, 8vw, 120px)' }} />
      <img src="/wheat-right.png" alt="" aria-hidden="true" loading="lazy"
        className="absolute bottom-0 right-0 select-none pointer-events-none opacity-40"
        style={{ width: 'clamp(60px, 8vw, 120px)' }} />

      <div className="relative z-10 container-custom flex flex-col items-center justify-center text-center"
        style={{ minHeight: '361px' }}>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4 text-xs font-medium lolis-body"
          style={{ color: 'rgba(53,32,23,0.55)' }}>
          <span>الرئيسية</span>
          <span style={{ color: 'rgba(53,32,23,0.35)' }}>←</span>
          <span style={{ color: '#6F3E25' }}>{title}</span>
        </div>

        {title && (
          <h1 className="lolis-heading text-4xl lg:text-5xl mb-4"
            style={{ color: '#352017', lineHeight: 1.3 }}>
            {title}
          </h1>
        )}

        {/* Ornament */}
        <div className="flex items-center gap-3">
          <div className="h-px w-12" style={{ background: 'rgba(53,32,23,0.2)' }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ background: '#A96734' }} />
          <div className="h-px w-12" style={{ background: 'rgba(53,32,23,0.2)' }} />
        </div>
      </div>
    </div>
  )
}

/* ── Page fade ───────────────────────────── */
function PageFade({ children, pathname }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(8px)'
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.22s ease, transform 0.22s ease'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    })
  }, [pathname])
  return <div ref={ref}>{children}</div>
}

/* ── Main Layout ─────────────────────────── */
export default function CustomerLayout() {
  const wa = useWaNumber()
  const location = useLocation()
  const [scrolled, setScrolled]     = useState(false)
  const [comingSoon, setComingSoon] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    fetch(`${API_URL}/site-settings`, { headers: tenantHeader })
      .then(r => r.json())
      .then(d => {
        if (d.settings?.comingSoonEnabled) setComingSoon(true)
      })
      .catch(() => {})
  }, [])

  if (comingSoon) return <ComingSoonPage />

  return (
    <div className="min-h-screen" style={{ background: '#FAF5ED', direction: 'rtl' }}>
      <DesktopHeader scrolled={scrolled} />
      <MobileHeader />

      <main className="pb-28 lg:pb-0">
        <PageHero pathname={location.pathname} />
        <PageFade pathname={location.pathname}>
          <Outlet />
        </PageFade>
        <PoweredBy className="lg:hidden pt-6 pb-2 text-center lolis-body" style={{ color: '#8E7967' }} />
      </main>

      <Footer />
      <MobileNav />

      {/* WhatsApp FAB */}
      <a
        href={`https://wa.me/${wa}`}
        target="_blank" rel="noopener noreferrer"
        title="تواصل معنا على واتساب"
        className="lg:hidden fixed bottom-[5.5rem] left-4 w-[52px] h-[52px] rounded-full flex items-center justify-center text-white z-50"
        style={{
          background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
          animation: 'ajPulse 2.8s ease-in-out infinite',
          boxShadow: '0 4px 20px rgba(37,211,102,0.5), 0 2px 8px rgba(0,0,0,0.12)',
        }}
      >
        <MessageCircle size={24} strokeWidth={2.2} />
      </a>
    </div>
  )
}
