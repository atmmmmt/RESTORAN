import { motion } from 'framer-motion'

export default function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between mb-6"
    >
      <div>
        {breadcrumb && <div className="text-sm text-brand-gray mb-1">{breadcrumb}</div>}
        <h1 className="text-2xl font-black text-brand-dark">{title}</h1>
        {subtitle && <p className="text-sm text-brand-gray mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </motion.div>
  )
}
