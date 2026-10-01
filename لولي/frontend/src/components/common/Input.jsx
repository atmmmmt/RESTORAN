export default function Input({ label, error, required, type = 'text', className = '', helperText, ...props }) {
  const base = `w-full px-4 py-3 border-2 rounded-xl font-cairo text-brand-dark bg-white transition-colors duration-200 focus:outline-none focus:border-fuchsia text-right ${error ? 'border-red-400 bg-red-50' : 'border-brand-border'} ${className}`

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-bold text-brand-dark">
          {label}
          {required && <span className="text-fuchsia mr-1">*</span>}
        </label>
      )}
      {type === 'textarea' ? (
        <textarea className={`${base} resize-none`} rows={4} {...props} />
      ) : (
        <input type={type} className={base} {...props} />
      )}
      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
      {helperText && !error && <p className="text-xs text-brand-gray">{helperText}</p>}
    </div>
  )
}
