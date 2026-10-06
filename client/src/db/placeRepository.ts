import { db } from './db'
import type { Place, PlaceStatus, PlaceWithUser, UserPlace } from '../types'

export type PlaceInput = Omit<Place, 'id' | 'createdAt' | 'updatedAt'>

const emptyUser = (placeId: string): UserPlace => ({ placeId, statuses: [], updatedAt: 0 })

/**
 * 「我的美食」資料存取。所有頁面只透過這裡讀寫，
 * 之後要改接後端 API 時只需要替換這個模組。
 */
export const placeRepository = {
  async list(): Promise<PlaceWithUser[]> {
    const [places, users] = await Promise.all([db.places.orderBy('updatedAt').reverse().toArray(), db.userPlaces.toArray()])
    const byId = new Map(users.map((u) => [u.placeId, u]))
    return places.map((p) => ({ ...p, user: byId.get(p.id) ?? emptyUser(p.id) }))
  },

  async get(id: string): Promise<PlaceWithUser | undefined> {
    const place = await db.places.get(id)
    if (!place) return undefined
    const user = (await db.userPlaces.get(id)) ?? emptyUser(id)
    return { ...place, user }
  },

  async create(input: PlaceInput, user?: Partial<Omit<UserPlace, 'placeId'>>): Promise<string> {
    const now = Date.now()
    const id = crypto.randomUUID()
    await db.transaction('rw', db.places, db.userPlaces, db.tags, async () => {
      await db.places.add({ ...input, id, createdAt: now, updatedAt: now })
      await db.userPlaces.put({ ...emptyUser(id), ...user, updatedAt: now })
      await saveTags(input.tags)
    })
    return id
  },

  async update(id: string, input: PlaceInput, user?: Partial<Omit<UserPlace, 'placeId'>>): Promise<void> {
    const now = Date.now()
    await db.transaction('rw', db.places, db.userPlaces, db.tags, async () => {
      await db.places.update(id, { ...input, updatedAt: now })
      if (user) {
        const current = (await db.userPlaces.get(id)) ?? emptyUser(id)
        await db.userPlaces.put({ ...current, ...user, placeId: id, updatedAt: now })
      }
      await saveTags(input.tags)
    })
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.places, db.userPlaces, db.visits, async () => {
      await db.places.delete(id)
      await db.userPlaces.delete(id)
      await db.visits.where('placeId').equals(id).delete()
    })
  },

  async toggleStatus(id: string, status: PlaceStatus): Promise<void> {
    const current = (await db.userPlaces.get(id)) ?? emptyUser(id)
    const has = current.statuses.includes(status)
    const statuses = has ? current.statuses.filter((s) => s !== status) : [...current.statuses, status]
    await db.userPlaces.put({ ...current, statuses, updatedAt: Date.now() })
  },

  async setRating(id: string, rating: number): Promise<void> {
    const current = (await db.userPlaces.get(id)) ?? emptyUser(id)
    await db.userPlaces.put({ ...current, rating, updatedAt: Date.now() })
  },
}

async function saveTags(tags: string[]) {
  const now = Date.now()
  await db.tags.bulkPut(tags.map((name) => ({ name, createdAt: now })))
}
