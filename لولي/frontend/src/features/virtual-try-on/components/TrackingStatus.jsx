import { motion, AnimatePresence } from 'framer-motion'
import { Signal, Loader2 } from 'lucide-react'
import { hintToKey } from '../config/i18n'

/**
 * Live tracking feedback: a signal bar plus a one-line instruction.
 *
 * Customers can't debug tracking, so the copy is always an action they can
 * take ("move closer") rather than a status they can't act on.
 */

const QUALITY_META = {
  none:   { bars: 0, color: '#C05050', key: 'qualityNone' },
  poor:   { bars: 1, color: '#F6B91A', key: 'qualityPoor' },
  good:   { bars: 2, color: '#5B8DEF', key: 'qualityGood' },
  strong: { bars: 3, color: '#3FA96A', key: 'qualityStrong' },
}

export default function TrackingStatus({ t, quality = 'none', hint = 'detecting', trackerKind = 'hand', loading = false }) {
  const meta = QUALITY_META[quality] || QUALITY_META.none
  const messageKey = loading ? 'loadingEngine' : hintToKey(hint, trackerKind)
  const message = t(messageKey)

  return (
    <div className="flex flex-col items-center gap-2 pointer-events-none">
      {/* Signal bars */}
      <div className="flex items-end gap-1 px-3 py-1.5 rounded-full backdrop-blur"
        style={{ background: 'rgba(0,0,0,0.4)' }}>
        <Signal size={12} style={{ color: meta.color }} />
        {[1, 2, 3].map(level => (
          <span key={level}
            className="w-1 rounded-full transition-all duration-300"
            style={{
              height: `${4 + level * 3}px`,
              background: level <= meta.bars ? meta.color : 'rgba(255,255,255,0.25)',
            }} />
        ))}
        <span className="text-[10px] font-black mr-1" style={{ color: meta.color }}>
          {t(meta.key)}
        </span>
      </div>

      {/* Instruction — keyed so each new message animates in */}
      <AnimatePresence mode="wait">
        <motion.div
          key={message}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur text-xs font-black"
          style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}
        >
          {loading && <Loader2 size={12} className="animate-spin" />}
          {message}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
