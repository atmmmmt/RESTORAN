import axios from 'axios'
import toast from 'react-hot-toast'
import { cacheResponse, readCache, enqueue, flushQueue, isNetworkError, REPLAY_HEADER } from './offline'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3002/api')

/* One backend serves both brands, so every request has to say which one it is
   speaking for. Baked in at build time — this build is لوليز's. */
const TENANT = import.meta.env.VITE_TENANT || 'luliz'

/* For the few places that reach the API with a bare fetch() instead of axios —
   without this they fall back to the server's default brand. */
export const tenantHeader = { 'X-Tenant': TENANT }

const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': TENANT }
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('luliz_admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/* Requests that must never be cached or replayed — auth and live device
   commands are meaningless once the moment has passed. */
const NO_OFFLINE = [/\/auth\//, /\/attendance\/device\//, /\/attendance\/stream/]
const skipOffline = url => NO_OFFLINE.some(re => re.test(url || ''))

/* A stray 401 from an unrelated background request (e.g. a list refresh
   firing the moment a cashier hits "confirm order") used to hard-navigate
   the whole app to /admin/login, killing whatever was mid-flight — cart
   included. Only a failed page-load GET is treated as "you're logged out";
   a failed write just surfaces its own error and lets the real GET on the
   next navigation catch a truly dead session. `redirecting` stops two
   concurrent 401s from firing the navigation twice. */
let redirecting = false

api.interceptors.response.use(
  res => {
    // Keep the last good copy of every GET so pages still render offline.
    if (res.config?.method === 'get' && !skipOffline(res.config.url)) {
      cacheResponse(res.config, res.data)
    }
    return res
  },
  async err => {
    const message = err.response?.data?.message
      || (err.code === 'ECONNABORTED' ? 'الاتصال بطيء جداً — حاول مجدداً' : 'حدث خطأ غير متوقع')
    const config = err.config || {}
    const method = (config.method || 'get').toLowerCase()

    if (err.response?.status === 401) {
      if (method === 'get' && !redirecting && !skipOffline(config.url)) {
        redirecting = true
        localStorage.removeItem('luliz_admin_token')
        localStorage.removeItem('luliz_admin_user')
        window.location.href = '/admin/login'
      }
      return Promise.reject({ ...err, message })
    }

    /* ── Offline handling ── */
    if (isNetworkError(err) && !skipOffline(config.url)) {
      const method = (config.method || 'get').toLowerCase()

      /* A failed replay must never be re-queued. Without this the drain
         duplicates the entry it was trying to send — and for a cash record
         that means the amount is booked twice. flushQueue keeps the original
         and retries it on the next reconnect. */
      const isReplay = !!(config.headers?.[REPLAY_HEADER] || config.headers?.[REPLAY_HEADER.toLowerCase()])
      if (isReplay) return Promise.reject({ ...err, message: 'لا يوجد اتصال بالإنترنت' })

      if (method === 'get') {
        const cached = await readCache(config)
        if (cached) {
          toast('بيانات محفوظة — أنت غير متصل', { id: 'offline-read' })
          return { data: cached.data, status: 200, fromCache: true, cachedAt: cached.at, config }
        }
      } else if (['post', 'put', 'delete', 'patch'].includes(method)) {
        await enqueue(config)
        toast('تم الحفظ محلياً — سيُرسل عند عودة الاتصال', { id: 'offline-write' })
        return { data: { success: true, queuedOffline: true, message: 'محفوظ محلياً' }, status: 202, config }
      }

      return Promise.reject({ ...err, message: 'لا يوجد اتصال بالإنترنت' })
    }

    return Promise.reject({ ...err, message })
  }
)

/* Drain the queue as soon as the browser reports it's back online. */
if (typeof window !== 'undefined') {
  const drain = async () => {
    const { sent, failed } = await flushQueue(api)
    if (sent)   toast.success(`تمت مزامنة ${sent} عملية محفوظة`)
    if (failed) toast.error(`${failed} عملية رُفضت من الخادم`)
  }
  window.addEventListener('online', drain)
  // Anything left over from a previous session goes out on load.
  if (navigator.onLine) setTimeout(drain, 2500)
}

/* Named export so feature modules (e.g. virtual-try-on) can reuse this
   instance and inherit auth, offline queueing and error normalisation. */
export { api }

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
}

export const usersAPI = {
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  remove: (id) => api.delete(`/users/${id}`),
}

export const internalOrdersAPI = {
  getAll:     (params) => api.get('/internal-orders', { params }),
  getOne:     (key)    => api.get(`/internal-orders/${key}`),
  create:     (data)   => api.post('/internal-orders', data),
  setStatus:  (id, status) => api.put(`/internal-orders/${id}/status`, { status }),
  todayStats: ()       => api.get('/internal-orders/stats/today'),
  remove:     (id)     => api.delete(`/internal-orders/${id}`), // admin only
  dailyReport: (date)  => api.get('/internal-orders/daily-report', { params: date ? { date } : {} }),
}

/* Admin-only: partners' percentages of net profit + the monthly settlement. */
export const profitSharesAPI = {
  get:     ()            => api.get('/profit-shares'),
  save:    (partners)    => api.put('/profit-shares', { partners }),
  monthly: (year, month) => api.get('/profit-shares/monthly', { params: { year, month } }),
  saveInvestor: (data)   => api.put('/profit-shares/investor', data),
}

export const printerAPI = {
  getSettings:  ()               => api.get('/printer/settings'),
  saveSettings: (data)           => api.put('/printer/settings', data),
  probe:        (ip, port)       => api.post('/printer/device/probe', { ip, port }),
  test:         (station)        => api.post(`/printer/device/test/${station}`),
  scan:         (baseIp, port)   => api.post('/printer/device/scan', { baseIp, port }),
  /* raster = { width, height, data } from utils/ticketRenderer */
  print:        (station, raster) => api.post(`/printer/print/${station}`, raster),
}

export const attendanceAPI = {
  /* settings */
  getSettings:  ()   => api.get('/attendance/settings'),
  saveSettings: (d)  => api.put('/attendance/settings', d),

  /* device */
  deviceStatus: ()   => api.get('/attendance/device/status'),
  testPort:     (d)  => api.post('/attendance/device/test-port', d),
  scan:         (d)  => api.post('/attendance/device/scan', d),
  connect:      (d)  => api.post('/attendance/device/connect', d || {}),
  disconnect:   ()   => api.post('/attendance/device/disconnect'),
  deviceInfo:   ()   => api.get('/attendance/device/info'),
  syncTime:     ()   => api.post('/attendance/device/sync-time'),
  deviceUsers:  ()   => api.get('/attendance/device/users'),

  /* employee ⇄ device */
  pushEmployee:     (id)     => api.post(`/attendance/employees/${id}/push`),
  enroll:           (id, fi) => api.post(`/attendance/employees/${id}/enroll`, { fingerIndex: fi }),
  clearPrints:      (id)     => api.delete(`/attendance/employees/${id}/fingerprints`),
  removeFromDevice: (id)     => api.delete(`/attendance/employees/${id}/device`),

  /* data */
  sync:     ()             => api.post('/attendance/sync'),
  /** `center` accepts 'all' | 'hq' | <branchId>. */
  daily:    (date, center)       => api.get('/attendance/daily', { params: { date, center } }),
  summary:  (from, to, center)   => api.get('/attendance/summary', { params: { from, to, center } }),
  employee: (id, from, to) => api.get(`/attendance/employee/${id}`, { params: { from, to } }),

  /* manual */
  punch:       (d)  => api.post('/attendance/punch', d),
  deletePunch: (id) => api.delete(`/attendance/punch/${id}`),
  reset:       (d)  => api.delete('/attendance/reset', { data: d }),

  /** SSE URL — EventSource can't set headers, so the token rides the query. */
  streamUrl: () => {
    const base = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3002/api')
    const token = localStorage.getItem('luliz_admin_token')
    return `${base}/attendance/stream?token=${encodeURIComponent(token || '')}`
  },
}

export const ingredientsAPI = {
  getAll: () => api.get('/ingredients'),
  getById: (id) => api.get(`/ingredients/${id}`),
  create: (data) => api.post('/ingredients', data),
  update: (id, data) => api.put(`/ingredients/${id}`, data),
  delete: (id) => api.delete(`/ingredients/${id}`),
}

export const purchasesAPI = {
  getAll: (params) => api.get('/purchases', { params }),
  create: (data) => api.post('/purchases', data),
  update: (id, data) => api.put(`/purchases/${id}`, data), // admin only
  remove: (id) => api.delete(`/purchases/${id}`), // admin only
}

export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),
  getPublic: () => api.get('/products/public'),
  getToday: () => api.get('/products/today'),
  /* Customer-facing detail view — no auth, and it hides cost fields.
     The admin `getById` below needs a token and 401s for a visitor. */
  getPublicById: (id) => api.get(`/products/public/${id}`),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
}

