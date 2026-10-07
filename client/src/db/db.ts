import Dexie, { type EntityTable } from 'dexie'
import type { AISearchHistory, DismissedPlace, Place, Tag, UserPlace, VisitRecord } from '../types'

export const db = new Dexie('foodbuddy') as Dexie & {
  places: EntityTable<Place, 'id'>
  userPlaces: EntityTable<UserPlace, 'placeId'>
  visits: EntityTable<VisitRecord, 'id'>
  tags: EntityTable<Tag, 'name'>
  searchHistory: EntityTable<AISearchHistory, 'id'>
  dismissed: EntityTable<DismissedPlace, 'id'>
}

db.version(1).stores({
  places: 'id, name, city, district, priceRange, *cuisines, *tags, updatedAt',
  userPlaces: 'placeId, *statuses, rating',
  visits: 'id, placeId, visitedAt',
  tags: 'name',
  searchHistory: 'id, createdAt',
})

// v2：新增「適合時段」
db.version(2)
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
db.version(3).stores({
  dismissed: 'id, dismissedAt',
})
