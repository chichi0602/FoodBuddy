import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { App } from 'antd'
import { useNavigate } from 'react-router-dom'
import { closeUserDb, db, deleteUserDb, openUserDb } from '../db/db'
import { authApi, type User } from '../services/authApi'
import { AuthContext, type AuthState } from './authContext'
import { authEvents } from '../services/http'
import { hasSyncedBefore, startSync, stopSync, syncNow } from '../sync/syncEngine'

/** 離線時用上次登入的帳號開啟本機資料 */
const LAST_USER_KEY = 'foodbuddy.lastUser'
/** 帳號相關、存在 localStorage 的資料；登出時一併清除 */
const USER_STORAGE_KEYS = [LAST_USER_KEY, 'foodbuddy.forYou', 'foodbuddy.tasteInsight']

function saveLastUser(user: User) {
  try {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(user))
  } catch {
    // localStorage 停用時只是不能離線開啟
  }
}

function loadLastUser(): User | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

function clearUserStorage() {
  try {
    USER_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k))
  } catch {
    // 同上
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const open = useCallback(async (user: User, offline: boolean) => {
    await openUserDb(user.id)
    await startSync()
    // 這台裝置第一次登入：先把伺服器上的資料下載完再顯示畫面
    if (!offline && !(await hasSyncedBefore())) {
      setState({ status: 'loading', message: '正在下載你的資料…' })
      await syncNow()
    }
    saveLastUser(user)
    setState({ status: 'ready', user, offline })
  }, [])

  useEffect(() => {
    let cancelled = false
    authApi
      .me()
      .then(async (user) => {
        if (cancelled) return
        if (user) await open(user, false)
        else setState({ status: 'anonymous' })
      })
      .catch(async () => {
        if (cancelled) return
        const last = loadLastUser()
        if (last) await open(last, true)
        else setState({ status: 'error', message: '連不上 FoodBuddy 伺服器，請確認網路後再試。' })
      })
    return () => {
      cancelled = true
    }
  }, [open, attempt])

  // 登入過期：保留本機資料（可能還有沒上傳的修改），回到登入頁
  useEffect(() => {
    const onUnauthorized = () => {
      void stopSync().then(() => {
        closeUserDb()
        if (stateRef.current.status === 'ready') message.warning('登入已過期，請重新登入。')
        setState({ status: 'anonymous' })
      })
    }
    authEvents.addEventListener('unauthorized', onUnauthorized)
    return () => authEvents.removeEventListener('unauthorized', onUnauthorized)
  }, [message])

  const enter = useCallback((user: User) => open(user, false), [open])

  const pendingAfterSync = useCallback(async () => {
    await syncNow()
    return db.outbox.count()
  }, [])

  const leave = useCallback(async (userId: string) => {
    await stopSync()
    await deleteUserDb(userId)
    clearUserStorage()
    // 主動登出不必記住原本的頁面；和換頁放在同一次更新，避免先被導到 /login?next=…
    startTransition(() => {
      setState({ status: 'anonymous' })
      navigate('/login', { replace: true })
    })
  }, [navigate])

  const logout = useCallback(async () => {
    if (state.status !== 'ready') return
    await authApi.logout().catch(() => {})
    await leave(state.user.id)
  }, [state, leave])

  const deleteAccount = useCallback(async () => {
    if (state.status !== 'ready') return
    await authApi.deleteAccount()
    await leave(state.user.id)
  }, [state, leave])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((a) => a + 1)
  }, [])

  return (
    <AuthContext.Provider value={{ state, enter, pendingAfterSync, logout, deleteAccount, retry }}>
      {children}
    </AuthContext.Provider>
  )
}
