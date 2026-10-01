/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  safelist: [
    /* Lolis brand utility classes — force-include so dev-server
       cache misses never cause invisible backgrounds / text. */
    'bg-lolis-pink', 'bg-lolis-pink-dark', 'bg-lolis-pink-light',
    'bg-lolis-yellow', 'bg-lolis-yellow-dark', 'bg-lolis-yellow-light',
    'bg-lolis-mint', 'bg-lolis-mint-dark', 'bg-lolis-mint-light',
    'bg-lolis-dark', 'bg-lolis-gray', 'bg-lolis-gray-2',
    'bg-lolis-bg', 'bg-lolis-border',
    'text-lolis-pink', 'text-lolis-pink-dark', 'text-lolis-pink-light',
    'text-lolis-yellow', 'text-lolis-yellow-dark',
    'text-lolis-mint', 'text-lolis-mint-dark',
    'text-lolis-dark', 'text-lolis-gray', 'text-lolis-gray-2',
    'border-lolis-pink', 'border-lolis-pink-light',
    'border-lolis-yellow', 'border-lolis-mint', 'border-lolis-mint-dark',
    'border-lolis-dark', 'border-lolis-border',
  ],
  theme: {
    extend: {
      colors: {
        /* ── لوليز 2026 identity — warm espresso / caramel, from the brand
           guide (نظام الشعار + الألوان الأساسية). `fuchsia` keeps its old
           name so every existing `bg-fuchsia`/`text-fuchsia` class in the
           admin dashboard repaints for free — only the values changed. */
        fuchsia: {
          DEFAULT: '#C18A4A', dark: '#6A4422', darker: '#20160F',
          light: '#EAD9C2', lighter: '#F6EFE6',
          bg: '#F6EFE6', glow: 'rgba(193,138,74,0.2)',
        },
        brand: {
          yellow: '#F6B91A', 'yellow-dark': '#E09810', 'yellow-bg': '#FFF8DC', 'yellow-glow': 'rgba(246,185,26,0.25)',
          mint: '#C97B52', 'mint-dark': '#A85D37', 'mint-bg': '#FBEADD',
          pink: '#EAD9C2', 'pink-bg': '#F6EFE6',
          dark: '#20160F', 'dark-2': '#6A4422',
          gray: '#7A6855', 'gray-light': '#A08E7A',
          offwhite: '#F6EFE6', bg: '#F6EFE6', 'bg-2': '#F1E6D6',
          border: '#EAD9C2', 'border-light': '#F2E8DA',
          purple: '#8B4FBF', 'purple-bg': '#F3EAFB',
        },
        /* ── Lolis flat brand palette (customer site) ── */
        lolis: {
          pink:         '#C18A4A',
          'pink-dark':  '#6A4422',
          'pink-light': '#F6EFE6',
          yellow:       '#F4C433',
          'yellow-dark':'#D4A710',
          'yellow-light':'#FFFAE6',
          mint:         '#C97B52',
          'mint-dark':  '#A85D37',
          'mint-light': '#FBEADD',
          dark:         '#20160F',
          gray:         '#6B5A4A',
          'gray-2':     '#A08E7A',
          bg:           '#F6EFE6',
          border:       '#EAD9C2',
        },
        glass: {
          white: 'rgba(255,255,255,0.85)',
          'white-sm': 'rgba(255,255,255,0.6)',
          dark: 'rgba(32,22,15,0.85)',
        }
      },
      fontFamily: {
        cairo:   ['Cairo',   'sans-serif'],
        lalezar: ['Lalezar', 'Cairo', 'sans-serif'],
        tajawal: ['Tajawal', 'Cairo', 'sans-serif'],
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(135deg, #C18A4A 0%, #6A4422 40%, #20160F 100%)',
        'hero-radial': 'radial-gradient(ellipse at 70% 50%, rgba(193,138,74,0.18) 0%, transparent 60%)',
        'card-gradient': 'linear-gradient(135deg, rgba(246,239,230,0.9) 0%, rgba(234,217,194,0.9) 100%)',
        'gold-gradient': 'linear-gradient(135deg, #F6B91A 0%, #E09810 100%)',
        'mint-gradient': 'linear-gradient(135deg, #C97B52 0%, #A85D37 100%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
      },
      animation: {
        'float': 'float 3.5s ease-in-out infinite',
        'float-slow': 'float 5s ease-in-out infinite',
        'float-fast': 'float 2.5s ease-in-out infinite',
        'pulse-wa': 'pulseWa 2.5s ease-in-out infinite',
        'shimmer': 'shimmer 1.8s infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
        'bounce-soft': 'bounceSoft 2s ease-in-out infinite',
        'slide-in-right': 'slideInRight 0.4s ease-out',
        'fade-up': 'fadeUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'breathe': 'breathe 4s ease-in-out infinite',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        pulseWa: {
          '0%,100%': { boxShadow: '0 4px 20px rgba(37,211,102,0.5)', transform: 'scale(1)' },
          '50%': { boxShadow: '0 4px 40px rgba(37,211,102,0.8)', transform: 'scale(1.05)' }
        },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        glow: {
          '0%,100%': { boxShadow: '0 0 20px rgba(193,138,74,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(193,138,74,0.6)' }
        },
        bounceSoft: {
          '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' }
        },
        slideInRight: { from: { transform: 'translateX(20px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        fadeUp: { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: 0, transform: 'scale(0.9)' }, to: { opacity: 1, transform: 'scale(1)' } },
        breathe: {
          '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.03)' }
        },
      },
      boxShadow: {
        'card': '0 2px 20px rgba(32,22,15,0.07)',
        'card-hover': '0 8px 32px rgba(193,138,74,0.18)',
        'glass': '0 8px 32px rgba(32,22,15,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glow-fuchsia': '0 0 30px rgba(193,138,74,0.3)',
        'glow-yellow': '0 0 30px rgba(246,185,26,0.3)',
        'glow-mint': '0 0 30px rgba(201,123,82,0.3)',
        'inner-white': 'inset 0 1px 0 rgba(255,255,255,0.5)',
        'xl': '0 20px 60px rgba(32,22,15,0.15)',
        '2xl': '0 30px 80px rgba(193,138,74,0.2)',
      },
      backdropBlur: { xs: '2px' },
      borderRadius: {
        '4xl': '2rem', '5xl': '2.5rem',
      },
      screens: {
        'xs': '400px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      }
    }
  },
  plugins: []
}
