import { PRICE_META, PRICE_ORDER } from '../constants'
import type { PlaceWithUser, VisitRecord } from '../types'

export interface BarItem {
  label: string
  value: number
  /** 顯示在長條旁的文字，預設為 value */
  display?: string
  /** 點了要去的連結 */
  href?: string
}

export interface FoodStats {
  totalSaved: number
  visitedPlaces: number
  visitCount: number
  /** 所有到訪評分的平均；沒有任何評分時為 null */
  averageRating: number | null
  savedCuisines: BarItem[]
  visitedCuisines: BarItem[]
  districts: BarItem[]
  topRated: BarItem[]
  priceRanges: BarItem[]
}

const countTop = (counts: Map<string, number>, n: number): BarItem[] =>
  [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))
    .slice(0, n)
    .map(([label, value]) => ({ label, value }))

const inc = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by)

export function computeFoodStats(places: PlaceWithUser[], visits: VisitRecord[]): FoodStats {
  const byId = new Map(places.map((p) => [p.id, p]))
  // 不推薦的店不算進「喜歡的料理」
  const liked = places.filter((p) => !p.user.statuses.includes('notRecommended'))

  const savedCuisines = new Map<string, number>()
  for (const p of liked) for (const c of p.cuisines) inc(savedCuisines, c)

  const visitedCuisines = new Map<string, number>()
  const districts = new Map<string, number>()
  const visitedIds = new Set<string>()
  for (const v of visits) {
    const p = byId.get(v.placeId)
    if (!p) continue
    visitedIds.add(p.id)
    for (const c of p.cuisines) inc(visitedCuisines, c)
    const area = [p.city, p.district].filter(Boolean).join(' ')
    if (area) inc(districts, area)
  }
  for (const p of places) if (p.user.statuses.includes('visited')) visitedIds.add(p.id)

  const ratings = visits.map((v) => v.rating).filter((r): r is number => r != null)

  const prices = new Map<string, number>()
  for (const p of liked) if (p.priceRange) inc(prices, p.priceRange)

  return {
    totalSaved: places.length,
    visitedPlaces: visitedIds.size,
    visitCount: visits.length,
    averageRating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    savedCuisines: countTop(savedCuisines, 6),
    visitedCuisines: countTop(visitedCuisines, 6),
    districts: countTop(districts, 5),
    topRated: liked
      .filter((p) => p.user.rating != null)
      .sort((a, b) => b.user.rating! - a.user.rating! || b.updatedAt - a.updatedAt)
      .slice(0, 5)
      .map((p) => ({ label: p.name, value: p.user.rating!, display: `${p.user.rating} 星`, href: `/my/${p.id}` })),
    // 價位依區間順序排列，而不是依數量
    priceRanges: PRICE_ORDER.filter((r) => prices.has(r)).map((r) => ({ label: PRICE_META[r].label, value: prices.get(r)! })),
  }
}
