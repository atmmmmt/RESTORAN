import { motion } from 'framer-motion'

export default function EmptyState({ icon = '🍽️', title, description, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center py-16 px-8"
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 3 }}
        className="text-6xl mb-4"
      >
        {icon}
      </motion.div>
      <h3 className="text-xl font-black text-brand-dark mb-2">{title}</h3>
      {description && <p className="text-brand-gray text-sm mb-6">{description}</p>}
      {action}
    </motion.div>
  )
}
