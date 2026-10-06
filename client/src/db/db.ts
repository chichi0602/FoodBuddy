import Dexie, { type EntityTable } from 'dexie'
import type { AISearchHistory, Place, Tag, UserPlace, VisitRecord } from '../types'

export const db = new Dexie('foodbuddy') as Dexie & {
  places: EntityTable<Place, 'id'>
  userPlaces: EntityTable<UserPlace, 'placeId'>
  visits: EntityTable<VisitRecord, 'id'>
  tags: EntityTable<Tag, 'name'>
  searchHistory: EntityTable<AISearchHistory, 'id'>
}

db.version(1).stores({
  places: 'id, name, city, district, priceRange, *cuisines, *tags, updatedAt',
  userPlaces: 'placeId, *statuses, rating',
  visits: 'id, placeId, visitedAt',
  tags: 'name',
  searchHistory: 'id, createdAt',
})
