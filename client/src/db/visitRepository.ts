import { db } from './db'
import type { Place, PlaceStatus, UserPlace, VisitRecord } from '../types'

export type VisitInput = Omit<VisitRecord, 'id' | 'createdAt'>

export interface VisitWithPlace extends VisitRecord {
  place?: Place
}

/** 新到舊；同一天以建立時間排序 */
const byNewest = (a: VisitRecord, b: VisitRecord) =>
  b.visitedAt.localeCompare(a.visitedAt) || b.createdAt - a.createdAt

/** 評分四捨五入到 0.5，對應半顆星 */
const roundHalf = (n: number) => Math.round(n * 2) / 2

/**
 * 依到訪紀錄同步店家：
 * - 有到訪 → 加「已去過」、拿掉「想去」
 * - 最新一次選「願意再訪」→ 加「想再訪」
 * - 評分 = 有評分的到訪平均；沒有任何到訪評分時不動原本的評分
 * 刪除到訪不會拿掉「已去過」，因為也可能是使用者自己標的。
 */
async function syncPlace(placeId: string): Promise<void> {
  const visits = (await db.visits.where('placeId').equals(placeId).toArray()).sort(byNewest)
  if (visits.length === 0) return
  const current: UserPlace = (await db.userPlaces.get(placeId)) ?? { placeId, statuses: [], updatedAt: 0 }

  const statuses = new Set<PlaceStatus>(current.statuses)
  statuses.add('visited')
  statuses.delete('wantToGo')
  if (visits[0].wouldRevisit === true) statuses.add('revisit')

  const ratings = visits.map((v) => v.rating).filter((r): r is number => r != null)
  const rating = ratings.length > 0 ? roundHalf(ratings.reduce((a, b) => a + b, 0) / ratings.length) : current.rating

  await db.userPlaces.put({ ...current, statuses: [...statuses], rating, updatedAt: Date.now() })
}

/** 刪除後只重算評分，不改狀態 */
async function resyncRating(placeId: string): Promise<void> {
  const ratings = (await db.visits.where('placeId').equals(placeId).toArray())
    .map((v) => v.rating)
    .filter((r): r is number => r != null)
  if (ratings.length === 0) return
  const current = await db.userPlaces.get(placeId)
  if (!current) return
  await db.userPlaces.put({
    ...current,
    rating: roundHalf(ratings.reduce((a, b) => a + b, 0) / ratings.length),
    updatedAt: Date.now(),
  })
}

export const visitRepository = {
  async listWithPlace(): Promise<VisitWithPlace[]> {
    const [visits, places] = await Promise.all([db.visits.toArray(), db.places.toArray()])
    const byId = new Map(places.map((p) => [p.id, p]))
    return visits.sort(byNewest).map((v) => ({ ...v, place: byId.get(v.placeId) }))
  },

  async listByPlace(placeId: string): Promise<VisitRecord[]> {
    return (await db.visits.where('placeId').equals(placeId).toArray()).sort(byNewest)
  },

  async create(input: VisitInput): Promise<string> {
    const id = crypto.randomUUID()
    await db.transaction('rw', db.visits, db.userPlaces, async () => {
      await db.visits.add({ ...input, id, createdAt: Date.now() })
      await syncPlace(input.placeId)
    })
    return id
  },

  async update(id: string, input: VisitInput): Promise<void> {
    await db.transaction('rw', db.visits, db.userPlaces, async () => {
      const before = await db.visits.get(id)
      await db.visits.update(id, input)
      await syncPlace(input.placeId)
      // 改了店家時，原本那間也要重算
      if (before && before.placeId !== input.placeId) await resyncRating(before.placeId)
    })
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.visits, db.userPlaces, async () => {
      const visit = await db.visits.get(id)
      await db.visits.delete(id)
      if (visit) await resyncRating(visit.placeId)
    })
  },

  /** 「不會再去」後使用者同意時呼叫 */
  async markNotRecommended(placeId: string): Promise<void> {
    const current = await db.userPlaces.get(placeId)
    if (!current) return
    const statuses = new Set(current.statuses)
    statuses.add('notRecommended')
    statuses.delete('revisit')
    await db.userPlaces.put({ ...current, statuses: [...statuses], updatedAt: Date.now() })
  },
}