export const productionAPI = {
  getAll: (params) => api.get('/production', { params }),
  create: (data) => api.post('/production', data),
}

export const salesAPI = {
  getAll: (params) => api.get('/sales', { params }),
  create: (data) => api.post('/sales', data),
}

export const centersAPI = {
  getAll: () => api.get('/centers'),
  getById: (id) => api.get(`/centers/${id}`),
  create: (data) => api.post('/centers', data),
  update: (id, data) => api.put(`/centers/${id}`, data),
  delete: (id) => api.delete(`/centers/${id}`),
  setPortal: (id, data) => api.put(`/centers/${id}/portal`, data),
  getLowStockAlerts: () => api.get('/centers/alerts/low-stock'),
}

export const deliveriesAPI = {
  getAll: (params) => api.get('/center-deliveries', { params }),
  create: (data) => api.post('/center-deliveries', data),
}

export const settlementsAPI = {
  getAll: (params) => api.get('/center-settlements', { params }),
  create: (data) => api.post('/center-settlements', data),
}

export const wasteAPI = {
  getAll: (params) => api.get('/waste', { params }),
  create: (data) => api.post('/waste', data),
  getSummary: (params) => api.get('/waste/summary', { params }),
  /** Loss per branch — answers which site is losing the most. */
  getByCenter: (params) => api.get('/waste/by-center', { params }),
}

