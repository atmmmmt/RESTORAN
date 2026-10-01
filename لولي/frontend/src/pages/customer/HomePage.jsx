import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MotionConfig, motion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock3,
  Heart,
  Home,
  Leaf,
  Package,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react'
import {
  offersAPI,
  productsAPI,
  reviewsAPI,
  tenantHeader,
} from '../../services/api'
import { calcDiscountedPrice, formatCurrency } from '../../utils/formatters'
import CentersSection from '../../components/customer/CentersSection'
import InstagramFeed from '../../components/customer/InstagramFeed'
import WhatsAppIcon from '../../components/common/WhatsAppIcon'

const WA_NUMBER = import.meta.env.VITE_WA_NUMBER || '963XXXXXXXXX'
const HERO_FALLBACK = '/images/luliz-hero-v2.webp'
const STORY_IMAGE = '/images/luliz-story-v2.webp'
const MENU_SPRITE = '/images/luliz-menu-v2.webp'

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' } },
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055 } },
}

const FEATURES = [
  { Icon: Home, title: 'طعم بيتي أصيل', desc: 'وصفات من ذاكرة البيت' },
  { Icon: Leaf, title: 'مكونات منتقاة', desc: 'طازجة ونختارها بعناية' },
  { Icon: Clock3, title: 'تحضير يومي', desc: 'كل وجبة تُحضّر لوقتها' },
  { Icon: Heart, title: 'صُنعت بمحبة', desc: 'لأن التفاصيل تصنع الطعم' },
]

const PREVIEW_DISHES = [
  {
    _id: 'signature-yalanji',
    name: 'يالنجي على أصوله',
    description: 'ورق عنب محشي بخلطة لوليز ولمسة ليمون منعشة.',
    category: 'الأكثر طلبًا',
    preview: true,
    crop: '0% 0%',
  },
  {
    _id: 'signature-fatteh',
    name: 'فتّة باذنجان',
    description: 'قوام كريمي وقرمشة خبز ورمان طازج.',
    category: 'مقبلات',
    preview: true,
    crop: '100% 0%',
  },
  {
    _id: 'signature-salad',
    name: 'سلطة البرغل والخضار',
    description: 'خفيفة، ملوّنة، ومليئة بالنكهة الطازجة.',
    category: 'سلطات',
    preview: true,
    crop: '0% 100%',
  },
  {
    _id: 'signature-kibbeh',
    name: 'كبة بيتية',
    description: 'مقرمشة من الخارج وغنية من الداخل.',
    category: 'أطباق رئيسية',
    preview: true,
    crop: '100% 100%',
  },
  {
    _id: 'signature-table',
    name: 'سفرة لوليز',
    description: 'تشكيلة مرتبة لتشاركوا الطعم الحلو سوا.',
    category: 'للعيلة',
    preview: true,
    crop: '52% 48%',
  },
]

function SectionIntro({ eyebrow, title, text, align = 'start' }) {
  return (
    <div className={`home-section-intro ${align === 'center' ? 'is-centered' : ''}`}>
      <span className="home-eyebrow"><span />{eyebrow}</span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  )
}

