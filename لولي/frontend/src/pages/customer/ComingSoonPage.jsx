import { motion } from 'framer-motion'
import { Sparkles, Instagram } from 'lucide-react'

export default function ComingSoonPage() {
  return (
    <div
      className="min-h-screen bg-white flex flex-col items-center justify-center overflow-hidden"
      dir="rtl"
      style={{ fontFamily: 'Cairo, sans-serif' }}
    >
      {/* Soft background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.15, 1], x: [0, 20, 0], y: [0, -15, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #C18A4A, transparent)' }}
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], x: [0, -25, 0], y: [0, 20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #F6B91A, transparent)' }}
        />
      </div>

      {/* Logo with orbit */}
      <div className="relative mb-8">
        <motion.div
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="relative"
        >
          <img
            src="/brand/luliz-logo-round.png"
            alt="لوليز"
            className="w-36 h-36 object-contain drop-shadow-xl"
            draggable={false}
          />
        </motion.div>

        {/* Orbiting dot */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 pointer-events-none"
          style={{ transformOrigin: 'center' }}
        >
          <div
            className="absolute w-3 h-3 rounded-full shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #C18A4A, #F6B91A)',
              top: '-6px',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          />
        </motion.div>
      </div>

      {/* Text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center mb-8 px-6"
      >
        <h1 className="text-3xl font-black text-gray-900 mb-2 flex items-center justify-center gap-2">
          انتظرونا قريباً <Sparkles size={24} className="text-[#C18A4A]" />
        </h1>
        <p className="text-gray-500 font-bold text-base">نعمل على شيء رائع — موقعنا قادم!</p>
      </motion.div>

      {/* Instagram */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex flex-col items-center gap-3"
      >
        <span className="text-gray-400 font-bold text-sm">تابعونا على الانستغرام</span>
        <a
          href="https://www.instagram.com/loliz_taste/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-white shadow-lg text-sm"
          style={{ background: 'linear-gradient(135deg, #C18A4A, #F6B91A)' }}
        >
          <Instagram size={17} />
          @loliz_taste
        </a>
      </motion.div>
    </div>
  )
}
