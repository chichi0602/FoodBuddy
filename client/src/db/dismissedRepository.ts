import { db } from './db'
import type { DismissedPlace } from '../types'

/** 「沒興趣」的推薦店家：之後的 AI 推薦會排除這些 OpenStreetMap id */
export const dismissedRepository = {
  async list(): Promise<DismissedPlace[]> {
    return db.dismissed.orderBy('dismissedAt').reverse().toArray()
  },

  async ids(): Promise<string[]> {
    return (await db.dismissed.toCollection().primaryKeys()) as string[]
  },

  async add(id: string, name: string): Promise<void> {
    await db.dismissed.put({ id, name, dismissedAt: Date.now() })
  },

  async remove(id: string): Promise<void> {
    await db.dismissed.delete(id)
  },
}