function HeroSection({ heroImage }) {
  const image = heroImage || HERO_FALLBACK

  return (
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-orbit home-orbit-one" aria-hidden="true" />
      <div className="home-orbit home-orbit-two" aria-hidden="true" />

      <div className="home-shell home-hero-grid">
        <motion.div
          className="home-hero-copy"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
        >
          <span className="home-kicker">
            <Sparkles size={15} aria-hidden="true" />
            من مطبخنا إلى سفرتكم
          </span>

          <h1 id="home-title">
            طعم البيت،
            <span>بلمسة لوليز.</span>
          </h1>

          <p className="home-hero-lead">
            وجبات بيتية نحضّرها كل يوم بمكونات منتقاة ووصفات قريبة من القلب؛
            لتوصلكم دافئة، مرتبة، ومليانة نكهة.
          </p>
        </motion.div>

        <motion.div
          className="home-hero-visual"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.44, delay: 0.06, ease: 'easeOut' }}
        >
          <div className="home-hero-image-wrap">
            <img
              src={image}
              alt="سفرة شامية بيتية محضّرة من لوليز"
              fetchpriority="high"
              width="1600"
              height="1067"
            />
          </div>

          <div className="home-rating-card" aria-label="تقييم الزبائن خمسة من خمسة">
            <div className="home-rating-stars" aria-hidden="true">
              {[1, 2, 3, 4, 5].map(item => <Star key={item} size={13} fill="currentColor" />)}
            </div>
            <strong>5.0</strong>
            <span>طعم بيرجعك للبيت</span>
          </div>

          <div className="home-made-card">
            <span className="home-made-icon"><ChefHat size={20} /></span>
            <span><b>ينعمل اليوم</b><small>ويوصل طازج</small></span>
          </div>
        </motion.div>

        <motion.div
          className="home-hero-cta"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.1, ease: 'easeOut' }}
        >
          <div className="home-hero-actions">
            <Link to="/menu" className="home-button home-button-primary">
              تصفّح القائمة <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <Link to="/order" className="home-button home-button-secondary">
              <Package size={18} aria-hidden="true" /> اطلب الآن
            </Link>
          </div>

          <div className="home-trust-line" aria-label="مميزات لوليز">
            <span><Check size={16} /> مكونات طازجة</span>
            <span><Check size={16} /> تحضير يومي</span>
            <span><Check size={16} /> تغليف أنيق</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function FeatureStrip() {
  return (
    <section className="home-features" aria-label="لماذا لوليز">
      <motion.div
        className="home-shell home-feature-grid"
        variants={stagger}
        initial={false}
        whileInView="show"
        viewport={{ once: true, margin: '-60px' }}
      >
        {FEATURES.map(({ Icon, title, desc }) => (
          <motion.div className="home-feature" key={title} variants={fadeUp}>
            <span className="home-feature-icon"><Icon size={21} strokeWidth={1.8} /></span>
            <span><b>{title}</b><small>{desc}</small></span>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

function SkeletonMenu() {
  return (
    <div className="home-menu-grid" aria-label="جارٍ تحميل قائمة الطعام">
      {[1, 2, 3, 4, 5].map(item => <div className="home-menu-skeleton" key={item} />)}
    </div>
  )
}

function ProductVisual({ product, index }) {
  if (product.preview) {
    return (
      <div
        className="home-menu-photo"
        role="img"
        aria-label={product.name}
        style={{
          backgroundImage: `url(${MENU_SPRITE})`,
          backgroundPosition: product.crop,
          backgroundSize: index === 4 ? '135% 135%' : '205% 205%',
        }}
      />
    )
  }

  if (product.image?.startsWith('http') || product.image?.startsWith('/')) {
    return <img src={product.image} alt={product.name} loading="lazy" width="700" height="700" />
  }

  return (
    <div
      className="home-menu-photo"
      role="img"
      aria-label={product.name}
      style={{ backgroundImage: `url(${MENU_SPRITE})`, backgroundPosition: PREVIEW_DISHES[index]?.crop || '50% 50%', backgroundSize: '205% 205%' }}
    />
  )
}

function ProductCard({ product, index }) {
  const card = (
    <article className="home-menu-card">
      <ProductVisual product={product} index={index} />
      <div className="home-menu-shade" />
      <div className="home-menu-card-top">
        <span>{product.category || 'من مطبخنا'}</span>
        {!product.preview && product.availableQuantity <= 0 && <span className="is-muted">نفدت اليوم</span>}
      </div>
      <div className="home-menu-card-copy">
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="home-menu-meta">
          {Number.isFinite(Number(product.directPrice)) && Number(product.directPrice) > 0 ? (
            <strong>{formatCurrency(product.discountedPrice || product.directPrice)}</strong>
          ) : (
            <span>من أطباقنا المميزة</span>
          )}
          <span className="home-card-arrow" aria-hidden="true"><ArrowLeft size={16} /></span>
        </div>
      </div>
    </article>
  )

  return product.preview
    ? <div className="home-menu-link is-preview">{card}</div>
    : <Link className="home-menu-link" to={`/menu/${product._id}`}>{card}</Link>
}

function TodayMenu({ products, loading }) {
  const visibleProducts = useMemo(
    () => (products.length ? products.slice(0, 5) : PREVIEW_DISHES),
    [products],
  )

  return (
    <section className="home-menu-section" id="menu-preview" aria-labelledby="menu-title">
      <div className="home-shell">
        <div className="home-section-head">
          <SectionIntro
            eyebrow="أطباق اليوم"
            title={<span id="menu-title">من قلب مطبخنا</span>}
            text="اختيارات بيتية تتغيّر مع الموسم، وتبقى الجودة ثابتة كل يوم."
          />
          <div className="home-menu-categories" aria-label="تصنيفات القائمة">
            <span className="is-active">الكل</span>
            <span>أطباق رئيسية</span>
            <span>مقبلات</span>
            <span>سلطات</span>
          </div>
        </div>

        {loading ? (
          <SkeletonMenu />
        ) : (
          <motion.div
            className="home-menu-grid"
            variants={stagger}
            initial={false}
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
          >
            {visibleProducts.map((product, index) => (
              <motion.div key={product._id} variants={fadeUp}>
                <ProductCard product={product} index={index} />
              </motion.div>
            ))}
          </motion.div>
        )}

        <div className="home-menu-footer">
          <p>{products.length ? 'اكتشف باقي اختيارات اليوم.' : 'هذه لمحة من روح أطباقنا — القائمة الفعلية تتحدّث يوميًا.'}</p>
          <Link to="/menu" className="home-text-link">مشاهدة القائمة كاملة <ArrowLeft size={17} /></Link>
        </div>
      </div>
    </section>
  )
}

function OffersSection({ offers }) {
  if (!offers.length) return null

  return (
    <section className="home-offers" aria-labelledby="offers-title">
      <div className="home-shell">
        <SectionIntro eyebrow="لفترة محدودة" title={<span id="offers-title">عروض بطعم أحلى</span>} text="اختيارات مميزة وأسعار ألطف، طالما الكمية متوفرة." />
        <div className="home-offer-grid">
          {offers.slice(0, 3).map(offer => {
            const product = offer.productId
            const discounted = product ? calcDiscountedPrice(product.directPrice, offer) : 0
            return (
              <Link to={`/menu/${product?._id || ''}`} className="home-offer-card" key={offer._id}>
                <span className="home-offer-value">
                  {offer.discountType === 'percentage' ? `${offer.discountValue}%` : 'عرض'}
                </span>
                <span className="home-offer-copy">
                  <small>عرض اليوم</small>
                  <b>{product?.name || offer.productNameSnapshot}</b>
                  {discounted > 0 && <span>{formatCurrency(discounted)}</span>}
                </span>
                <ArrowLeft size={20} />
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function StorySection() {
  const points = [
    'وصفات متوازنة بطعم واضح وغير متكلّف',
    'تحضير على دفعات صغيرة للحفاظ على الجودة',
    'اهتمام بالتقديم من أول الطبخة لآخر التغليف',
  ]

  return (
    <section className="home-story" aria-labelledby="story-title">
      <div className="home-shell home-story-grid">
        <motion.div
          className="home-story-photo"
          initial={false}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          viewport={{ once: true, margin: '-80px' }}
        >
          <img src={STORY_IMAGE} alt="تحضير طبق بيتي بعناية في مطبخ لوليز" loading="lazy" width="1200" height="1500" />
          <div className="home-story-stamp">
            <ShieldCheck size={22} />
            <span><b>جودة يومية</b><small>من المطبخ للباب</small></span>
          </div>
        </motion.div>

        <motion.div
          className="home-story-copy"
          variants={fadeUp}
          initial={false}
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          <SectionIntro
            eyebrow="حكايتنا"
            title={<span id="story-title">من مطبخ صغير،<br />إلى قلوبكم</span>}
            text="بدأت لوليز من حب بسيط للأكل اللي بيجمع الناس. واليوم، كل طبق يطلع من مطبخنا يحمل نفس العناية: مكونات نعرفها، وصفات نثق فيها، وتفاصيل بتخلّي الوجبة أقرب للبيت."
          />

          <ul className="home-story-points">
            {points.map(point => <li key={point}><Check size={16} />{point}</li>)}
          </ul>

          <Link to="/about" className="home-button home-button-dark">
            اعرفوا قصتنا <ArrowLeft size={18} />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

function ReviewsShowcase({ reviews }) {
  if (!reviews.length) {
    return (
      <section className="home-promise" aria-labelledby="promise-title">
        <div className="home-shell home-promise-card">
          <Quote size={54} strokeWidth={1.2} aria-hidden="true" />
          <p id="promise-title">الطعم الذي يذكّركم بالبيت، والجودة التي تجعلكم تختارون لوليز من جديد.</p>
          <span>هذا هو وعدنا في كل طلب</span>
        </div>
      </section>
    )
  }

  return (
    <section className="home-reviews" aria-labelledby="reviews-title">
      <div className="home-shell">
        <SectionIntro eyebrow="من كلامكم الحلو" title={<span id="reviews-title">شو قالوا عن لوليز؟</span>} text="آراء حقيقية بتخلّينا نهتم بكل تفصيل أكثر." align="center" />
        <motion.div className="home-review-grid" variants={stagger} initial={false} whileInView="show" viewport={{ once: true, margin: '-60px' }}>
          {reviews.slice(0, 3).map(review => (
            <motion.article className="home-review-card" key={review._id} variants={fadeUp}>
              <Quote size={30} aria-hidden="true" />
              <div className="home-review-stars" aria-label={`التقييم ${review.rating} من 5`}>
                {[1, 2, 3, 4, 5].map(star => <Star key={star} size={14} fill="currentColor" className={star <= review.rating ? '' : 'is-empty'} />)}
              </div>
              <p>“{review.content}”</p>
              <div className="home-review-person">
                <span>{review.customerName?.trim()?.[0] || 'ل'}</span>
                <b>{review.customerName || 'زبونة لوليز'}</b>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function OrderCallout() {
  return (
    <section className="home-cta" aria-labelledby="cta-title">
      <div className="home-shell">
        <motion.div className="home-cta-card" initial={false} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
          <div className="home-cta-copy">
            <span className="home-cta-icon"><WhatsAppIcon size={25} /></span>
            <div>
              <small>جاهزين نطبخ لكم</small>
              <h2 id="cta-title">وجبتكم الجاية أقرب مما بتتخيّلوا.</h2>
              <p>اختاروا من القائمة، أو ابعتولنا مباشرة على واتساب وسنساعدكم بالطلب.</p>
            </div>
          </div>
          <div className="home-cta-actions">
            <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="home-button home-button-light">
              <WhatsAppIcon size={18} /> اطلب عبر واتساب
            </a>
            <Link to="/menu" className="home-button home-button-ghost-light">عرض القائمة</Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default function HomePage() {
  const [products, setProducts] = useState([])
  const [offers, setOffers] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [heroImage, setHeroImage] = useState('')
  const [instagramUrl, setInstagramUrl] = useState('')
  const [beholdFeedId, setBeholdFeedId] = useState('')

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'

    fetch(`${apiBase}/site-settings`, { headers: tenantHeader })
      .then(response => response.json())
      .then(data => {
        const settings = data?.settings || {}
        setHeroImage(settings.heroImage || '')
        setInstagramUrl(settings.instagramUrl || '')
        setBeholdFeedId(settings.beholdFeedId || '')
      })
      .catch(() => {})

    Promise.allSettled([
      productsAPI.getPublic(),
      offersAPI.getPublic(),
      reviewsAPI.getPublic(),
    ]).then(([productsResult, offersResult, reviewsResult]) => {
      if (productsResult.status === 'fulfilled') setProducts(productsResult.value.data.products || [])
      if (offersResult.status === 'fulfilled') setOffers(offersResult.value.data.offers || [])
      if (reviewsResult.status === 'fulfilled') setReviews(reviewsResult.value.data.reviews || [])
    }).finally(() => setLoading(false))
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <div className="culinary-home">
        <HeroSection heroImage={heroImage} />
        <FeatureStrip />
        <TodayMenu products={products} loading={loading} />
        <OffersSection offers={offers} />
        <StorySection />
        <ReviewsShowcase reviews={reviews} />
        <CentersSection />
        <InstagramFeed instagramUrl={instagramUrl} beholdFeedId={beholdFeedId} />
        <OrderCallout />
      </div>
    </MotionConfig>
  )
}
