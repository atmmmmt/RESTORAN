import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Store, Home, Users, Wallet, Receipt, ShoppingCart, Trash2,
  AlertTriangle, Package, Loader2,
} from 'lucide-react'
import { centerPortalAPI } from '../../services/api'
import toast from 'react-hot-toast'
import CenterEmployeesTab from './CenterEmployeesTab'
import CenterSalaryTab from './CenterSalaryTab'
import CenterExpensesTab from './CenterExpensesTab'
import CenterWasteTab from './CenterWasteTab'
import CenterPurchasesTab from './CenterPurchasesTab'

const fmt = (n) => Number(n || 0).toLocaleString('ar-SY')
const fmtDate = (d) => new Date(d).toLocaleDateString('ar-SY', { year: 'numeric', month: 'short', day: 'numeric' })

export default function CenterPortalDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saleModal, setSaleModal] = useState(false)
  const [saleForm, setSaleForm] = useState({ productId: '', quantity: 1, notes: '' })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('overview')

  const centerInfo = JSON.parse(localStorage.getItem('luliz_center_info') || '{}')

  const load = () => {
    setLoading(true)
    centerPortalAPI.getMe()
      .then(r => setData(r.data))
      .catch(() => {
        toast.error('انتهت الجلسة')
        logout()
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const logout = () => {
    localStorage.removeItem('luliz_center_token')
    localStorage.removeItem('luliz_center_info')
    navigate('/center-portal/login', { replace: true })
  }

  const openSaleModal = () => {
    const firstItem = data?.center?.inventory?.find(i => i.quantity > 0)
    setSaleForm({ productId: firstItem?.productId || '', quantity: 1, notes: '' })
    setSaleModal(true)
  }

  const recordSale = async () => {
    if (!saleForm.productId || saleForm.quantity < 1) return toast.error('اختر المنتج وأدخل الكمية')
    setSaving(true)
    try {
      const res = await centerPortalAPI.recordSale(saleForm)
      toast.success('تم تسجيل البيع')
      if (res.data.isLowStock) {
        toast('تنبيه: المخزون منخفض من هذا الصنف!', { icon: <AlertTriangle size={16} />, duration: 4000 })
      }
      setSaleModal(false)
      load()
    } catch (err) {
      toast.error(err.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ fontFamily: 'Cairo, sans-serif' }}>
        <div className="text-center">
          <Loader2 size={36} className="mx-auto mb-3 animate-spin text-gray-400" />
          <p className="font-bold text-gray-500">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  const { center, balance, recentSales = [] } = data || {}
  const inventory = center?.inventory || []
  const lowStock = inventory.filter(i => i.quantity < (center?.lowStockThreshold || 5))
  const availableItems = inventory.filter(i => i.quantity > 0)

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Cairo, sans-serif', direction: 'rtl' }}>
      {/* Header */}
      <div className="bg-white shadow-sm px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-gray-800 flex items-center gap-2"><Store size={18} /> {center?.name}</h1>
          <p className="text-xs text-gray-500 font-bold">{center?.location}</p>
        </div>
        <button onClick={logout} className="text-sm font-bold text-red-500 hover:text-red-700 px-3 py-1.5 rounded-xl border border-red-200 hover:bg-red-50">
          خروج
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'overview', label: 'الرئيسية', Icon: Home },
            { key: 'employees', label: 'الموظفون', Icon: Users },
            { key: 'salary', label: 'الرواتب', Icon: Wallet },
            { key: 'expenses', label: 'المصاريف', Icon: Receipt },
            { key: 'purchases', label: 'المشتريات', Icon: ShoppingCart },
            { key: 'waste', label: 'الهدر', Icon: Trash2 },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl font-black text-sm whitespace-nowrap flex items-center gap-1.5 ${
                tab === t.key ? 'text-white shadow' : 'bg-white text-gray-600 border border-gray-200'
              }`}
              style={tab === t.key ? { background: 'linear-gradient(135deg, #C18A4A, #F6B91A)' } : {}}
            >
              <t.Icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'employees' && <CenterEmployeesTab />}
      {tab === 'salary' && <CenterSalaryTab />}
      {tab === 'expenses' && <CenterExpensesTab />}
      {tab === 'purchases' && <CenterPurchasesTab />}
      {/* Waste needs the branch's own stock list to pick from. */}
      {tab === 'waste' && <CenterWasteTab inventory={data?.center?.inventory || []} />}

      {tab === 'overview' && (
      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={20} className="text-amber-600" />
              <span className="font-black text-amber-800">تنبيه: مخزون منخفض</span>
            </div>
            <div className="space-y-1">
              {lowStock.map(item => (
                <div key={item.productId} className="flex justify-between text-sm font-bold text-amber-700">
                  <span>{item.productNameSnapshot}</span>
                  <span>متبقي: {item.quantity}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Balance card */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-2xl font-black text-pink-600">{fmt(balance?.amountOwed)}</div>
            <div className="text-xs font-bold text-gray-500 mt-1">المبلغ المستحق</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-2xl font-black text-blue-600">{fmt(balance?.totalDelivered)}</div>
            <div className="text-xs font-bold text-gray-500 mt-1">إجمالي البضاعة</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-2xl font-black text-green-600">{fmt(balance?.totalCollected)}</div>
            <div className="text-xs font-bold text-gray-500 mt-1">إجمالي المدفوع</div>
          </div>
        </div>

        {/* Inventory */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-gray-800 text-base flex items-center gap-2"><Package size={17} className="text-gray-400" /> المخزون الحالي</h2>
            {availableItems.length > 0 && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={openSaleModal}
                className="px-4 py-2 rounded-xl font-black text-white text-sm shadow"
                style={{ background: 'linear-gradient(135deg, #C18A4A, #F6B91A)' }}
              >
                + تسجيل بيع
              </motion.button>
            )}
          </div>
          {inventory.length === 0 ? (
            <div className="text-center py-8 text-gray-400 font-bold">لا يوجد مخزون حتى الآن</div>
          ) : (
            <div className="space-y-2">
              {inventory.map(item => {
                const isLow = item.quantity < (center?.lowStockThreshold || 5)
                const isEmpty = item.quantity === 0
                return (
                  <div key={item.productId}
                    className={`flex items-center justify-between p-3 rounded-xl border ${
                      isEmpty ? 'bg-red-50 border-red-200' :
                      isLow   ? 'bg-amber-50 border-amber-200' :
                                'bg-gray-50 border-gray-100'
                    }`}>
                    <span className="font-bold text-gray-800 text-sm">{item.productNameSnapshot}</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-black text-base ${
                        isEmpty ? 'text-red-600' : isLow ? 'text-amber-700' : 'text-green-700'
                      }`}>
                        {item.quantity}
                      </span>
                      {isEmpty && <span className="text-xs font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-lg">نفدت</span>}
                      {isLow && !isEmpty && <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">منخفض</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Sales */}
        {recentSales.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="font-black text-gray-800 text-base mb-3 flex items-center gap-2"><Receipt size={17} className="text-gray-400" /> آخر المبيعات</h2>
            <div className="space-y-2">
              {recentSales.map(s => (
                <div key={s._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="font-bold text-sm text-gray-800">{s.productNameSnapshot}</div>
                    <div className="text-xs text-gray-500">{fmtDate(s.saleDate)}</div>
                  </div>
                  <div className="font-black text-gray-700">{s.quantity} قطعة</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Sale Modal */}
      <AnimatePresence>
        {saleModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4"
            onClick={e => e.target === e.currentTarget && setSaleModal(false)}
          >
            <motion.div
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm"
              style={{ direction: 'rtl' }}
            >
              <h3 className="font-black text-gray-800 text-lg mb-4">تسجيل بيع جديد</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-gray-700 mb-1.5 block">المنتج</label>
                  <select
                    value={saleForm.productId}
                    onChange={e => setSaleForm(p => ({ ...p, productId: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-pink-400 focus:outline-none font-bold text-sm bg-white"
                  >
                    <option value="">اختر المنتج</option>
                    {availableItems.map(item => (
                      <option key={item.productId} value={item.productId}>
                        {item.productNameSnapshot} (متوفر: {item.quantity})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 mb-1.5 block">الكمية المباعة</label>
                  <input
                    type="number"
                    min="1"
                    value={saleForm.quantity}
                    onChange={e => setSaleForm(p => ({ ...p, quantity: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-pink-400 focus:outline-none font-bold text-lg"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 mb-1.5 block">ملاحظات (اختياري)</label>
                  <input
                    type="text"
                    value={saleForm.notes}
                    onChange={e => setSaleForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-pink-400 focus:outline-none font-bold text-sm"
                    placeholder="ملاحظة اختيارية..."
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={recordSale}
                    disabled={saving}
                    className="flex-1 py-3 rounded-2xl font-black text-white shadow-lg disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #C18A4A, #F6B91A)' }}
                  >
                    {saving ? '...' : 'تسجيل البيع'}
                  </motion.button>
                  <button onClick={() => setSaleModal(false)}
                    className="flex-1 py-3 rounded-2xl font-black border-2 border-gray-200 text-gray-600 hover:bg-gray-50">
                    إلغاء
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
