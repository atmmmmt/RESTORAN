export default function Select({ label, error, required, options = [], placeholder, className = '', ...props }) {
  const base = `w-full px-4 py-3 border-2 rounded-xl font-cairo text-brand-dark bg-white transition-colors duration-200 focus:outline-none focus:border-fuchsia text-right appearance-none cursor-pointer ${error ? 'border-red-400 bg-red-50' : 'border-brand-border'} ${className}`

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-bold text-brand-dark">
          {label}
          {required && <span className="text-fuchsia mr-1">*</span>}
        </label>
      )}
      <div className="relative">
        <select className={base} {...props}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-brand-gray text-xs">▼</div>
      </div>
      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
    </div>
  )
}
