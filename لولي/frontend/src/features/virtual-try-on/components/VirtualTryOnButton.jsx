import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Box, Sparkles, Camera, Move3d } from 'lucide-react'

import { useTryOnCalibration } from '../hooks/useTryOnCalibration'
import { buildStoreConfig, isTypeAllowed, resolveTheme, resolveLocale } from '../config/storeConfig'
import { createTranslator } from '../config/i18n'
import { getTryOnMode, TYPE_LABELS, SPACE_TYPES } from '../types/virtualTryOn.types'
import { resolveExperience } from '../utils/deviceSupport'
import { prefetchModel } from '../utils/modelLoader'
import { vtoAnalytics } from '../services/analytics'

/* The modal — and everything under it — is only fetched on first open. */
const VirtualTryOnModal = lazy(() => import('./VirtualTryOnModal'))

/**
 * Entry point a storefront drops next to "add to cart".
 *
 * Renders nothing at all unless the product genuinely has a viewable model,
 * so a menu of 40 items with no 3D assets costs one cheap API read each and
 * zero AR bytes.
 */
export default function VirtualTryOnButton({
  product,
  storeConfig: storeConfigOverrides,
  onAddToCart,
  onChooseAnother,
  formatPrice,
  variant = 'full',        // 'full' = two buttons, 'compact' = one
  className = '',
  /** Pass a pre-fetched config to skip the per-card request in a grid. */
  presetConfig = null,
}) {
  const [open, setOpen] = useState(false)

  const storeConfig = useMemo(() => buildStoreConfig(storeConfigOverrides), [storeConfigOverrides])
  const theme = useMemo(() => resolveTheme(storeConfig.themeMode), [storeConfig.themeMode])
  const t = useMemo(() => createTranslator(resolveLocale()), [])

  const { config: fetched, loading } = useTryOnCalibration(product?._id, {
    autoLoad: !presetConfig,
  })
  const config = presetConfig || fetched

  const mode = config?.mode || getTryOnMode(config?.type)
  const isSpace = SPACE_TYPES.includes(config?.type)

  /* Every reason to hide the button, checked before anything is loaded. */
  const visible = !!(
    config?.isViewable
    && isTypeAllowed(storeConfig, config.type)
    && config.model3DUrl
  )

  const experience = useMemo(
    () => (visible ? resolveExperience({ ...config, mode }) : null),
    [visible, config, mode]
  )

  /** Warm the model once the customer shows intent — feels instant on open. */
  const warm = useCallback(() => {
    if (visible && config?.model3DUrl) prefetchModel(config.model3DUrl)
  }, [visible, config?.model3DUrl])

  const openViewer = useCallback(() => {
    vtoAnalytics.buttonClicked(product?._id, config?.type, experience?.experience)
    setOpen(true)
  }, [product?._id, config?.type, experience])

  if (loading || !visible) return null

  const tryLabel = TYPE_LABELS[config.type]?.[resolveLocale()] || t('tryItOnGeneric')
  const viewLabel = isSpace ? t('view360') : t('viewPiece360')
  const TryIcon = isSpace ? Move3d : Camera

  const primaryLabel = storeConfig.primaryButtonLabel || tryLabel
  const secondaryLabel = storeConfig.secondaryButtonLabel || viewLabel

  return (
    <>
      <div
        className={`flex flex-wrap gap-2 ${className}`}
        onMouseEnter={warm}
        onTouchStart={warm}
      >
        {variant === 'full' && (
          <button
            onClick={openViewer}
            className="flex items-center justify-center gap-2 px-4 py-2.5 font-bold text-sm transition-transform active:scale-95"
            style={{
              background: 'transparent',
              color: theme.primary,
              border: `1.5px solid ${theme.accent}`,
              borderRadius: '9999px',
              fontFamily: theme.fontHeading,
            }}
          >
            {secondaryLabel} <Box size={15} />
          </button>
        )}

        <button
          onClick={openViewer}
          className="flex items-center justify-center gap-2 px-4 py-2.5 font-black text-sm transition-transform active:scale-95"
          style={{
            background: theme.primary,
            color: theme.onPrimary,
            borderRadius: '9999px',
            fontFamily: theme.fontHeading,
          }}
        >
          {primaryLabel} <TryIcon size={15} />
        </button>
      </div>

      {open && (
        <Suspense fallback={null}>
          <VirtualTryOnModal
            open={open}
            onClose={() => setOpen(false)}
            product={product}
            config={{ ...config, mode }}
            storeConfig={storeConfig}
            onAddToCart={onAddToCart}
            onChooseAnother={onChooseAnother}
            formatPrice={formatPrice}
          />
        </Suspense>
      )}
    </>
  )
}

/** Small badge for product cards, signalling AR without a full button row. */
export function VirtualTryOnBadge({ config, className = '' }) {
  const theme = useMemo(() => resolveTheme('inherit'), [])
  const t = useMemo(() => createTranslator(resolveLocale()), [])
  if (!config?.isViewable) return null

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black ${className}`}
      style={{ background: `${theme.primary}1F`, color: theme.primary }}
    >
      <Sparkles size={10} /> {t('arExperience')}
    </span>
  )
}
