import { motion } from 'framer-motion'
import { tenantHeader } from '../../services/api'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  Heart, Leaf, Search, Zap, CheckCircle2, Truck, ChefHat, Sparkles,
  BookOpen, Gem, Clock, UtensilsCrossed,
} from 'lucide-react'
import InstagramFeed  from '../../components/customer/InstagramFeed'
import ReviewsSection from '../../components/customer/ReviewsSection'
import CentersSection from '../../components/customer/CentersSection'
import WhatsAppIcon    from '../../components/common/WhatsAppIcon'

const WA_NUMBER = import.meta.env.VITE_WA_NUMBER || '963XXXXXXXXX'

const VALUES = [
  { Icon: Leaf,         title: 'مكونات طازجة',  desc: 'نختار أجود المكونات يدوياً كل صباح من أفضل الموردين المحليين', bg: 'bg-lolis-mint-light', accent: 'text-lolis-mint-dark' },
  { Icon: Heart,        title: 'مُحضَّر بحب',    desc: 'كل وجبة تُطبخ بشغف ودفء البيت — ليس مجرد طعام بل تجربة',   bg: 'bg-lolis-pink-light', accent: 'text-lolis-pink' },
  { Icon: Search,       title: 'شفافية تامة',   desc: 'نخبركِ بكل مكوّن وقيمة غذائية — لا أسرار في مطبخنا',       bg: 'bg-lolis-yellow-light', accent: 'text-amber-700' },
  { Icon: Zap,          title: 'طلب في ثوانٍ',  desc: 'طلب سريع عبر واتساب وتأكيد فوري — بدون تعقيد',             bg: 'bg-blue-50', accent: 'text-blue-600' },
  { Icon: CheckCircle2, title: 'جودة مضمونة',   desc: 'رضاكِ هو معيارنا الأول وسنبذل كل ما يلزم لتحقيقه',          bg: 'bg-emerald-50', accent: 'text-emerald-600' },
  { Icon: Truck,        title: 'توصيل سريع',    desc: 'وجبتك الساخنة تصل إلى باب بيتك في أقل وقت ممكن',           bg: 'bg-lolis-mint-light', accent: 'text-lolis-mint-dark' },
]

const MILESTONES = [
  { year: '2023', event: 'انطلاق لوليز',   desc: 'بداية رحلة الحب مع الطبخ من مطبخ بيتي صغير' },
  { year: '2024', event: 'نمو الأسرة',     desc: 'أكثر من 200 زبون سعيد وعشرات الوجبات أسبوعياً' },
  { year: '2025', event: 'منصة رقمية',     desc: 'إطلاق موقعنا لخدمة أكبر وأسرع وأكثر احترافية' },
]

const fadeUp   = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } }
const stagger  = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }

