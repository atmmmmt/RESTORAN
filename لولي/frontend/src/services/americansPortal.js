import axios from 'axios'

const TOKEN_KEY = 'americans_portal_token'
const USER_KEY = 'americans_portal_user'

const client = axios.create({
  baseURL: '/api/americans-portal',
  timeout: 25000,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  res => res,
  err => {
    const message = err.response?.data?.message || 'تعذّر الاتصال بالخدمة'
    if (err.response?.status === 401 && !String(err.config?.url || '').includes('/login')) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      window.location.href = '/americans/login'
    }
    return Promise.reject({ ...err, message })
  }
)

export const AmericansPortal = {
  token: () => localStorage.getItem(TOKEN_KEY),
  user: () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch { return null }
  },
  async login(email, password) {
    const res = await client.post('/login', { email, password })
    localStorage.setItem(TOKEN_KEY, res.data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(res.data.user || {}))
    return res.data
  },
  async summary(params) {
    const res = await client.get('/summary', { params })
    return res.data
  },
  logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

export default AmericansPortal
