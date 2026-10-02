import axios from 'axios'
import toast from 'react-hot-toast'
import {
  cacheResponse, readCache, enqueue, flushQueue, isNetworkError,
  REPLAY_HEADER, IDEMPOTENCY_HEADER, createIdempotencyKey,
} from './offline'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3002/api')

/* One backend serves both brands, so every request has to say which one it is
   speaking for. Baked in at build time — this build is عجينة وطحينة's. */
const TENANT = import.meta.env.VITE_TENANT || 'ajeena'

/* For the few places that reach the API with a bare fetch() instead of axios —
   without this they fall back to the server's default brand. */
export const tenantHeader = { 'X-Tenant': TENANT }

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': TENANT }
})

api.interceptors.request.use(config => {
  config.__offlineClient = 'admin'
  const token = localStorage.getItem('luliz_admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (['post', 'put', 'patch', 'delete'].includes((config.method || '').toLowerCase()) && !config.headers[IDEMPOTENCY_HEADER]) {
    config.headers[IDEMPOTENCY_HEADER] = createIdempotencyKey()
  }
  return config
})

/* Requests that must never be cached or replayed — auth and live device
   commands are meaningless once the moment has passed. */
const NO_OFFLINE = [/\/auth\//, /\/attendance\/devices/, /\/attendance\/commands/, /\/attendance\/stream/]
const skipOffline = url => NO_OFFLINE.some(re => re.test(url || ''))

api.interceptors.response.use(
  res => {
    // Keep the last good copy of every GET so pages still render offline.
    if (res.config?.method === 'get' && !skipOffline(res.config.url)) {
      cacheResponse(res.config, res.data)
    }
    return res
  },
  async err => {
    const message = err.response?.data?.message || 'حدث خطأ غير متوقع'
    const config = err.config || {}

    if (err.response?.status === 401) {
      localStorage.removeItem('luliz_admin_token')
      localStorage.removeItem('luliz_admin_user')
      window.location.href = '/admin/login'
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
          toast('بيانات محفوظة — أنت غير متصل', { icon: '📴', id: 'offline-read' })
          return { data: cached.data, status: 200, fromCache: true, cachedAt: cached.at, config }
        }
      } else if (['post', 'put', 'delete', 'patch'].includes(method)) {
        await enqueue(config)
        toast('تم الحفظ محلياً — سيُرسل عند عودة الاتصال', { icon: '📥', id: 'offline-write' })
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
    const { sent, failed } = await flushQueue(api, 'admin')
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
  /* Re-checks the signed-in user's own password — used to unlock the
     pages that must not be opened by a passer-by. */
  verifyPassword: (password) => api.post('/auth/verify-password', { password }),
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
  todayStats: (center) => api.get('/internal-orders/stats/today', { params: { center } }),
  printResult: (id, data) => api.post(`/internal-orders/${id}/print-result`, data),
  dailyReport: (date)  => api.get('/internal-orders/daily-report', { params: date ? { date } : {} }),
}

export const attendanceAPI = {
  /* settings */
  getSettings:  ()   => api.get('/attendance/settings'),
  saveSettings: (d)  => api.put('/attendance/settings', d),

  /* branch devices — one terminal per branch, each driven by its own agent */
  devices:      ()      => api.get('/attendance/devices'),
  addDevice:    (d)     => api.post('/attendance/devices', d),
  updateDevice: (id, d) => api.put(`/attendance/devices/${id}`, d),
  rotateKey:    (id)    => api.post(`/attendance/devices/${id}/rotate-key`),
  deleteDevice: (id)    => api.delete(`/attendance/devices/${id}`),
  refreshDevice:(id)    => api.post(`/attendance/devices/${id}/refresh`),
  scanDevice:   (id)    => api.post(`/attendance/devices/${id}/scan`),

  /* queued jobs waiting for a branch agent to pick them up */
  commands:     (deviceId) => api.get('/attendance/commands', { params: { deviceId } }),

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
}

/* Menu sections. `getAll` is public so the storefront can draw the menu;
   everything else is admin-only server-side. */
export const categoriesAPI = {
  getAll:   (all) => api.get('/categories', { params: all ? { all: true } : {} }),
  orphans:  ()    => api.get('/categories/orphans'),
  create:   (d)   => api.post('/categories', d),
  update:   (id, d) => api.put(`/categories/${id}`, d),
  reorder:  (order) => api.put('/categories/order/bulk', { order }),
  /* moveTo is required when the category still holds products. */
  delete:   (id, moveTo) => api.delete(`/categories/${id}`, { data: { moveTo } }),
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
  /* Soft: hides from the storefront, keeps sales history intact. */
  delete: (id) => api.delete(`/products/${id}`),
  /* Erases the product. Refused server-side once any sale or order references it. */
  purge:  (id) => api.delete(`/products/${id}/permanent`),
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
  getPublic: () => api.get('/centers/public'),
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
  /* The partner's flat cut of the takings — shown on receipts and reports. */
  getInvestor:    ()     => api.get('/settings/investor'),
  updateInvestor: (data) => api.put('/settings/investor', data),
  /* Opening hours — where one working day ends and the next begins. */
  getBusinessHours:    ()     => api.get('/settings/business-hours'),
  updateBusinessHours: (data) => api.put('/settings/business-hours', data),
}

/* The cashier's shift: open with a float, close ("تصفير") with a count. */
export const shiftsAPI = {
  current: ()       => api.get('/shifts/current'),
  list:    (params) => api.get('/shifts', { params }),
  getOne:  (id)     => api.get(`/shifts/${id}`),
  open:    (data)   => api.post('/shifts/open', data),
  close:   (data)   => api.post('/shifts/close', data),
}

export const returnsAPI = {
  getAll:   (params) => api.get('/returns', { params }),
  /* The order with what is still returnable on each line. */
  findOrder: (key)   => api.get(`/returns/order/${encodeURIComponent(key)}`),
  create:   (data)   => api.post('/returns', data),
}

export const siteSettingsAPI = {
  get:    ()     => api.get('/site-settings'),
  update: (data) => api.put('/site-settings', data),
  /* Instagram — the access token is sent once and never returned. */
  instagramStatus:     ()      => api.get('/site-settings/instagram-status'),
  connectInstagram:    (token) => api.put('/site-settings/instagram-token', { token }),
  disconnectInstagram: ()      => api.delete('/site-settings/instagram-token'),
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
  /* Soft delete — the record survives for payroll and attendance history. */
  remove:  (id)     => api.delete(`/employees/${id}`),
  /* Deactivation is reversible; a mistaken click should not be fatal. */
  restore: (id)     => api.post(`/employees/${id}/restore`),
  /* Erases the record. Refused server-side once anything references it. */
  purge:   (id)     => api.delete(`/employees/${id}/permanent`),
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
  config.__offlineClient = 'center'
  const token = localStorage.getItem('luliz_center_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (['post', 'put', 'patch', 'delete'].includes((config.method || '').toLowerCase()) && !config.headers[IDEMPOTENCY_HEADER]) {
    config.headers[IDEMPOTENCY_HEADER] = createIdempotencyKey()
  }
  return config
})
centerApi.interceptors.response.use(
  res => {
    if (res.config?.method === 'get' && !skipOffline(res.config.url)) cacheResponse(res.config, res.data)
    return res
  },
  async err => {
    const message = err.response?.data?.message || 'حدث خطأ غير متوقع'
    const config = err.config || {}
    if (err.response?.status === 401) {
      localStorage.removeItem('luliz_center_token')
      window.location.href = '/center-portal/login'
    }
    if (isNetworkError(err) && !skipOffline(config.url)) {
      const method = (config.method || 'get').toLowerCase()
      const isReplay = !!(config.headers?.[REPLAY_HEADER] || config.headers?.[REPLAY_HEADER.toLowerCase()])
      if (isReplay) return Promise.reject({ ...err, message: 'لا يوجد اتصال بالإنترنت' })
      if (method === 'get') {
        const cached = await readCache(config)
        if (cached) return { data: cached.data, status: 200, fromCache: true, cachedAt: cached.at, config }
      } else if (['post', 'put', 'delete', 'patch'].includes(method)) {
        await enqueue(config)
        toast('تم حفظ عملية الفرع محلياً وستُرسل مرة واحدة عند عودة الاتصال', { icon: '📥' })
        return { data: { success: true, queuedOffline: true, message: 'محفوظ محلياً' }, status: 202, config }
      }
    }
    return Promise.reject({ ...err, message })
  }
)

if (typeof window !== 'undefined') {
  const drainCenter = async () => {
    const { sent, failed } = await flushQueue(centerApi, 'center')
    if (sent) toast.success(`تمت مزامنة ${sent} عملية للفرع`)
    if (failed) toast.error(`${failed} عملية للفرع رُفضت`)
  }
  window.addEventListener('online', drainCenter)
  if (navigator.onLine) setTimeout(drainCenter, 3000)
}

export const centerPortalAPI = {
  login:       (data) => axios.post(`${API_URL}/center-portal/login`, data),
  getMe:       ()     => centerApi.get('/center-portal/me'),
  getSales:    ()     => centerApi.get('/center-portal/sales'),
  /** data: { items: [{ productId, quantity }], notes } — a whole cart in one call. */
  recordSale:  (data) => centerApi.post('/center-portal/sales', data),

  /** Full menu (minus items this branch hid today) — what the cashier sells from. */
  getProducts:            ()     => centerApi.get('/center-portal/products'),
  getUnavailableProducts: ()     => centerApi.get('/center-portal/products/unavailable'),
  toggleProductAvailability: (id) => centerApi.put(`/center-portal/products/${id}/toggle-availability`),

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
  createIngredient: (data) => centerApi.post('/center-portal/ingredients', data),

  getExpenses:   (params) => centerApi.get('/center-portal/expenses', { params }),
  createExpense: (data)   => centerApi.post('/center-portal/expenses', data),
  updateExpense: (id, d)  => centerApi.put(`/center-portal/expenses/${id}`, d),
  removeExpense: (id)     => centerApi.delete(`/center-portal/expenses/${id}`),

  // Attendance / fingerprint device (branch-scoped)
  pushEmployeeToDevice: (id)              => centerApi.post(`/center-portal/employees/${id}/push`),
  enrollFingerprint:    (id, fingerIndex) => centerApi.post(`/center-portal/employees/${id}/enroll`, { fingerIndex }),
  clearFingerprints:    (id)              => centerApi.delete(`/center-portal/employees/${id}/fingerprints`),
  removeFromDevice:     (id)              => centerApi.delete(`/center-portal/employees/${id}/device`),
  getAttendanceDaily:      (date)         => centerApi.get('/center-portal/attendance/daily', { params: { date } }),
  getAttendanceSummary:    (from, to)     => centerApi.get('/center-portal/attendance/summary', { params: { from, to } }),
  getEmployeeAttendance:   (id, from, to) => centerApi.get(`/center-portal/attendance/employee/${id}`, { params: { from, to } }),
  syncSalaryAttendance:    (id, payBasis) => centerApi.post(`/center-portal/salary-records/${id}/sync-attendance`, { payBasis }),
}

export default api
