import { useEffect, useState } from 'react'
import { tenantHeader } from '../../services/api'
import { Link } from 'react-router-dom'
import {
  ChefHat, Wheat, Truck, Heart, CheckCircle2, ArrowLeft,
  MessageCircle, ShoppingBag, UtensilsCrossed, Tag, Star, Flame, Sparkles,
  BadgeCheck,
} from 'lucide-react'
import { productsAPI, offersAPI } from '../../services/api'
import { formatCurrency, calcDiscountedPrice, isImageUrl } from '../../utils/formatters'
import { swr } from '../../utils/cache'
import InstagramFeed  from '../../components/customer/InstagramFeed'
import ReviewsSection from '../../components/customer/ReviewsSection'
import CentersSection from '../../components/customer/CentersSection'

import { useWaNumber } from '../../hooks/useWaNumber'

const IMG = {
  hero:   'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=900&q=80&auto=format&fit=crop',
  baking: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=700&q=70&auto=format&fit=crop',
  dough:  'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=700&q=70&auto=format&fit=crop',
  tahini: 'https://images.unsplash.com/photo-1514190051997-0f6f39ca5cde?w=700&q=70&auto=format&fit=crop',
}

/* ── SVG Decorations ──────────────────── */
function RollingPinSVG({ size = 80, opacity = 0.15 }) {
  return (
    <svg width={size * 2.8} height={size} viewBox="0 0 224 80" fill="none" style={{ opacity }}>
      <rect x="2" y="28" width="220" height="24" rx="12" stroke="currentColor" strokeWidth="2.5" />
      <rect x="0" y="20" width="28" height="40" rx="10" stroke="currentColor" strokeWidth="2.5" />
      <rect x="196" y="20" width="28" height="40" rx="10" stroke="currentColor" strokeWidth="2.5" />
      <line x1="60" y1="30" x2="60" y2="50" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 4" />
      <line x1="100" y1="30" x2="100" y2="50" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 4" />
      <line x1="140" y1="30" x2="140" y2="50" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 4" />
      <line x1="180" y1="30" x2="180" y2="50" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 4" />
    </svg>
  )
}

function SesamePatternSVG() {
  const seeds = [
    [20,15,30], [55,40,60], [90,20,45], [35,65,20], [70,85,55],
    [120,30,15], [150,55,70], [180,25,35], [200,70,50], [100,75,25],
  ]
  return (
    <svg width="240" height="120" viewBox="0 0 240 120" fill="none" style={{ opacity: 0.18 }}>
      {seeds.map(([cx, cy, rot]) => (
        <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="6" ry="2.5"
          fill="currentColor" transform={`rotate(${rot} ${cx} ${cy})`} />
      ))}
    </svg>
  )
}

function DoughWaveSVG({ fill = '#FDF4EA' }) {
  return (
    <svg viewBox="0 0 1440 72" fill="none" preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height: '72px' }}>
      <path
        d="M0,72 L0,28 C180,8 360,0 540,8 C720,16 900,36 1080,36 C1260,36 1350,16 1440,8 L1440,72 Z"
        fill={fill}
      />
    </svg>
  )
}

/* ── Skeleton ─────────────────────────── */
function SkeletonCard() {
  const sh = {
    background: 'linear-gradient(90deg,#EDE0CE 25%,#F6EDDF 50%,#EDE0CE 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.6s infinite'
  }
  return (
    <div className="lolis-card bg-white overflow-hidden">
      <div className="h-44" style={sh} />
      <div className="p-5 space-y-3">
        <div className="h-4 rounded-xl" style={sh} />
        <div className="h-3 rounded-xl w-3/4" style={sh} />
        <div className="h-9 rounded-full mt-4" style={sh} />
      </div>
    </div>
  )
}

