import { db } from './db'

export interface TagWithCount {
  name: string
  count: number
}

export const tagRepository = {
  /** 所有 Tag 與使用中的店家數；只存在店家上、沒登記在 tags 表的也一併列出 */
  async listWithCount(): Promise<TagWithCount[]> {
    const [tags, places] = await Promise.all([db.tags.toArray(), db.places.toArray()])
    const counts = new Map<string, number>(tags.map((t) => [t.name, 0]))
    for (const p of places) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hant'))
  },

  /** 重新命名；新名稱已存在時會合併成同一個 Tag */
  async rename(from: string, to: string): Promise<void> {
    const target = to.trim()
    if (!target || target === from) return
    await db.transaction('rw', db.places, db.tags, async () => {
      await db.places
        .where('tags')
        .equals(from)
        .modify((p) => {
          p.tags = [...new Set(p.tags.map((t) => (t === from ? target : t)))]
        })
      await db.tags.delete(from)
      if (!(await db.tags.get(target))) await db.tags.add({ name: target, createdAt: Date.now() })
    })
  },

  /** 刪除 Tag，並從所有店家移除 */
  async remove(name: string): Promise<void> {
    await db.transaction('rw', db.places, db.tags, async () => {
      await db.places
        .where('tags')
        .equals(name)
        .modify((p) => {
          p.tags = p.tags.filter((t) => t !== name)
        })
      await db.tags.delete(name)
    })
  },
}
