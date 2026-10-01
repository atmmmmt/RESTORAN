/**
 * Developer credit, shown on the storefront footer (desktop), at the foot of
 * every storefront page on mobile (where the footer is hidden), and on the
 * dashboard login screen.
 */
export default function PoweredBy({ className = '', style }) {
  return (
    <div className={`text-xs font-medium ${className}`} style={style}>
      برمج وطوّر من قبل{' '}
      <a href="https://prootech-agency.com/" target="_blank" rel="noopener"
        className="font-black underline-offset-2 hover:underline" dir="ltr">
        Prootech Agency
      </a>
    </div>
  )
}
