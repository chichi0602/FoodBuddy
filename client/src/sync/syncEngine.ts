import { db, markRemoteTransaction, setLocalChangeListener, SYNCED_TABLES, type OutboxEntry, type SyncedTable } from '../db/db'
import { HttpError, requestJson } from '../services/http'

interface SyncChange {
  collection: SyncedTable
  id: string
  data: unknown
  deleted: boolean
  updatedAt: number
}

interface SyncResponse {
  cursor: number
  hasMore: boolean
  changes: SyncChange[]
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error'
  lastSyncAt?: number
  error?: string
}

/** 一次上傳的筆數與大小上限（後端單次請求上限 20MB、500 筆） */
const MAX_BATCH = 200
const MAX_BATCH_CHARS = 4 * 1024 * 1024
const DEBOUNCE_MS = 2000
const INTERVAL_MS = 5 * 60 * 1000
/** 一次同步最多來回幾輪，避免異常時無限循環 */
const MAX_ROUNDS = 100

let status: SyncStatus = { state: 'idle' }
const listeners = new Set<() => void>()
let running: Promise<void> | null = null
let again = false
let debounce: ReturnType<typeof setTimeout> | undefined
let interval: ReturnType<typeof setInterval> | undefined
let started = false

function setStatus(next: SyncStatus) {
  status = next
  listeners.forEach((l) => l())
}

async function readMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

/** 把 outbox 的一批變更組成要上傳的內容（讀不到資料代表已刪除） */
async function buildBatch(): Promise<{ entries: OutboxEntry[]; changes: SyncChange[] }> {
  const pending = await db.outbox.limit(MAX_BATCH).toArray()
  const entries: OutboxEntry[] = []
  const changes: SyncChange[] = []
  let size = 0
  for (const e of pending) {
    const data = await db.table(e.collection).get(e.id)
    const change: SyncChange = { collection: e.collection, id: e.id, data: data ?? null, deleted: data === undefined, updatedAt: e.ts }
    const chars = JSON.stringify(change).length
    if (changes.length > 0 && size + chars > MAX_BATCH_CHARS) break
    size += chars
    entries.push(e)
    changes.push(change)
  }
  return { entries, changes }
}

async function runOnce() {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const since = (await readMeta<number>('cursor')) ?? 0
    const { entries, changes } = await buildBatch()
    const res = await requestJson<SyncResponse>('/api/sync', { body: { since, changes } })

    await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.outbox, db.meta], async (tx) => {
      markRemoteTransaction(tx.idbtrans)
      // 上傳期間又被修改過的不刪，下一輪再送
      for (const e of entries) {
        const current = await db.outbox.get(e.key)
        if (current?.ts === e.ts) await db.outbox.delete(e.key)
      }
      for (const c of res.changes) {
        // 本機還有沒上傳的修改：以本機為準，上傳後由伺服器判斷誰比較新
        if (await db.outbox.get(`${c.collection}|${c.id}`)) continue
        const table = db.table(c.collection)
        if (c.deleted) await table.delete(c.id)
        else await table.put(c.data)
      }
      await db.meta.put({ key: 'cursor', value: res.cursor })
      await db.meta.put({ key: 'lastSyncAt', value: Date.now() })
    })

    if (!res.hasMore && (await db.outbox.count()) === 0) return
  }
}

/** 立即同步；同步進行中再呼叫會在這次結束後再跑一次 */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    setStatus({ ...status, state: 'syncing' })
    try {
      do {
        again = false
        await runOnce()
      } while (again)
      setStatus({ state: 'idle', lastSyncAt: Date.now() })
    } catch (e) {
      setStatus({
        state: 'error',
        lastSyncAt: status.lastSyncAt,
        error: e instanceof HttpError ? e.message : '同步失敗，稍後會自動重試。',
      })
    } finally {
      running = null
    }
  })()
  return running
}

function schedule() {
  clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), DEBOUNCE_MS)
}

function onVisible() {
  if (document.visibilityState === 'visible') void syncNow()
}

function onOnline() {
  void syncNow()
}

/** 登入後啟動：寫入後 2 秒、回到前景、重新連線、每 5 分鐘自動同步 */
export async function startSync() {
  if (started) return
  started = true
  setStatus({ state: 'idle', lastSyncAt: await readMeta<number>('lastSyncAt') })
  setLocalChangeListener(schedule)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  interval = setInterval(() => void syncNow(), INTERVAL_MS)
}

export async function stopSync() {
  if (!started) return
  started = false
  setLocalChangeListener(undefined)
  clearTimeout(debounce)
  clearInterval(interval)
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('online', onOnline)
  await running?.catch(() => {})
  setStatus({ state: 'idle' })
}

/** 這個裝置是否曾經和伺服器同步過（沒有的話第一次要先下載資料） */
export async function hasSyncedBefore() {
  return (await readMeta<number>('cursor')) !== undefined
}

export const syncStatusStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => status,
}
