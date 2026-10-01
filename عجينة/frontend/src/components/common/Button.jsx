import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

const variants = {
  primary: 'bg-fuchsia hover:bg-fuchsia-dark text-white shadow-md',
  secondary: 'bg-brand-yellow hover:bg-brand-yellow-dark text-brand-dark',
  outline: 'border-2 border-fuchsia text-fuchsia hover:bg-fuchsia-bg',
  ghost: 'text-brand-gray hover:bg-brand-bg',
  danger: 'bg-red-500 hover:bg-red-600 text-white',
  mint: 'bg-brand-mint hover:bg-green-500 text-white',
  whatsapp: 'bg-[#25D366] hover:bg-[#128C7E] text-white',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3.5 text-base rounded-2xl',
}

export default function Button({ children, variant = 'primary', size = 'md', loading, icon, className = '', ...props }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`font-bold flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </motion.button>
  )
}