/* ── Product card ─────────────────────── */
function ProductCard({ p, index = 0 }) {
  return (
    <Link
      to={`/menu/${p._id}`}
      className="block h-full group"
      style={{ opacity: 0, animation: `homeFadeUp 0.45s ease-out ${Math.min(index, 6) * 70}ms forwards` }}
    >
      <div className="h-full flex flex-col bg-white rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1.5"
        style={{ boxShadow: '0 2px 16px rgba(53,32,23,0.07)', border: '1px solid rgba(231,210,183,0.5)' }}>
        <div className="relative overflow-hidden h-44" style={{ background: '#EDE0CE' }}>
          <img
            src={isImageUrl(p.image) ? p.image : IMG.dough}
            alt={p.name} loading="lazy" decoding="async"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ background: 'linear-gradient(180deg,transparent 50%,rgba(53,32,23,0.2) 100%)' }} />
          <div className="absolute top-3 right-3 flex flex-col gap-1.5">
            {p.activeOffer && <span className="lolis-badge-offer">خصم</span>}
            <span className={p.availableQuantity > 0 ? 'lolis-badge-available' : 'lolis-badge-soldout'}>
              {p.availableQuantity > 0 ? 'متاح' : 'نفدت'}
            </span>
          </div>
          {p.category && (
            <div className="absolute bottom-3 left-3">
              <span className="lolis-chip lolis-chip-pink text-[10px]">{p.category}</span>
            </div>
          )}
        </div>

        <div className="p-5 flex flex-col flex-1">
          <h3 className="font-bold text-base mb-1.5 line-clamp-1 transition-colors lolis-body group-hover:text-[#A96734]"
            style={{ color: '#27201C' }}>
            {p.name}
          </h3>
          {p.description && (
            <p className="text-xs font-medium line-clamp-2 leading-relaxed mb-3 lolis-body" style={{ color: '#6B5A4A' }}>
              {p.description}
            </p>
          )}
          <div className="mt-auto pt-3" style={{ borderTop: '1px solid #E7D2B7' }}>
            <div className="flex items-center justify-between mb-3">
              {p.activeOffer ? (
                <div>
                  <div className="text-xs line-through lolis-body" style={{ color: '#A09080' }}>{formatCurrency(p.directPrice)}</div>
                  <div className="text-lg font-black lolis-body" style={{ color: '#A96734' }}>{formatCurrency(p.discountedPrice)}</div>
                </div>
              ) : (
                <div className="text-lg font-black lolis-body" style={{ color: '#A96734' }}>{formatCurrency(p.directPrice)}</div>
              )}
            </div>
            <div className="lolis-btn lolis-btn-sm w-full"
              style={{
                background: 'linear-gradient(135deg, #A96734 0%, #6F3E25 100%)',
                color: '#FBF7F0',
                borderRadius: '12px',
                fontWeight: 700,
              }}>
              اطلب الآن <ArrowLeft size={14} />
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

