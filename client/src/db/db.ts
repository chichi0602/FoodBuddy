import Dexie, { type DBCoreMutateRequest, type EntityTable } from 'dexie'
import type { AISearchHistory, DismissedPlace, Place, Tag, UserPlace, VisitRecord } from '../types'

/** 要同步到伺服器的資料表（與後端 SyncController.Collections 一致） */
export const SYNCED_TABLES = ['places', 'userPlaces', 'visits', 'tags', 'searchHistory', 'dismissed'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

/** 待上傳的變更：只記哪一筆變了，上傳時再讀當下的內容（讀不到就是刪除） */
export interface OutboxEntry {
  key: string
  collection: SyncedTable
  id: string
  /** 本機修改時間（Unix 毫秒），伺服器用來判斷哪一邊比較新 */
  ts: number
}

export interface MetaEntry {
  key: string
  value: unknown
}

export type FoodBuddyDb = Dexie & {
  places: EntityTable<Place, 'id'>
  userPlaces: EntityTable<UserPlace, 'placeId'>
  visits: EntityTable<VisitRecord, 'id'>
  tags: EntityTable<Tag, 'name'>
  searchHistory: EntityTable<AISearchHistory, 'id'>
  dismissed: EntityTable<DismissedPlace, 'id'>
  outbox: EntityTable<OutboxEntry, 'key'>
  meta: EntityTable<MetaEntry, 'key'>
}

/** 登入前所有資料都存在這個資料庫；登入後改用每個帳號自己的資料庫 */
export const LEGACY_DB_NAME = 'foodbuddy'

function defineSchema(d: Dexie) {
  d.version(1).stores({
    places: 'id, name, city, district, priceRange, *cuisines, *tags, updatedAt',
    userPlaces: 'placeId, *statuses, rating',
    visits: 'id, placeId, visitedAt',
    tags: 'name',
    searchHistory: 'id, createdAt',
  })

  // v2：新增「適合時段」
  d.version(2)
    .stores({
      places: 'id, name, city, district, priceRange, *cuisines, *mealTimes, *tags, updatedAt',
    })
    .upgrade((tx) =>
      tx
        .table('places')
        .toCollection()
        .modify((p: Partial<Place>) => {
          p.mealTimes ??= []
        }),
    )

  // v3：「沒興趣」的推薦店家（Phase 8）
  d.version(3).stores({
    dismissed: 'id, dismissedAt',
  })

  // v4：雲端同步（Phase 9）
  d.version(4).stores({
    outbox: 'key',
    meta: 'key',
  })
}

/** 從伺服器拉下來的資料用這些交易寫入，不再記進 outbox */
const remoteTransactions = new WeakSet<object>()

export function markRemoteTransaction(idbtrans: object) {
  remoteTransactions.add(idbtrans)
}

let localChangeListener: (() => void) | undefined

/** 本機資料有變更時通知（同步引擎用來排程上傳） */
export function setLocalChangeListener(fn: (() => void) | undefined) {
  localChangeListener = fn
}

const synced = new Set<string>(SYNCED_TABLES)

/**
 * 每一筆寫入都在同一個交易裡記到 outbox，頁面與 repository 不必知道同步的存在。
 * 讀寫交易一律把 outbox 加進範圍，才能在同一個交易裡寫入。
 */
function installOutbox(d: Dexie) {
  d.use({
    stack: 'dbcore',
    name: 'outbox',
    create: (down) => ({
      ...down,
      transaction: (stores, mode, options) =>
        down.transaction(mode === 'readwrite' && !stores.includes('outbox') ? [...stores, 'outbox'] : stores, mode, options),
      table: (name) => {
        const table = down.table(name)
        if (!synced.has(name)) return table
        return {
          ...table,
          mutate: async (req: DBCoreMutateRequest) => {
            const trans = req.trans as unknown as IDBTransaction
            if (remoteTransactions.has(trans) || trans.mode === 'versionchange') return table.mutate(req)

            let keys: unknown[] = []
            if (req.type === 'add' || req.type === 'put') {
              const extract = table.schema.primaryKey.extractKey
              keys = req.keys ?? (extract ? req.values.map(extract) : [])
              if (req.type === 'put' && req.updates) keys = [...keys, ...req.updates.keys]
            } else if (req.type === 'delete') {
              keys = req.keys
            } else {
              const res = await table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } })
              keys = res.result
            }

            const result = await table.mutate(req)
            const failed = new Set(Object.keys(result.failures).map(Number))
            const ts = Date.now()
            const entries = keys
              .filter((k, i) => k != null && !failed.has(i))
              .map((k) => ({ key: `${name}|${String(k)}`, collection: name, id: String(k), ts }))
            if (entries.length > 0) {
              await down.table('outbox').mutate({ type: 'put', trans: req.trans, values: entries })
              setTimeout(() => localChangeListener?.(), 0)
            }
            return result
          },
        }
      },
    }),
  })
}

function createDb(name: string) {
  const d = new Dexie(name) as FoodBuddyDb
  defineSchema(d)
  installOutbox(d)
  return d
}

/**
 * 目前登入帳號的資料庫。用 live binding 匯出，切換帳號時所有 import 的地方會拿到新的資料庫；
 * 畫面只在登入並開啟資料庫之後才會掛上，所以使用時一定有值。
 */
export let db: FoodBuddyDb = undefined as unknown as FoodBuddyDb

export function userDbName(userId: string) {
  return `foodbuddy-${userId}`
}

export async function openUserDb(userId: string) {
  if (db && db.name === userDbName(userId)) return db
  db?.close()
  db = createDb(userDbName(userId))
  await db.open()
  return db
}

export function closeUserDb() {
  db?.close()
  db = undefined as unknown as FoodBuddyDb
}

/** 登出時刪除這台裝置上的帳號資料（資料仍在伺服器上，下次登入會重新下載） */
export async function deleteUserDb(userId: string) {
  if (db?.name === userDbName(userId)) closeUserDb()
  await Dexie.delete(userDbName(userId))
}
