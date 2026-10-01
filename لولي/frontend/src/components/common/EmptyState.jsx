import { motion } from 'framer-motion'
import { Inbox } from 'lucide-react'

/** `icon` takes a lucide component (e.g. `icon={Store}`), not an element or emoji. */
export default function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center py-16 px-8"
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 3 }}
        className="mb-4 text-brand-gray-light flex justify-center"
      >
        <Icon size={52} strokeWidth={1.25} />
      </motion.div>
      <h3 className="text-xl font-black text-brand-dark mb-2">{title}</h3>
      {description && <p className="text-brand-gray text-sm mb-6">{description}</p>}
      {action}
    </motion.div>
  )
}