/* ── HERO ─────────────────────────────── */
function HeroSection({ heroImage }) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        backgroundColor: '#352017',
        backgroundImage: 'linear-gradient(150deg, rgba(53,32,23,0.75) 0%, rgba(74,42,20,0.7) 45%, rgba(111,62,37,0.75) 100%), url(/hero-back.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        minHeight: '88vh',
      }}
    >
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Top-left ring */}
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full"
          style={{ border: '80px solid rgba(169,103,52,0.07)' }} />
        {/* Bottom-right ring */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full"
          style={{ border: '60px solid rgba(231,210,183,0.05)' }} />
        {/* Rolling pin decoration top */}
        <div className="absolute top-8 right-8 lg:right-16"
          style={{ color: '#E7D2B7', animation: 'ajSway 8s ease-in-out infinite' }}>
          <RollingPinSVG size={36} opacity={0.12} />
        </div>
        {/* Sesame seeds cluster bottom-left */}
        <div className="absolute bottom-16 left-8 lg:left-24"
          style={{ color: '#A96734', animation: 'ajFloat 6s ease-in-out infinite' }}>
          <SesamePatternSVG />
        </div>
        {/* Flour particles */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="absolute w-1.5 h-1.5 rounded-full"
            style={{
              background: 'rgba(231,210,183,0.4)',
              top: `${15 + i * 12}%`,
              left: `${5 + i * 8}%`,
              animation: `ajFloat ${3 + i * 0.7}s ease-in-out ${i * 0.5}s infinite`,
            }}
          />
        ))}
      </div>

      <div className="container-custom relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center py-12 lg:py-20">

          {/* Image column */}
          <div className="order-1 lg:order-2 flex items-center justify-center"
            style={{ opacity: 0, animation: 'homeFadeUp 0.65s ease-out 0.18s forwards' }}>
            <div className="relative">
              {/* Main image with organic frame */}
              <div className="relative w-64 h-72 lg:w-[420px] lg:h-[480px]">
                <div className="absolute inset-0 overflow-hidden"
                  style={{
                    borderRadius: '40% 60% 55% 45% / 45% 40% 60% 55%',
                    boxShadow: '0 0 0 1px rgba(231,210,183,0.12), 0 32px 80px rgba(0,0,0,0.5)',
                  }}>
                  <img
                    src={heroImage || IMG.hero}
                    alt="عجينة وطحينة — معجنات طازجة"
                    className="w-full h-full object-cover select-none"
                    draggable={false}
                    fetchpriority="high"
                    style={{ transform: 'scale(1.06)' }}
                  />
                  <div className="absolute inset-0"
                    style={{ background: 'linear-gradient(180deg, transparent 60%, rgba(53,32,23,0.35) 100%)' }} />
                </div>

                {/* Gold ring accent behind image */}
                <div className="absolute -inset-2 -z-10 opacity-20"
                  style={{
                    borderRadius: '42% 58% 52% 48% / 48% 42% 58% 52%',
                    border: '2px solid #E7D2B7',
                  }} />
              </div>

              {/* Fresh badge */}
              <div
                className="absolute -bottom-4 -right-2 lg:-bottom-6 lg:-right-8 bg-white rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-2.5"
                style={{ animation: 'heroFloat 5s ease-in-out 0.5s infinite' }}
              >
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: '#FBF7F0' }}>
                  <Wheat size={17} style={{ color: '#A96734' }} />
                </span>
                <div>
                  <div className="text-xs font-black lolis-body" style={{ color: '#352017' }}>طازج يومياً</div>
                  <div className="text-[10px] font-medium lolis-body" style={{ color: '#A09080' }}>من الفرن مباشرة</div>
                </div>
              </div>

              {/* Stars badge */}
              <div
                className="absolute -top-2 -left-2 lg:-top-4 lg:-left-10 px-3.5 py-2.5 rounded-2xl shadow-xl flex items-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, #A96734, #6F3E25)',
                  animation: 'heroFloat 5s ease-in-out 1s infinite',
                }}
              >
                <Star size={13} fill="#E7D2B7" style={{ color: '#E7D2B7' }} />
                <span className="text-xs font-black lolis-body" style={{ color: '#FBF7F0' }}>5.0 تقييم</span>
              </div>
            </div>
          </div>

          {/* Text column */}
          <div className="order-2 lg:order-1 text-center lg:text-right"
            style={{ opacity: 0, animation: 'homeFadeUp 0.6s ease-out forwards' }}>

            {/* Availability pill */}
            <div className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full mb-6 lolis-body"
              style={{
                background: 'rgba(169,103,52,0.18)',
                border: '1px solid rgba(169,103,52,0.4)',
                color: '#E7D2B7',
              }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
                style={{ background: '#A96734' }} />
              من قلب حلب إلى مائدتكم
            </div>

            {/* Main headline */}
            <h1 className="lolis-heading text-white mb-5"
              style={{ fontSize: 'clamp(2.2rem, 4.5vw, 3.8rem)', lineHeight: 1.3 }}>
              من عجينة بسيطة<br />
              <span style={{ color: '#E7D2B7' }}>نصنع نكهة لا تُنسى</span>
            </h1>

            {/* Slogan */}
            <div className="mb-7 flex justify-center lg:justify-start">
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full lolis-body font-black"
                style={{
                  background: 'rgba(169,103,52,0.22)',
                  border: '1.5px solid rgba(169,103,52,0.5)',
                  color: '#E7D2B7',
                  fontSize: '1rem',
                  letterSpacing: '0.01em',
                }}>
                <Heart size={15} fill="rgba(231,210,183,0.6)" style={{ color: 'rgba(231,210,183,0.6)' }} />
                منكبر بمحبتكم
                <Heart size={15} fill="rgba(231,210,183,0.6)" style={{ color: 'rgba(231,210,183,0.6)' }} />
              </div>
            </div>

            <p className="hidden lg:block font-medium text-base mb-10 leading-relaxed max-w-[30rem] lolis-body"
              style={{ color: 'rgba(231,210,183,0.65)' }}>
              نحضّر عجينتنا يومياً، ونختار مكوناتنا بعناية، لنقدّم لكم معجنات طازجة بطعم حلبي أصيل، تصل من الفرن مباشرة إلى مائدتكم.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-3 mb-8">
              <Link to="/menu" className="lolis-btn lolis-btn-lg"
                style={{
                  background: 'linear-gradient(135deg, #A96734 0%, #6F3E25 100%)',
                  color: '#FBF7F0',
                  fontWeight: 800,
                  boxShadow: '0 6px 24px rgba(169,103,52,0.4)',
                }}>
                تصفّح المنيو <UtensilsCrossed size={18} />
              </Link>
              <Link to="/order" className="lolis-btn lolis-btn-lg"
                style={{
                  background: 'rgba(231,210,183,0.1)',
                  color: '#E7D2B7',
                  border: '1.5px solid rgba(231,210,183,0.3)',
                  backdropFilter: 'blur(8px)',
                }}>
                اطلب الآن <ShoppingBag size={18} />
              </Link>
            </div>

          </div>
        </div>
      </div>

      {/* Dough wave divider */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <DoughWaveSVG fill="#FDF4EA" />
      </div>
    </section>
  )
}

