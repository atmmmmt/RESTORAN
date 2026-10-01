import { motion } from 'framer-motion'
import { tenantHeader } from '../../services/api'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  Leaf, Heart, Eye, Zap, CheckCircle2, Truck,
  MessageCircle, UtensilsCrossed, BookOpen, Clock,
  ChefHat, Sparkles, Star, ArrowLeft,
} from 'lucide-react'
import InstagramFeed  from '../../components/customer/InstagramFeed'
import ReviewsSection from '../../components/customer/ReviewsSection'
import CentersSection from '../../components/customer/CentersSection'

import { useWaNumber } from '../../hooks/useWaNumber'

const VALUES = [
  { Icon: Leaf,         title: 'مكونات طازجة يومياً',   desc: 'نبدأ كل يوم باختيار أجود المكونات الطازجة — لأن الطعيم الحقيقي يبدأ من المصدر' },
  { Icon: ChefHat,      title: 'وصفات عائلية أصيلة',    desc: 'كل طبق يحمل عبق المطبخ الشامي الأصيل، موروث بمحبة من جيل لجيل' },
  { Icon: CheckCircle2, title: 'جودة بلا تنازل',        desc: 'معيارنا الوحيد هو رضاكم — لا نقدّم شيئاً لا نقدّمه لأهلنا على مائدتنا' },
  { Icon: Heart,        title: 'مُحضَّر بشغف حقيقي',    desc: 'كل لقمة تخرج من مطبخنا فيها قطعة من قلبنا — الطعام الطيب يُحسّ بطعمه' },
  { Icon: Truck,        title: 'توصيل سريع وطازج',      desc: 'نحرص على أن تصلك وجبتك ساخنة وطازجة في أسرع وقت وبأعلى جودة' },
  { Icon: Zap,          title: 'طلب سهل وسريع',         desc: 'عبر واتساب أو الموقع، اطلب في ثوانٍ واستلم بلا تعقيد' },
]

const MILESTONES = [
  {
    year: '2022',
    title: 'البداية من قلب حلب',
    subtitle: 'افتتاح أول فرع قرب قلعة حلب',
    desc: 'من جوار قلعة حلب بدأت حكايتنا، بوصفات بيتية أصيلة وطعم يحمل روح المدينة ودفء المطبخ الحلبي.',
  },
  {
    year: '2023',
    title: 'توسّعنا لنكون أقرب',
    subtitle: 'افتتاح فرع أمريكان كلوب',
    desc: 'خطوة جديدة قرّبتنا من زبائن أكثر، وقدّمنا من خلالها تجربة أوسع وخدمة أسرع بنفس الجودة والنكهة.',
  },
  {
    year: '2026',
    title: 'تجربة رقمية متكاملة',
    subtitle: 'إطلاق موقعنا الإلكتروني',
    desc: 'أصبح بإمكانكم استكشاف المنيو، معرفة أقرب فرع وطلب وجباتكم المفضلة بسهولة ومن أي مكان.',
  },
]

/* ── SVG Brand Illustration ── */
function BrandIllustration() {
  return (
    <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-40 h-40 lg:w-56 lg:h-56">
      {/* Plate */}
      <circle cx="120" cy="140" r="72" fill="rgba(255,255,255,0.15)" stroke="rgba(231,210,183,0.4)" strokeWidth="2"/>
      <circle cx="120" cy="140" r="54" fill="rgba(255,255,255,0.1)" stroke="rgba(231,210,183,0.3)" strokeWidth="1.5"/>
      {/* Rolling pin */}
      <rect x="46" y="108" width="148" height="18" rx="9" fill="rgba(231,210,183,0.25)" stroke="rgba(231,210,183,0.6)" strokeWidth="2"/>
      <rect x="36" y="102" width="20" height="30" rx="7" fill="rgba(231,210,183,0.2)" stroke="rgba(231,210,183,0.5)" strokeWidth="2"/>
      <rect x="184" y="102" width="20" height="30" rx="7" fill="rgba(231,210,183,0.2)" stroke="rgba(231,210,183,0.5)" strokeWidth="2"/>
      {/* Chef hat */}
      <path d="M98 98 C98 78 142 78 142 98 L142 108 L98 108 Z" fill="rgba(255,255,255,0.2)" stroke="rgba(231,210,183,0.5)" strokeWidth="1.5"/>
      <rect x="92" y="106" width="56" height="12" rx="4" fill="rgba(255,255,255,0.15)" stroke="rgba(231,210,183,0.4)" strokeWidth="1.5"/>
      {/* Dough swirl */}
      <path d="M80 55 C80 42 100 38 108 48 C116 58 106 68 96 64 C86 60 88 50 96 48" stroke="rgba(169,103,52,0.5)" strokeWidth="2" strokeLinecap="round" fill="none"/>
      {/* Sesame seeds */}
      <ellipse cx="60" cy="170" rx="5" ry="2" fill="rgba(169,103,52,0.4)" transform="rotate(30 60 170)"/>
      <ellipse cx="175" cy="165" rx="5" ry="2" fill="rgba(169,103,52,0.4)" transform="rotate(-20 175 165)"/>
      <ellipse cx="155" cy="185" rx="4" ry="2" fill="rgba(169,103,52,0.35)" transform="rotate(45 155 185)"/>
      <ellipse cx="85" cy="188" rx="4" ry="2" fill="rgba(169,103,52,0.35)" transform="rotate(-30 85 188)"/>
      {/* Sparkle dots */}
      <circle cx="42" cy="80" r="3" fill="rgba(231,210,183,0.5)"/>
      <circle cx="198" cy="90" r="2.5" fill="rgba(231,210,183,0.4)"/>
      <circle cx="168" cy="60" r="2" fill="rgba(231,210,183,0.35)"/>
    </svg>
  )
}