export default function AboutPage() {
  const [instagramUrl, setInstagramUrl] = useState('')
  const [beholdFeedId, setBeholdFeedId] = useState('')

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'
    fetch(`${apiBase}/site-settings`, { headers: tenantHeader })
      .then(r => r.json())
      .then(data => {
        const s = data?.settings || {}
        setInstagramUrl(s.instagramUrl || '')
        setBeholdFeedId(s.beholdFeedId || '')
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-lolis-bg">

      {/* ── Hero ──────────────────────────── */}
      <section className="bg-lolis-pink overflow-hidden">
        <div className="container-custom py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 bg-white/20 border border-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-full mb-6 lolis-body">
                <Heart size={13} /> قصتنا معكِ
              </div>
              <h1 className="lolis-heading text-5xl lg:text-6xl text-white mb-5 leading-tight">
                أكثر من مطبخ<br />
                <span className="text-lolis-yellow">نحن عائلة</span>
              </h1>
              <p className="text-white/85 font-medium leading-relaxed text-base lg:text-lg mb-8 lolis-body">
                لوليز ليست مجرد علامة تجارية — هي قصة حب مع الطبخ البيتي الأصيل، ورسالة لإيصال دفء المنازل لكل إنسان.
              </p>
              <div className="flex flex-wrap gap-4">
                <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer"
                  className="lolis-btn lolis-btn-md lolis-btn-wa">
                  <WhatsAppIcon size={16} /> تواصلي معنا
                </a>
                <Link to="/menu" className="lolis-btn lolis-btn-md lolis-btn-white">
                  <UtensilsCrossed size={16} /> شوف المنيو
                </Link>
              </div>
            </motion.div>

            {/* Visual */}
            <motion.div initial={{ opacity: 0, scale: 0.87 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.6 }}
              className="hidden lg:flex justify-center">
              <div className="relative">
                <div className="w-72 h-72 rounded-full bg-white flex items-center justify-center shadow-2xl">
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-lolis-pink select-none">
                    <ChefHat size={110} strokeWidth={1.1} />
                  </motion.div>
                </div>
                <motion.div
                  className="absolute top-4 -right-2 w-11 h-11 bg-lolis-yellow rounded-2xl flex items-center justify-center shadow-lg"
                  animate={{ rotate: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
                  <Sparkles size={20} className="text-lolis-dark" />
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
        <div className="relative h-12 overflow-hidden">
          <svg viewBox="0 0 1440 48" fill="none" className="absolute bottom-0 w-full">
            <path d="M0 48L60 40C120 32 240 16 360 12C480 8 600 16 720 20C840 24 960 24 1080 20C1200 16 1320 8 1380 4L1440 0V48H0Z" fill="#F6EFE6" />
          </svg>
        </div>
      </section>

      {/* ── Story ─────────────────────────── */}
      <section className="bg-lolis-bg py-14 lg:py-20">
        <div className="container-custom max-w-3xl text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <span className="lolis-chip lolis-chip-pink mb-5 inline-flex items-center gap-1.5">
              <BookOpen size={13} /> حكايتنا
            </span>
            <h2 className="lolis-heading text-3xl lg:text-4xl text-lolis-dark mb-6">من مطبخ صغير إلى قلوب كثيرة</h2>
            <p className="text-lolis-gray font-medium leading-loose text-base lg:text-lg lolis-body">
              في عام 2023، قررت أن أُحوّل شغفي بالطبخ البيتي إلى رسالة حقيقية. كل وجبة تخرج من مطبخنا تحمل قصة، تحمل دفء البيت، وتحمل أملنا أن تُسعدكِ كما يُسعدنا إعدادها. لوليز لم تكن مشروعاً — كانت قلباً قررت أن يطبخ للعالم.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Values ────────────────────────── */}
      <section className="bg-white py-14 lg:py-20">
        <div className="container-custom">
          <div className="text-center mb-12">
            <span className="lolis-chip lolis-chip-mint mb-4 inline-flex items-center gap-1.5">
              <Gem size={13} /> قيمنا
            </span>
            <h2 className="lolis-heading text-3xl lg:text-4xl text-lolis-dark">لماذا لوليز؟</h2>
          </div>
          <motion.div
            variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {VALUES.map(v => (
              <motion.div key={v.title} variants={fadeUp}
                className={`${v.bg} rounded-3xl p-6`}>
                <v.Icon size={28} strokeWidth={1.75} className={`${v.accent} mb-3`} />
                <div className={`font-black text-base mb-2 lolis-body ${v.accent}`}>{v.title}</div>
                <div className="text-lolis-gray text-sm font-medium leading-relaxed lolis-body">{v.desc}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Timeline ──────────────────────── */}
      <section className="bg-lolis-bg py-14 lg:py-20">
        <div className="container-custom max-w-2xl">
          <div className="text-center mb-10">
            <span className="lolis-chip lolis-chip-yellow mb-4 inline-flex items-center gap-1.5">
              <Clock size={13} /> مسيرتنا
            </span>
            <h2 className="lolis-heading text-3xl lg:text-4xl text-lolis-dark">رحلة لوليز</h2>
          </div>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute right-[22px] top-0 bottom-0 w-0.5 bg-lolis-border" />
            <div className="space-y-8">
              {MILESTONES.map((m, i) => (
                <motion.div key={m.year}
                  initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                  className="flex items-start gap-5 relative">
                  <div className="w-11 h-11 rounded-full bg-lolis-pink flex items-center justify-center flex-shrink-0 z-10 shadow-sm">
                    <span className="text-white font-black text-xs lolis-body">{m.year.slice(2)}</span>
                  </div>
                  <div className="bg-white rounded-3xl p-5 flex-1 border border-lolis-border shadow-sm">
                    <div className="font-black text-lolis-dark mb-1 lolis-body">{m.event}</div>
                    <div className="text-lolis-gray text-sm font-medium lolis-body">{m.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────── */}
      <section className="bg-lolis-pink py-14 lg:py-16">
        <div className="container-custom">
          <motion.div
            variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }}
            className="grid grid-cols-3 gap-6 text-center">
            {[['200+', 'زبون سعيد'], ['1000+', 'وجبة مُحضَّرة'], ['5.0', 'متوسط التقييم']].map(([num, label]) => (
              <motion.div key={label} variants={fadeUp}>
                <div className="lolis-heading text-4xl lg:text-5xl text-lolis-yellow mb-2">{num}</div>
                <div className="text-white/85 font-medium text-sm lolis-body">{label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Reviews ───────────────────────── */}
      <ReviewsSection />

      {/* ── Centers ───────────────────────── */}
      <CentersSection />

      {/* ── Instagram Feed ────────────────── */}
      <InstagramFeed instagramUrl={instagramUrl} beholdFeedId={beholdFeedId} />

      {/* ── CTA ───────────────────────────── */}
      <section className="bg-white py-16 lg:py-20">
        <div className="container-custom text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="w-14 h-14 rounded-2xl bg-lolis-pink-light flex items-center justify-center mx-auto mb-5">
              <WhatsAppIcon size={26} className="text-lolis-pink" />
            </div>
            <h3 className="lolis-heading text-3xl lg:text-4xl text-lolis-dark mb-4">جرّب لوليز اليوم</h3>
            <p className="text-lolis-gray font-medium mb-8 max-w-md mx-auto lolis-body">
              وجباتنا تتكلم عن نفسها — جربها ولنا موعد مع ابتسامتك!
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer"
                className="lolis-btn lolis-btn-lg lolis-btn-wa">
                <WhatsAppIcon size={17} /> واتساب الآن
              </a>
              <Link to="/menu" className="lolis-btn lolis-btn-lg lolis-btn-pink">
                <UtensilsCrossed size={17} /> شوف المنيو
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
