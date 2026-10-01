import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'

const STORAGE_KEY = 'luliz_cart'
const CartContext = createContext(null)

function readStoredCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const items = raw ? JSON.parse(raw) : []
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readStoredCart)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* storage unavailable — cart just won't persist */ }
  }, [items])

  const addItem = useCallback((product, qty = 1) => {
    setItems(prev => {
      const existing = prev.find(i => i.productId === product._id)
      if (existing) {
        return prev.map(i => i.productId === product._id ? { ...i, quantity: i.quantity + qty } : i)
      }
      return [...prev, {
        productId: product._id,
        name: product.name,
        image: product.image || '',
        price: product.activeOffer ? product.discountedPrice : product.directPrice,
        originalPrice: product.directPrice,
        availableQuantity: product.availableQuantity,
        quantity: qty,
      }]
    })
  }, [])

  const removeItem = useCallback((productId) => {
    setItems(prev => prev.filter(i => i.productId !== productId))
  }, [])

  const setQuantity = useCallback((productId, quantity) => {
    setItems(prev => {
      if (quantity <= 0) return prev.filter(i => i.productId !== productId)
      return prev.map(i => i.productId === productId ? { ...i, quantity } : i)
    })
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const { totalCount, totalPrice } = useMemo(() => ({
    totalCount: items.reduce((sum, i) => sum + i.quantity, 0),
    totalPrice: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
  }), [items])

  const value = { items, addItem, removeItem, setQuantity, clearCart, totalCount, totalPrice }
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
