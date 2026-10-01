/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  safelist: [
    'bg-aj-brown', 'bg-aj-brown-dark', 'bg-aj-brown-light',
    'bg-aj-gold', 'bg-aj-gold-dark', 'bg-aj-gold-light',
    'bg-aj-olive', 'bg-aj-olive-dark', 'bg-aj-olive-light',
    'bg-aj-dark', 'bg-aj-gray', 'bg-aj-gray-2',
    'bg-aj-bg', 'bg-aj-border',
    'text-aj-brown', 'text-aj-brown-dark', 'text-aj-brown-light',
    'text-aj-gold', 'text-aj-gold-dark',
    'text-aj-olive', 'text-aj-olive-dark',
    'text-aj-dark', 'text-aj-gray', 'text-aj-gray-2',
    'border-aj-brown', 'border-aj-brown-light',
    'border-aj-gold', 'border-aj-olive', 'border-aj-olive-dark',
    'border-aj-dark', 'border-aj-border',
  ],
  theme: {
    extend: {
      colors: {
        /* ── Primary brand (chocolate/saddle brown) — replaces fuchsia ── */
        fuchsia: {
          DEFAULT:  '#8B4513',
          dark:     '#5C2D0E',
          darker:   '#3D1A00',
          light:    '#C4895A',
          lighter:  '#F2DCC5',
          bg:       'transparent',
          glow:     'rgba(139,69,19,0.2)',
        },
        brand: {
          yellow:       '#D4A017',
          'yellow-dark':'#B8860B',
          'yellow-bg':  '#FFF8DC',
          'yellow-glow':'rgba(212,160,23,0.25)',
          mint:         '#7C9A52',
          'mint-dark':  '#5A7A3A',
          'mint-bg':    '#EEF4E5',
          pink:         '#C4895A',
          'pink-bg':    '#FFF5EC',
          dark:         '#2C1206',
          'dark-2':     '#3D1A0E',
          gray:         '#7A6855',
          'gray-light': '#A09080',
          offwhite:     '#FAF5ED',
          bg:           '#FAF5ED',
          'bg-2':       '#F5EDE0',
          border:       '#E8D5C0',
          'border-light':'#F2E4D0',
          purple:       '#8B6B3A',
          'purple-bg':  '#F5EAD8',
        },
        /* ── عجينة وطحينة flat palette (customer site) ── */
        aj: {
          /* --- new refined palette (brief spec) --- */
          choco:    '#352017',   /* dark chocolate — main dark */
          brown:    '#6F3E25',   /* warm brown */
          caramel:  '#A96734',   /* caramel — primary accent */
          beige:    '#E7D2B7',   /* dough beige — borders, dividers */
          cream:    '#F6EDDF',   /* cream — card surfaces */
          offwhite: '#FBF7F0',   /* warm off-white — page bg */
          rose:     '#C98279',   /* brick rose — secondary accent */
          terra:    '#B96F56',   /* muted terracotta */
          charcoal: '#27201C',   /* charcoal — body text */
          /* --- backward-compat aliases (keep for existing inline refs) --- */
          'brown-old':   '#8B4513',
          'brown-dark':  '#5C2D0E',
          'brown-light': '#FFF5EC',
          gold:          '#D4A017',
          'gold-dark':   '#B8860B',
          'gold-light':  '#FFFAE6',
          olive:         '#7C9A52',
          'olive-dark':  '#5A7A3A',
          'olive-light': '#EEF4E5',
          dark:          '#352017',
          gray:          '#6B5A4A',
          'gray-2':      '#A09080',
          bg:            '#FBF7F0',
          border:        '#E7D2B7',
        },
        glass: {
          white:    'rgba(255,255,255,0.85)',
          'white-sm':'rgba(255,255,255,0.6)',
          dark:     'rgba(44,18,6,0.85)',
        }
      },
      fontFamily: {
        alexandria: ['Alexandria', 'Tajawal', 'sans-serif'],
        cairo:   ['Cairo',   'sans-serif'],
        lalezar: ['Lalezar', 'Cairo', 'sans-serif'],
        tajawal: ['Tajawal', 'Cairo', 'sans-serif'],
      },
      backgroundImage: {
        'hero-gradient':  'linear-gradient(135deg, #8B4513 0%, #5C2D0E 40%, #3D1A00 100%)',
        'hero-radial':    'radial-gradient(ellipse at 70% 50%, rgba(212,160,23,0.18) 0%, transparent 60%)',
        'card-gradient':  'linear-gradient(135deg, rgba(255,245,236,0.9) 0%, rgba(250,245,237,0.9) 100%)',
        'gold-gradient':  'linear-gradient(135deg, #D4A017 0%, #B8860B 100%)',
        'olive-gradient': 'linear-gradient(135deg, #7C9A52 0%, #5A7A3A 100%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
        'choco-gradient': 'linear-gradient(135deg, #8B4513 0%, #5C2D0E 100%)',
        'bread-gradient': 'linear-gradient(135deg, #D4A017 0%, #8B4513 100%)',
      },
      animation: {
        'float':          'float 3.5s ease-in-out infinite',
        'float-slow':     'float 5s ease-in-out infinite',
        'float-fast':     'float 2.5s ease-in-out infinite',
        'pulse-wa':       'pulseWa 2.5s ease-in-out infinite',
        'shimmer':        'shimmer 1.8s infinite',
        'glow':           'glow 2s ease-in-out infinite',
        'spin-slow':      'spin 8s linear infinite',
        'bounce-soft':    'bounceSoft 2s ease-in-out infinite',
        'slide-in-right': 'slideInRight 0.4s ease-out',
        'fade-up':        'fadeUp 0.5s ease-out',
        'scale-in':       'scaleIn 0.3s ease-out',
        'breathe':        'breathe 4s ease-in-out infinite',
        /* ── Bakery-themed ── */
        'dough-bounce':   'doughBounce 1.2s ease-in-out infinite',
        'steam':          'steam 2s ease-in-out infinite',
        'flour-dust':     'flourDust 3s ease-in-out infinite',
        'roll-in':        'rollIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bread-rise':     'breadRise 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'drip':           'drip 3s ease-in-out infinite',
        'sway':           'sway 4s ease-in-out infinite',
      },
      keyframes: {
        float:      { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        pulseWa:    {
          '0%,100%': { boxShadow: '0 4px 20px rgba(212,160,23,0.5)', transform: 'scale(1)' },
          '50%':     { boxShadow: '0 4px 40px rgba(212,160,23,0.8)', transform: 'scale(1.05)' },
        },
        shimmer:    { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        glow:       {
          '0%,100%': { boxShadow: '0 0 20px rgba(139,69,19,0.3)' },
          '50%':     { boxShadow: '0 0 40px rgba(139,69,19,0.6)' },
        },
        bounceSoft: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        slideInRight: { from: { transform: 'translateX(20px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        fadeUp:     { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        scaleIn:    { from: { opacity: 0, transform: 'scale(0.9)' }, to: { opacity: 1, transform: 'scale(1)' } },
        breathe:    { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.03)' } },
        /* ── Bakery ── */
        doughBounce: {
          '0%,100%': { transform: 'scaleY(1) scaleX(1)' },
          '40%':     { transform: 'scaleY(0.88) scaleX(1.06)' },
          '70%':     { transform: 'scaleY(1.04) scaleX(0.97)' },
        },
        steam: {
          '0%':     { transform: 'translateY(0) scale(1)', opacity: 0.7 },
          '60%':    { transform: 'translateY(-18px) scale(1.15)', opacity: 0.35 },
          '100%':   { transform: 'translateY(-30px) scale(1.3)', opacity: 0 },
        },
        flourDust: {
          '0%,100%': { transform: 'rotate(-3deg) scale(1)',    opacity: 0.6 },
          '50%':     { transform: 'rotate(3deg)  scale(1.05)', opacity: 1   },
        },
        rollIn: {
          from: { transform: 'translateX(60px) rotate(20deg)', opacity: 0 },
          to:   { transform: 'translateX(0) rotate(0deg)',      opacity: 1 },
        },
        breadRise: {
          from: { transform: 'scaleY(0.7) translateY(10px)', opacity: 0 },
          to:   { transform: 'scaleY(1) translateY(0)',       opacity: 1 },
        },
        drip: {
          '0%,100%': { transform: 'translateY(0)', opacity: 1 },
          '50%':     { transform: 'translateY(5px)', opacity: 0.8 },
        },
        sway: {
          '0%,100%': { transform: 'rotate(-2deg)' },
          '50%':     { transform: 'rotate(2deg)' },
        },
      },
      boxShadow: {
        'card':          '0 2px 20px rgba(44,18,6,0.08)',
        'card-hover':    '0 8px 32px rgba(139,69,19,0.18)',
        'glass':         '0 8px 32px rgba(44,18,6,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glow-fuchsia':  '0 0 30px rgba(139,69,19,0.3)',
        'glow-yellow':   '0 0 30px rgba(212,160,23,0.35)',
        'glow-mint':     '0 0 30px rgba(124,154,82,0.3)',
        'inner-white':   'inset 0 1px 0 rgba(255,255,255,0.5)',
        'xl':            '0 20px 60px rgba(44,18,6,0.15)',
        '2xl':           '0 30px 80px rgba(139,69,19,0.2)',
        'choco':         '0 4px 20px rgba(139,69,19,0.35)',
        'gold':          '0 4px 20px rgba(212,160,23,0.35)',
      },
      backdropBlur: { xs: '2px' },
      borderRadius: { '4xl': '2rem', '5xl': '2.5rem' },
      screens: {
        xs: '400px', sm: '640px', md: '768px',
        lg: '1024px', xl: '1280px', '2xl': '1536px',
      }
    }
  },
  plugins: []
}