export const offersAPI = {
  getAll: () => api.get('/offers'),
  getPublic: () => api.get('/offers/public'),
  create: (data) => api.post('/offers', data),
  update: (id, data) => api.put(`/offers/${id}`, data),
  delete: (id) => api.delete(`/offers/${id}`),
}

export const ordersAPI = {
  getAll: (params) => api.get('/orders', { params }),
  create: (data) => api.post('/orders', data),
  updateStatus: (id, status) => api.put(`/orders/${id}/status`, { status }),
  remove: (id) => api.delete(`/orders/${id}`), // admin only
}

export const cashAPI = {
  /** `center` accepts 'all' | 'hq' | <branchId>. Omitted = whole business. */
  getBalance: (center) => api.get('/cash/balance', { params: { center } }),
  /** Balance for every branch + head office in one call. */
  getBalancesByCenter: () => api.get('/cash/balances-by-center'),
  getTransactions: (params) => api.get('/cash/transactions', { params }),
  getSummary: (params) => api.get('/cash/summary', { params }),
  addIncome: (data) => api.post('/cash/manual-income', data),
  addExpense: (data) => api.post('/cash/manual-expense', data),
  addAdjustment: (data) => api.post('/cash/adjustment', data),
}

export const reportsAPI = {
  getDashboard: (date) => api.get('/reports/dashboard', { params: { date } }),
  getDaily: (date) => api.get('/reports/daily', { params: { date } }),
  getMonthly: (year, month) => api.get('/reports/monthly', { params: { year, month } }),
  getProducts: (params) => api.get('/reports/products', { params }),
  getCenters: (params) => api.get('/reports/centers', { params }),
  getWaste: (params) => api.get('/reports/waste', { params }),
  getProfitLoss: (params) => api.get('/reports/profit-loss', { params }),
}

export const dailyClosingAPI = {
  getAll: () => api.get('/daily-closing'),
  create: (data) => api.post('/daily-closing', data),
}

export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  updatePassword: (data) => api.put('/settings/password', data),
}

export const siteSettingsAPI = {
  get:    ()     => api.get('/site-settings'),
  update: (data) => api.put('/site-settings', data),
}

export const nutritionAPI = {
  /** Search Open Food Facts via backend proxy. Returns { success, source, nutritionPerUnit } */
  search: (q, unit = 'gram') => api.get('/nutrition/search', { params: { q, unit } }),
}

export const reviewsAPI = {
  getPublic: ()         => api.get('/reviews/public'),
  getAll:    ()         => api.get('/reviews'),
  create:    (data)     => api.post('/reviews', data),
  update:    (id, data) => api.put(`/reviews/${id}`, data),
  delete:    (id)       => api.delete(`/reviews/${id}`),
}

