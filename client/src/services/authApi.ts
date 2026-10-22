import { requestJson } from './http'

export interface User {
  id: string
  email: string
  displayName: string | null
  hasPassword: boolean
  logins: string[]
}

export const authApi = {
  /** 未登入回傳 null */
  me: async (): Promise<User | null> => {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (res.status === 401) return null
    if (!res.ok) throw new Error('連不上 FoodBuddy 伺服器，請稍後再試。')
    return res.json() as Promise<User>
  },
  providers: () => requestJson<{ google: boolean }>('/api/auth/providers'),
  login: (email: string, password: string) => requestJson<User>('/api/auth/login', { body: { email, password } }),
  register: (email: string, password: string, displayName: string) =>
    requestJson<User>('/api/auth/register', { body: { email, password, displayName } }),
  logout: () => requestJson<void>('/api/auth/logout', { method: 'POST' }),
  deleteAccount: () => requestJson<void>('/api/auth/account', { method: 'DELETE' }),
}