/* ── Why Us Section ───────────────────── */
const WHY_FEATURES = [
  {
    img: '/icon-wheat.png',
    title: 'مكونات طازجة يومياً',
    desc: 'نختار أجود أنواع الطحين والزيت والبهارات كل صباح لضمان طعم لا يُنسى.',
  },
  {
    img: '/icon-chef.png',
    title: 'وصفات عائلية أصيلة',
    desc: 'أسرار العجين والخبز متوارثة جيلاً بعد جيل — نحافظ عليها ونضيف إليها لمستنا.',
  },
  {
    img: '/icon-badge.png',
    title: 'جودة مضمونة دائماً',
    desc: 'كل قطعة تخرج من مطعمنا تمرّ بمعايير جودة صارمة لأن رضاكم خطّنا الأحمر.',
  },
  {
    img: '/icon-truck.png',
    title: 'توصيل سريع وطازج',
    desc: 'نوصّل طلبك بأسرع وقت ممكن حتى تصل المعجنات ساخنة وطازجة لباب بيتك.',
  },
]

function WhyUsSection() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-28"
      style={{
        backgroundImage: 'url(/background-who.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#FDF4EA',
      }}>

      {/* Decoration images — sides */}
      <img src="/wheat-left.png" alt="" aria-hidden="true" loading="lazy"
        className="absolute top-1/2 left-0 -translate-y-1/2 select-none pointer-events-none"
        style={{ width: 'clamp(80px, 10vw, 160px)', opacity: 0.55 }} />
      <img src="/wheat-right.png" alt="" aria-hidden="true" loading="lazy"
        className="absolute top-1/2 right-0 -translate-y-1/2 select-none pointer-events-none"
        style={{ width: 'clamp(80px, 10vw, 160px)', opacity: 0.55 }} />

      {/* Decoration images — corners */}
      <img src="/flour-sack.png" alt="" aria-hidden="true" loading="lazy"
        className="absolute bottom-0 left-4 select-none pointer-events-none"
        style={{ width: 'clamp(70px, 8vw, 130px)', opacity: 0.5 }} />
      <img src="/bread-basket.png" alt="" aria-hidden="true" loading="lazy"
        className="absolute bottom-0 right-4 select-none pointer-events-none"
        style={{ width: 'clamp(70px, 8vw, 130px)', opacity: 0.5 }} />

      <div className="container-custom relative z-10">
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2.5 mb-4">
            <Wheat size={15} style={{ color: '#A96734' }} />
            <span className="font-bold text-sm lolis-body" style={{ color: '#A96734', letterSpacing: '0.1em' }}>مميزاتنا</span>
            <Wheat size={15} style={{ color: '#A96734' }} />
          </div>

          {/* Ornament */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px flex-1 max-w-[70px]" style={{ background: 'rgba(169,103,52,0.35)' }} />
            <div className="w-2 h-2 rotate-45" style={{ background: '#A96734' }} />
            <div className="h-px flex-1 max-w-[70px]" style={{ background: 'rgba(169,103,52,0.35)' }} />
          </div>

          <h2 className="lolis-heading text-3xl lg:text-5xl mb-4" style={{ color: '#27201C', lineHeight: 1.35 }}>
            لماذا يختارنا عملاؤنا؟
          </h2>
          <p className="font-medium text-sm lg:text-base lolis-body max-w-md mx-auto" style={{ color: '#6B5A4A' }}>
            نهتم بكل تفصيل، من اختيار المكونات وحتى وصول الطلب إليكم طازجاً وشهياً.
          </p>
        </div>

        {/* Cards 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {WHY_FEATURES.map(({ img, title, desc }, i) => (
            <div key={title}
              className="group flex items-center gap-5 rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1"
              style={{
                background: 'rgba(255,255,255,0.82)',
                border: '1px solid rgba(231,210,183,0.7)',
                boxShadow: '0 4px 20px rgba(53,32,23,0.06)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                opacity: 0,
                animation: `homeFadeUp 0.5s ease-out ${i * 90}ms forwards`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 12px 36px rgba(169,103,52,0.15)'
                e.currentTarget.style.borderColor = 'rgba(169,103,52,0.4)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(53,32,23,0.06)'
                e.currentTarget.style.borderColor = 'rgba(231,210,183,0.7)'
              }}
            >
              {/* Icon circle */}
              <div className="flex-shrink-0">
                <div className="w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
                  style={{
                    background: 'rgba(231,210,183,0.45)',
                    border: '1.5px solid rgba(169,103,52,0.2)',
                    boxShadow: '0 4px 16px rgba(169,103,52,0.1)',
                  }}>
                  <img src={img} alt={title} loading="lazy" draggable={false}
                    className="w-20 h-20 object-contain select-none" />
                </div>
              </div>

              {/* Text */}
              <div className="flex-1 text-right">
                <h3 className="font-black text-base mb-2 lolis-body" style={{ color: '#27201C' }}>{title}</h3>
                <p className="text-xs font-medium leading-relaxed lolis-body" style={{ color: '#6B5A4A' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Today's Menu ─────────────────────── */
function TodayMenu({ products, loading }) {
  return (
    <section className="py-14 lg:py-16" style={{ background: '#ffffff' }}>
      <div className="container-custom">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-xs font-semibold mb-2 lolis-body" style={{ color: '#A96734', letterSpacing: '0.06em' }}>
              — الأصناف اليومية
            </div>
            <h2 className="lolis-heading text-3xl lg:text-4xl mb-1" style={{ color: '#27201C' }}>منيو اليوم</h2>
            <p className="font-medium text-sm lolis-body" style={{ color: '#6B5A4A' }}>مخبوز طازج — مُحضَّر هذا الصباح</p>
          </div>
          <Link to="/menu" className="lolis-btn lolis-btn-sm"
            style={{
              background: 'transparent',
              color: '#A96734',
              border: '1.5px solid #E7D2B7',
              fontWeight: 700,
              padding: '0.5rem 1rem',
              borderRadius: '9999px',
            }}>
            عرض الكل <ArrowLeft size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(169,103,52,0.08)' }}>
              <UtensilsCrossed size={28} style={{ color: '#A96734' }} />
            </div>
            <div className="font-bold text-xl lolis-body" style={{ color: '#6B5A4A' }}>لا توجد أصناف اليوم</div>
            <div className="text-sm font-medium mt-2 lolis-body" style={{ color: '#A09080' }}>تابعونا قريباً</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.slice(0, 6).map((p, i) => <ProductCard key={p._id} p={p} index={i} />)}
          </div>
        )}

        {products.length > 6 && (
          <div className="text-center mt-8">
            <Link to="/menu" className="lolis-btn lolis-btn-md"
              style={{
                background: 'linear-gradient(135deg, #A96734 0%, #6F3E25 100%)',
                color: '#FBF7F0',
                fontWeight: 800,
              }}>
              المنيو كاملاً <ArrowLeft size={15} />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

/* ── Offers ───────────────────────────── */
function OffersStrip({ offers }) {
  if (!offers.length) return null
  return (
    <section className="py-14 lg:py-16 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #A96734 0%, #6F3E25 100%)' }}>
      {/* Decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full opacity-10"
          style={{ border: '50px solid #E7D2B7' }} />
      </div>
      <div className="container-custom relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="lolis-heading text-3xl lg:text-4xl mb-1" style={{ color: '#FBF7F0' }}>عروض اليوم</h2>
            <p className="font-medium text-sm lolis-body" style={{ color: 'rgba(251,247,240,0.7)' }}>عروض محدودة — لا تفوّتها</p>
          </div>
          <Link to="/offers" className="lolis-btn lolis-btn-sm"
            style={{ background: '#352017', color: '#E7D2B7', fontWeight: 700 }}>
            كل العروض <ArrowLeft size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {offers.slice(0, 4).map(offer => {
            const prod = offer.productId
            const dp = prod ? calcDiscountedPrice(prod.directPrice, offer) : 0
            return (
              <div key={offer._id} className="bg-white rounded-3xl overflow-hidden"
                style={{ boxShadow: '0 4px 20px rgba(53,32,23,0.2)' }}>
                <div className="relative h-36 overflow-hidden" style={{ background: '#EDE0CE' }}>
                  <img
                    src={isImageUrl(prod?.image) ? prod.image : IMG.baking}
                    alt={prod?.name || ''} loading="lazy" decoding="async"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 right-3">
                    <span className="lolis-badge-offer flex items-center gap-1">
                      <Tag size={10} />
                      {offer.discountType === 'percentage' ? `${offer.discountValue}% خصم` : 'عرض خاص'}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <div className="font-bold text-sm mb-2 line-clamp-1 lolis-body" style={{ color: '#27201C' }}>
                    {prod?.name || offer.productNameSnapshot}
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs line-through lolis-body" style={{ color: '#A09080' }}>{formatCurrency(prod?.directPrice)}</span>
                    <span className="font-black text-lg lolis-body" style={{ color: '#A96734' }}>{formatCurrency(dp)}</span>
                  </div>
                  <Link to={`/menu/${prod?._id || ''}`} className="lolis-btn lolis-btn-sm w-full"
                    style={{
                      background: 'linear-gradient(135deg, #A96734, #6F3E25)',
                      color: '#FBF7F0',
                      borderRadius: '12px',
                    }}>
                    اطلب الآن <ShoppingBag size={14} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ── Process Steps ────────────────────── */
const STEPS = [
  { num: '01', title: 'اختيار المكونات', desc: 'أجود الطحين والزيت والبهارات الطازجة يومياً', Icon: Wheat },
  { num: '02', title: 'تحضير العجينة',  desc: 'نعجن يدوياً بوصفات عائلية متوارثة',          Icon: ChefHat },
  { num: '03', title: 'الخَبز بحب',     desc: 'فرن حجري وحرارة مضبوطة بدقة وخبرة',         Icon: Flame },
  { num: '04', title: 'طازج لبيتك',    desc: 'توصيل سريع وطازج في أقرب وقت',               Icon: Truck },
]

function ProcessSteps() {
  return (
    <section className="py-16 lg:py-20" style={{ background: '#FBF7F0' }}>
      <div className="container-custom">
        <div className="text-center mb-12 lg:mb-14">
          <span className="lolis-chip lolis-chip-pink mb-4 inline-flex items-center gap-1.5">
            <ChefHat size={13} /> من المطعم إلى بيتك
          </span>
          <h2 className="lolis-heading text-3xl lg:text-4xl mb-3" style={{ color: '#27201C' }}>
            كيف نحضّر لك الطازج؟
          </h2>
          <p className="text-sm font-medium lolis-body max-w-sm mx-auto" style={{ color: '#6B5A4A' }}>
            أربع خطوات بسيطة، لكنها مليئة بالاهتمام والحب
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map(({ num, title, desc, Icon }, i) => (
            <div key={num}
              className="relative rounded-3xl p-6 text-center transition-all duration-300 hover:-translate-y-1"
              style={{
                background: '#ffffff',
                border: '1px solid rgba(231,210,183,0.6)',
                boxShadow: '0 2px 12px rgba(53,32,23,0.04)',
                opacity: 0, animation: `homeFadeUp 0.5s ease-out ${i * 100}ms forwards`,
              }}>
              {/* Step badge */}
              <div className="absolute top-4 left-4 w-7 h-7 rounded-full flex items-center justify-center font-black text-xs lolis-body"
                style={{ background: 'linear-gradient(135deg, #A96734, #6F3E25)', color: '#FBF7F0' }}>
                {i + 1}
              </div>
              {/* Icon */}
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 mt-2"
                style={{ background: 'rgba(169,103,52,0.1)', border: '1px solid rgba(169,103,52,0.25)' }}>
                <Icon size={24} style={{ color: '#A96734' }} strokeWidth={1.8} />
              </div>
              <h3 className="font-bold text-base mb-2 lolis-body" style={{ color: '#27201C' }}>{title}</h3>
              <p className="text-xs font-medium leading-relaxed lolis-body" style={{ color: '#6B5A4A' }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <DoughWaveSVG fill="#FDF4EA" />
      </div>
    </section>
  )
}

/* ── About teaser ─────────────────────── */
function AboutTeaser() {
  return (
    <section className="py-16 lg:py-20" style={{ background: '#ffffff' }}>
      <div className="container-custom">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-xs font-semibold mb-3 lolis-body uppercase tracking-widest" style={{ color: '#A96734' }}>
              — قصتنا
            </div>
            <h2 className="lolis-heading text-3xl lg:text-4xl mb-5" style={{ color: '#27201C', lineHeight: 1.35 }}>
              أكثر من مطعم —<br />
              <span style={{ color: '#A96734' }}>حكاية عجين وشغف</span>
            </h2>
            <p className="font-medium leading-relaxed mb-8 text-base lolis-body" style={{ color: '#6B5A4A', maxWidth: '30rem' }}>
              نؤمن أن الطعام الطيب يبدأ من مكونات صادقة وأيادٍ مُحبّة. كل يوم نعجن ونخبز باحترافية وبأصالة متوارثة — لأن ما يُقدَّم بحب يُحسّ بطعمه.
            </p>
            <Link to="/about" className="lolis-btn lolis-btn-md"
              style={{
                background: 'linear-gradient(135deg, #A96734 0%, #6F3E25 100%)',
                color: '#FBF7F0',
                fontWeight: 800,
                boxShadow: '0 4px 16px rgba(169,103,52,0.3)',
              }}>
              تعرّف علينا أكثر <ArrowLeft size={15} />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-3xl overflow-hidden row-span-2 h-full min-h-[280px]">
              <img src={IMG.dough} alt="تحضير العجين" loading="lazy" decoding="async"
                className="w-full h-full object-cover" />
            </div>
            {[
              { Icon: ChefHat, title: 'خبرة متوارثة', desc: 'أكثر من 10 سنوات خبرة' },
              { Icon: Heart,   title: 'مُحضَّر بحب',  desc: 'وصفات عائلية أصيلة' },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="rounded-3xl p-5"
                style={{ background: '#FBF7F0', border: '1px solid rgba(231,210,183,0.6)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(169,103,52,0.1)' }}>
                  <Icon size={18} style={{ color: '#A96734' }} />
                </div>
                <div className="font-bold text-sm mb-1 lolis-body" style={{ color: '#27201C' }}>{title}</div>
                <div className="text-xs font-medium lolis-body" style={{ color: '#6B5A4A' }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── WhatsApp CTA ─────────────────────── */
function WhatsAppCTA() {
  const wa = useWaNumber()
  return (
    <section className="py-16 lg:py-20">
      <div className="container-custom text-center">
        <h3 className="lolis-heading text-3xl lg:text-5xl mb-4" style={{ color: '#27201C' }}>جاهز تطلب؟</h3>
        <p className="font-medium mb-10 text-sm lg:text-base max-w-sm mx-auto lolis-body"
          style={{ color: '#6B5A4A' }}>
          تواصل معنا الآن عبر واتساب وسنجهّز طلبك بأسرع وقت
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
            className="lolis-btn lolis-btn-lg lolis-btn-wa"
            style={{ fontWeight: 800, boxShadow: '0 6px 24px rgba(37,211,102,0.25)' }}>
            واتساب الآن <MessageCircle size={18} />
          </a>
          <Link to="/menu" className="lolis-btn lolis-btn-lg"
            style={{
              background: '#FBF7F0',
              color: '#27201C',
              border: '1.5px solid rgba(231,210,183,0.8)',
            }}>
            <UtensilsCrossed size={18} /> تصفّح المنيو
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ── Main ─────────────────────────────── */
export default function HomePage() {
  const [products, setProducts]         = useState([])
  const [offers, setOffers]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [heroImage, setHeroImage]       = useState('')
  const [instagramUrl, setInstagramUrl] = useState('')

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'
    fetch(`${apiBase}/site-settings`, { headers: tenantHeader })
      .then(r => r.json())
      .then(data => {
        const s = data?.settings || {}
        setHeroImage(s.heroImage || '')
        setInstagramUrl(s.instagramUrl || '')
      })
      .catch(() => {})

    Promise.all([
      swr('public_products', () => productsAPI.getPublic().then(r => r.data.products || []),
        { onUpdate: setProducts }).then(({ data }) => setProducts(data)),
      swr('public_offers', () => offersAPI.getPublic().then(r => r.data.offers || []),
        { onUpdate: setOffers }).then(({ data }) => setOffers(data)),
    ]).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <HeroSection heroImage={heroImage} />
      <WhyUsSection />
      <TodayMenu products={products} loading={loading} />
      <OffersStrip offers={offers} />
      <ProcessSteps />
      <AboutTeaser />
      <ReviewsSection />
      <CentersSection />
      <InstagramFeed instagramUrl={instagramUrl} />
      <WhatsAppCTA />

      <style>{`
        @keyframes homeFadeUp {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroFloat {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  )
}