export const employeesAPI = {
  getAll:  (params) => api.get('/employees', { params }),
  create:  (data)   => api.post('/employees', data),
  update:  (id, d)  => api.put(`/employees/${id}`, d),
  remove:  (id)     => api.delete(`/employees/${id}`),
}

export const salaryAPI = {
  getMonth:      (month, periodType) => api.get('/salary', { params: { month } }),
  getEmployee:   (empId)             => api.get(`/salary/employee/${empId}`),
  init:          (data)              => api.post('/salary/init', data),
  initMonth:     (month, periodType) => api.post('/salary/init-month', { month, periodType }),
  addLate:       (id, data)          => api.put(`/salary/${id}/late`, data),
  adjust:        (id, data)          => api.put(`/salary/${id}/adjust`, data),
  deductAdvance: (id, advId)         => api.put(`/salary/${id}/deduct-advance/${advId}`),
  pay:           (id)                => api.post(`/salary/${id}/pay`),
  /** Pull the month's real clocked hours from the fingerprint terminal. */
  syncAttendance: (id, payBasis)     => api.post(`/salary/${id}/sync-attendance`, { payBasis }),
}

export const advancesAPI = {
  getAll:  (params) => api.get('/advances', { params }),
  create:  (data)   => api.post('/advances', data),
  remove:  (id)     => api.delete(`/advances/${id}`),
}

export const uploadAPI = {
  /** Upload an image file. Returns { url, publicId, width, height, sizeKB } */
  upload: (file) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  /** Delete an image from Cloudinary by publicId */
  delete: (publicId) => api.delete('/upload', { data: { publicId } }),
}

// ── Center Portal (separate axios instance with center token) ──
const centerApi = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': TENANT },
})
centerApi.interceptors.request.use(config => {
  const token = localStorage.getItem('luliz_center_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
centerApi.interceptors.response.use(
  res => res,
  err => {
    const message = err.response?.data?.message || 'حدث خطأ غير متوقع'
    if (err.response?.status === 401) {
      localStorage.removeItem('luliz_center_token')
      window.location.href = '/center-portal/login'
    }
    return Promise.reject({ ...err, message })
  }
)

export const centerPortalAPI = {
  login:       (data) => axios.post(`${API_URL}/center-portal/login`, data),
  getMe:       ()     => centerApi.get('/center-portal/me'),
  getSales:    ()     => centerApi.get('/center-portal/sales'),
  recordSale:  (data) => centerApi.post('/center-portal/sales', data),

  getEmployees:   (params) => centerApi.get('/center-portal/employees', { params }),
  createEmployee: (data)   => centerApi.post('/center-portal/employees', data),
  updateEmployee: (id, d)  => centerApi.put(`/center-portal/employees/${id}`, d),
  removeEmployee: (id)     => centerApi.delete(`/center-portal/employees/${id}`),

  getSalaryRecords: (params) => centerApi.get('/center-portal/salary-records', { params }),
  initSalaryRecord: (data)   => centerApi.post('/center-portal/salary-records', data),
  adjustSalaryRecord: (id, data) => centerApi.put(`/center-portal/salary-records/${id}/adjust`, data),
  paySalaryRecord:  (id)     => centerApi.post(`/center-portal/salary-records/${id}/pay`),
  removeSalaryRecord: (id)   => centerApi.delete(`/center-portal/salary-records/${id}`),

  /** This branch's own till — never the business-wide figure. */
  getCash:       (params) => centerApi.get('/center-portal/cash', { params }),

  /* Waste and local purchases are branch-scoped server-side: the controller
     reads req.center, so a branch can only ever see and create its own. */
  getWaste:      (params) => centerApi.get('/center-portal/waste', { params }),
  createWaste:   (data)   => centerApi.post('/center-portal/waste', data),

  getPurchases:    (params) => centerApi.get('/center-portal/purchases', { params }),
  createPurchase:  (data)   => centerApi.post('/center-portal/purchases', data),
  getIngredients:  ()       => centerApi.get('/center-portal/ingredients'),

  getExpenses:   (params) => centerApi.get('/center-portal/expenses', { params }),
  createExpense: (data)   => centerApi.post('/center-portal/expenses', data),
  updateExpense: (id, d)  => centerApi.put(`/center-portal/expenses/${id}`, d),
  removeExpense: (id)     => centerApi.delete(`/center-portal/expenses/${id}`),
}

export default api
