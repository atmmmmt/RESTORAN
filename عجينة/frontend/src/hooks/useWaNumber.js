import { useSiteSettings } from './useSiteSettings'

/**
 * The storefront's WhatsApp number, as a wa.me-ready digit string.
 *
 * It used to be baked into the build, while the dashboard's "WhatsApp number"
 * setting only changed the number *printed* in the footer — every actual
 * button kept dialling the build-time number, so editing the setting looked
 * like it worked and did nothing. The setting now wins everywhere; the build
 * value is only a fallback for before it loads or if it is empty.
 */

/**
 * Accept the number however someone typed it into Settings — "0958 600 085",
 * "+963 958…", "00963…" — and return what wa.me needs: country code and
 * digits only. A local number starting with 0 is Syrian (+963).
 */
export function toWa(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = '963' + d.slice(1)
  return d
}

const FALLBACK = toWa(import.meta.env.VITE_WA_NUMBER || '')

export function useWaNumber() {
  const { waNumber } = useSiteSettings()
  return toWa(waNumber) || FALLBACK
}