const fadeUp  = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }

export default function AboutPage() {
  const wa = useWaNumber()
  const [instagramUrl, setInstagramUrl] = useState('')

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'
    fetch(`${apiBase}/site-settings`, { headers: tenantHeader })
      .then(r => r.json())
      .then(data => {
        const s = data?.settings || {}
        setInstagramUrl(s.instagramUrl || '')
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen" style={{ background: '#FBF7F0' }}>

      {/* ── Hero ──────────────────────────── */}
      <section className="relative overflow-hidden"
        style={{ background: 'linear-gradient(150deg, #352017 0%, #4A2A14 50%, #6F3E25 100%)' }}>
        <div className="container-custom py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 lolis-body"
                style={{ background: 'rgba(231,210,183,0.15)', border: '1px solid rgba(231,210,183,0.3)', color: '#E7D2B7' }}>
                <Heart size={13} style={{ color: '#C98279' }} /> قصتنا معكم
              </div>
              <h1 className="lolis-heading text-5xl lg:text-6xl text-white mb-5" style={{ lineHeight: 1.35 }}>
                أكثر من مطعم<br />
                <span style={{ color: '#E7D2B7' }}>نحن عائلة</span>
              </h1>
              <p className="font-medium leading-relaxed text-base lg:text-lg mb-8 lolis-body"
                style={{ color: 'rgba(231,210,183,0.75)' }}>
                عجينة وطحينة ليست مجرد علامة تجارية — هي حكاية من قلب حلب، بتجمع بين أصالة المطبخ الحلبي وروح الضيافة الدافئة، ومنكبر بمحبتكم يوماً بعد يوم.
              </p>
              <div className="flex flex-wrap gap-4">
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                  className="lolis-btn lolis-btn-md lolis-btn-wa">
                  تواصلوا معنا <MessageCircle size={16} />
                </a>
                <Link to="/menu" className="lolis-btn lolis-btn-md"
                  style={{ background: 'rgba(231,210,183,0.12)', color: '#E7D2B7', border: '1.5px solid rgba(231,210,183,0.3)' }}>
                  شوف المنيو <UtensilsCrossed size={16} />
                </Link>
              </div>
            </motion.div>

            {/* SVG Illustration */}
            <motion.div initial={{ opacity: 0, scale: 0.87 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="hidden lg:flex justify-center">
              <div className="relative">
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-72 h-72 rounded-full overflow-hidden"
                  style={{ border: '2px solid rgba(231,210,183,0.2)' }}>
                  <img src="/img12.png" alt="عجينة وطحينة" className="w-full h-full object-cover" draggable={false} />
                </motion.div>
                {/* Floating sparkle accents */}
                {[
                  { top: '8%', right: '6%', delay: 0 },
                  { bottom: '12%', left: '4%', delay: 0.7 },
                  { top: '50%', left: '0%', delay: 1.2 },
                ].map(({ top, right, left, bottom, delay }, i) => (
                  <motion.div key={i} className="absolute"
                    style={{ top, right, bottom, left }}
                    animate={{ y: [0, -10, 0], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2.5 + i * 0.3, repeat: Infinity, delay }}>
                    <Sparkles size={18} style={{ color: '#E7D2B7', opacity: 0.7 }} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Wave */}
        <div className="relative h-12 overflow-hidden">
          <svg viewBox="0 0 1440 48" fill="none" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0 48L60 40C120 32 240 16 360 12C480 8 600 16 720 20C840 24 960 24 1080 20C1200 16 1320 8 1380 4L1440 0V48H0Z" fill="#FBF7F0" />
          </svg>
        </div>
      </section>

      {/* ── Story ─────────────────────────── */}
      <section className="py-14 lg:py-20" style={{ background: '#FBF7F0' }}>
        <div className="container-custom max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-center">
            <span className="lolis-chip lolis-chip-pink mb-5 inline-flex items-center gap-1.5">
              <BookOpen size={13} /> حكايتنا
            </span>
            <h2 className="lolis-heading text-3xl lg:text-4xl mb-8" style={{ color: '#27201C' }}>
              من قلب حلب، حكاية عجينة وطحينة
            </h2>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="space-y-5 text-right">

            <p className="font-medium leading-loose text-base lg:text-lg lolis-body" style={{ color: '#6B5A4A' }}>
              عجينة وطحينة مكان بيجمع بين أصالة المطبخ الحلبي وروح التجربة العصرية. من قلب مدينة حلب، بدأت حكايتنا في صيف 2022 بفكرة بسيطة: نعمل أكل بنحبه، نقدّمه متل ما لازم، ونخلي كل زيارة ذكرى حلوة ولمة بتنعاد — مو مجرد وجبة.
            </p>

            <p className="font-medium leading-loose text-base lolis-body" style={{ color: '#6B5A4A' }}>
              قائمتنا غنية ومتنوعة لتناسب كل وقت ومزاج: مناقيش وفطائر طازجة، بيتزا بخلطاتنا الخاصة، صفيحة ولحوم على العجين، صواني وأطباق حلبية أصيلة كلحمة بكرز، مشاوي على الفحم مثل الكباب الحلبي وكباب الخشخاش والكبة المشوية، بالإضافة إلى سندويشات سريعة ومقبلات وسلطات شرقية تكمل السفرة.
            </p>

            <p className="font-medium leading-loose text-base lolis-body" style={{ color: '#6B5A4A' }}>
              كل طبق بيحمل شخصيته الخاصة — من اختيار المكونات وتحضير العجينة، لدرجة الخبز والشوي، ووصوله ساخناً وطازجاً إلى طاولتك. عنا فرعين: حلب القديمة بأصالة المكان، وAmerican Club ليكون قريب من شريحة أكبر من الزبائن، وبكلا الفرعين نفس الاهتمام والجودة والطعم.
            </p>

            <p className="font-medium leading-loose text-base lolis-body" style={{ color: '#6B5A4A' }}>
              كمان نقدّم خدمات الضيافة وتجهيز الطعام للمناسبات والفعاليات — اجتماعات عمل، حفلات عائلية أو أي تجمع — بمساعدتكم على اختيار الأصناف والكميات المناسبة وتقديمها بشكل يليق بالمناسبة. لأن الأكل الطيب بده لمة حلوة، واللمة الحلوة بدها مكان بتحس فيه بالراحة.
            </p>

            <div className="pt-2 pb-2 text-center">
              <p className="lolis-heading text-xl lg:text-2xl leading-relaxed" style={{ color: '#A96734' }}>
                عجينة وطحينة… نكهة حلبية على أصولها، عجينة محضّرة بحب — منكبر بمحبتكم.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Values ────────────────────────── */}
      <section className="py-14 lg:py-20" style={{ background: '#FDF4EA' }}>
        <div className="container-custom">
          <div className="text-center mb-12">
            <span className="lolis-chip lolis-chip-pink mb-4 inline-flex items-center gap-1.5">
              <Sparkles size={13} /> قيمنا
            </span>
            <h2 className="lolis-heading text-3xl lg:text-4xl" style={{ color: '#27201C' }}>لماذا عجينة وطحينة؟</h2>
          </div>
          <motion.div
            variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {VALUES.map(v => (
              <motion.div key={v.title} variants={fadeUp}
                className="rounded-3xl p-5 flex items-start gap-4 transition-all duration-300 hover:-translate-y-1"
                style={{ background: '#ffffff', border: '1px solid rgba(231,210,183,0.6)', boxShadow: '0 2px 16px rgba(53,32,23,0.05)' }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(169,103,52,0.1)' }}>
                  <v.Icon size={22} strokeWidth={1.8} style={{ color: '#A96734' }} />
                </div>
                <div className="flex-1 pt-0.5">
                  <div className="font-bold text-sm mb-1.5 lolis-heading" style={{ color: '#352017' }}>{v.title}</div>
                  <div className="text-xs font-medium leading-relaxed lolis-body" style={{ color: '#6B5A4A' }}>{v.desc}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Timeline ──────────────────────── */}
      <section className="py-14 lg:py-20" style={{ background: '#FDF4EA' }}>
        <div className="container-custom max-w-3xl">
          <div className="text-center mb-14">
            <span className="lolis-chip lolis-chip-pink mb-4 inline-flex items-center gap-1.5">
              <Clock size={13} /> مسيرتنا
            </span>
            <h2 className="lolis-heading text-3xl lg:text-4xl" style={{ color: '#27201C' }}>رحلة عجينة وطحينة</h2>
          </div>

          <div className="relative">
            {/* vertical line */}
            <div className="absolute right-[50%] top-0 bottom-0 w-px hidden lg:block" style={{ background: 'linear-gradient(to bottom, transparent, #E7D2B7 10%, #E7D2B7 90%, transparent)' }} />

            <div className="space-y-10">
              {MILESTONES.map((m, i) => (
                <motion.div key={m.year}
                  initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.12, duration: 0.5 }}
                  className="lg:grid lg:grid-cols-2 lg:gap-10 items-center relative">

                  {/* Year side (right on desktop) */}
                  <div className={`lg:text-left flex flex-col items-end mb-4 lg:mb-0 ${i % 2 === 0 ? 'lg:order-1' : 'lg:order-2'}`}>
                    <div className="inline-flex items-center gap-3">
                      <div className="lolis-heading text-5xl font-black" style={{ color: '#E7D2B7' }}>{m.year}</div>
                    </div>
                    <div className="lolis-heading text-xl font-bold mt-1" style={{ color: '#352017' }}>{m.title}</div>
                    <div className="text-sm font-semibold mt-0.5 lolis-body" style={{ color: '#A96734' }}>{m.subtitle}</div>
                  </div>

                  {/* Center dot */}
                  <div className="hidden lg:flex absolute right-[50%] translate-x-1/2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full z-10 items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #A96734, #6F3E25)', boxShadow: '0 0 0 4px #FDF4EA' }} />

                  {/* Content card */}
                  <div className={`${i % 2 === 0 ? 'lg:order-2' : 'lg:order-1'}`}>
                    <div className="rounded-3xl p-6"
                      style={{ background: '#ffffff', border: '1px solid rgba(231,210,183,0.7)', boxShadow: '0 4px 20px rgba(53,32,23,0.06)' }}>
                      <p className="text-sm font-medium leading-relaxed lolis-body" style={{ color: '#6B5A4A' }}>{m.desc}</p>
                    </div>
                  </div>

                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────── */}
      <section className="py-14 lg:py-16"
        style={{ background: 'linear-gradient(135deg, #A96734 0%, #6F3E25 100%)' }}>
        <div className="container-custom">
          <motion.div
            variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }}
            className="grid grid-cols-3 gap-6 text-center">
            {[
              ['200+', 'زبون سعيد'],
              ['1000+', 'وجبة مُحضَّرة'],
              ['5.0', 'متوسط التقييم'],
            ].map(([num, label]) => (
              <motion.div key={label} variants={fadeUp}>
                <div className="lolis-heading text-4xl lg:text-5xl mb-2 flex items-center justify-center gap-1"
                  style={{ color: '#E7D2B7' }}>
                  {num}
                  {label === 'متوسط التقييم' && <Star size={22} fill="#E7D2B7" style={{ color: '#E7D2B7' }} />}
                </div>
                <div className="font-medium text-sm lolis-body" style={{ color: 'rgba(251,247,240,0.75)' }}>{label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <ReviewsSection />
      <CentersSection />
      <InstagramFeed instagramUrl={instagramUrl} />

      {/* ── CTA ───────────────────────────── */}
      <section className="py-16 lg:py-20" style={{ background: '#ffffff' }}>
        <div className="container-custom text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)' }}>
              <MessageCircle size={28} style={{ color: '#25D366' }} />
            </div>
            <h3 className="lolis-heading text-3xl lg:text-4xl mb-4" style={{ color: '#27201C' }}>
              جرّب عجينة وطحينة اليوم
            </h3>
            <p className="font-medium mb-8 max-w-md mx-auto lolis-body" style={{ color: '#6B5A4A' }}>
              أصنافنا تتكلم عن نفسها — جربها ولنا موعد مع ابتسامتك!
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                className="lolis-btn lolis-btn-lg lolis-btn-wa">
                واتساب الآن <MessageCircle size={18} />
              </a>
              <Link to="/menu" className="lolis-btn lolis-btn-lg"
                style={{
                  background: 'linear-gradient(135deg, #A96734, #6F3E25)',
                  color: '#FBF7F0', fontWeight: 800,
                }}>
                شوف المنيو <UtensilsCrossed size={18} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
