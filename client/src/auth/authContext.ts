import { createContext, useContext } from 'react'
import type { User } from '../services/authApi'

export type AuthState =
  | { status: 'loading'; message?: string }
  | { status: 'anonymous' }
  | { status: 'error'; message: string }
  | { status: 'ready'; user: User; offline: boolean }

interface AuthContextValue {
  state: AuthState
  /** 登入或註冊成功後呼叫 */
  enter: (user: User) => Promise<void>
  /** 先同步一次，回傳仍未上傳的筆數（登出前檢查用） */
  pendingAfterSync: () => Promise<number>
  logout: () => Promise<void>
  deleteAccount: () => Promise<void>
  retry: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 裡使用')
  return ctx
}
