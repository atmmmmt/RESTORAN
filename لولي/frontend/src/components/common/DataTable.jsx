import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import LoadingState from './LoadingState'
import EmptyState from './EmptyState'

export default function DataTable({
  columns,
  data = [],
  loading,
  searchable,
  emptyIcon,
  emptyTitle = 'لا توجد بيانات',
  emptyDescription,
  searchPlaceholder = 'بحث...',
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PER_PAGE = 10

  const filtered = search
    ? data.filter(row =>
        columns.some(col =>
          String(row[col.key] || '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : data

  const pages = Math.ceil(filtered.length / PER_PAGE)
  const rows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <div>
      {searchable && (
        <div className="mb-4 relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pr-11 pl-4 py-3 border-2 border-brand-border rounded-xl text-sm text-brand-dark bg-white focus:outline-none focus:border-fuchsia transition-colors"
          />
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-brand-bg">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className="text-right px-4 py-3 text-xs font-bold text-brand-gray whitespace-nowrap"
                    style={{ minWidth: col.minWidth }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <motion.tr
                  key={row._id || i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-t border-brand-border hover:bg-brand-offwhite transition-colors"
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-sm text-brand-dark whitespace-nowrap">
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="w-9 h-9 rounded-xl text-sm font-bold bg-white text-brand-gray border border-brand-border disabled:opacity-40"
          >
            ›
          </button>
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`w-9 h-9 rounded-xl text-sm font-bold ${page === i + 1 ? 'bg-fuchsia text-white' : 'bg-white text-brand-gray border border-brand-border'}`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="w-9 h-9 rounded-xl text-sm font-bold bg-white text-brand-gray border border-brand-border disabled:opacity-40"
          >
            ‹
          </button>
        </div>
      )}
    </div>
  )
}
