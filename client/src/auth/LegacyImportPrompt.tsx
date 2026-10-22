import { useEffect, useState } from 'react'
import { App, Modal } from 'antd'
import Dexie from 'dexie'
import { db, LEGACY_DB_NAME, SYNCED_TABLES } from '../db/db'
import { syncNow } from '../sync/syncEngine'

const handledKey = (userId: string) => `foodbuddy.legacyHandled.${userId}`

function isHandled(userId: string) {
  try {
    return localStorage.getItem(handledKey(userId)) === '1'
  } catch {
    return false
  }
}

function markHandled(userId: string) {
  try {
    localStorage.setItem(handledKey(userId), '1')
  } catch {
    // localStorage 停用時下次登入會再問一次
  }
}

/** 開啟登入前的資料庫（不宣告結構，依現有的資料表讀取） */
async function openLegacy() {
  if (!(await Dexie.exists(LEGACY_DB_NAME))) return null
  const legacy = new Dexie(LEGACY_DB_NAME)
  await legacy.open()
  return legacy
}

async function countLegacy(legacy: Dexie) {
  const names = new Set(legacy.tables.map((t) => t.name))
  const count = (name: string) => (names.has(name) ? legacy.table(name).count() : Promise.resolve(0))
  const [places, visits, total] = await Promise.all([
    count('places'),
    count('visits'),
    Promise.all(SYNCED_TABLES.map(count)).then((n) => n.reduce((a, b) => a + b, 0)),
  ])
  return { places, visits, total }
}

/**
 * 這台瀏覽器有登入前（Phase 8 以前）的資料時，詢問要不要加入目前的帳號。
 * 加入後刪除舊資料庫，避免之後在同一台裝置登入的其他帳號又被詢問。
 */
export default function LegacyImportPrompt({ userId }: { userId: string }) {
  const { message } = App.useApp()
  const [counts, setCounts] = useState<{ places: number; visits: number }>()
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (isHandled(userId)) return
    let cancelled = false
    void (async () => {
      const legacy = await openLegacy().catch(() => null)
      if (!legacy) return
      const c = await countLegacy(legacy)
      legacy.close()
      if (cancelled) return
      if (c.total === 0) {
        await Dexie.delete(LEGACY_DB_NAME)
        return
      }
      setCounts(c)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const importAll = async () => {
    setImporting(true)
    try {
      const legacy = await openLegacy()
      if (legacy) {
        const names = new Set(legacy.tables.map((t) => t.name))
        const tables = SYNCED_TABLES.filter((t) => names.has(t))
        const rows = await Promise.all(tables.map((t) => legacy.table(t).toArray()))
        legacy.close()
        // 寫入目前帳號的資料庫，每一筆都會記進 outbox 並上傳
        await db.transaction('rw', tables.map((t) => db.table(t)), async () => {
          for (const [i, t] of tables.entries()) await db.table(t).bulkPut(rows[i])
        })
        await Dexie.delete(LEGACY_DB_NAME)
      }
      markHandled(userId)
      setCounts(undefined)
      message.success('已把這台裝置上的資料加入你的帳號')
      void syncNow()
    } catch {
      message.error('加入資料時發生錯誤，請重新整理後再試。')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={!!counts}
      title="把這台裝置上的資料加入帳號？"
      okText="加入帳號"
      cancelText="先不要"
      confirmLoading={importing}
      closable={false}
      mask={{ closable: false }}
      onOk={importAll}
      onCancel={() => {
        markHandled(userId)
        setCounts(undefined)
      }}
    >
      <p>
        這台裝置上有登入前建立的資料：<strong>{counts?.places ?? 0}</strong> 間店、
        <strong>{counts?.visits ?? 0}</strong> 筆到訪紀錄。
      </p>
      <p>加入後會上傳到你的帳號，換手機或電腦登入也看得到。選「先不要」的話，資料會留在這台裝置上，不會再詢問。</p>
    </Modal>
  )
}
