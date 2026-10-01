import { motion } from 'framer-motion'

export default function LoadingState({ text = 'جاري التحميل...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        className="w-12 h-12 border-4 border-brand-border border-t-fuchsia rounded-full mb-4"
      />
      <p className="text-brand-gray font-bold text-sm">{text}</p>
    </div>
  )
}
