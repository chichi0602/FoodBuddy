import { PRICE_ORDER } from '../constants'
import type { PlaceStatus, PlaceWithUser, PriceRange, SavedPlaceInput, TasteProfile } from '../types'

/** 收藏太少時看不出偏好，不送給 AI 以免以偏概全 */
const MIN_PLACES = 3
const MAX_SAVED_INPUTS = 300

/** 各狀態代表的喜好程度 */
const STATUS_WEIGHT: Partial<Record<PlaceStatus, number>> = {
  revisit: 3,
  favorite: 2,
  visited: 1,
  wantToGo: 1,
}

function weightOf(p: PlaceWithUser): number {
  if (p.user.statuses.includes('notRecommended')) return 0
  const status = p.user.statuses.reduce((sum, s) => sum + (STATUS_WEIGHT[s] ?? 0), 0)
  return status + ((p.user.rating ?? 0) >= 4 ? 2 : 0)
}

const topBy = (counts: Map<string, number>, n: number) =>
  [...counts].sort((a, b) => b[1] - a[1]).slice(0, n)

export function buildTasteProfile(places: PlaceWithUser[]): TasteProfile | null {
  const liked = places.filter((p) => weightOf(p) > 0)
  if (liked.length < MIN_PLACES) return null

  const cuisines = new Map<string, number>()
  const prices = new Map<string, number>()
  for (const p of liked) {
    const w = weightOf(p)
    for (const c of p.cuisines) cuisines.set(c, (cuisines.get(c) ?? 0) + w)
    if (p.priceRange) prices.set(p.priceRange, (prices.get(p.priceRange) ?? 0) + w)
  }

  const disliked = places.filter((p) => p.user.statuses.includes('notRecommended'))
  const likedCuisines = new Set(liked.flatMap((p) => p.cuisines))

  return {
    topCuisines: topBy(cuisines, 5).map(([name, count]) => ({ name, count })),
    preferredPriceRanges: topBy(prices, 2)
      .map(([p]) => p as PriceRange)
      .sort((a, b) => PRICE_ORDER.indexOf(a) - PRICE_ORDER.indexOf(b)),
    highRated: liked
      .filter((p) => (p.user.rating ?? 0) >= 4)
      .sort((a, b) => (b.user.rating ?? 0) - (a.user.rating ?? 0))
      .slice(0, 10)
      .map((p) => (p.cuisines.length > 0 ? `${p.name}（${p.cuisines.join('、')}）` : p.name)),
    // 只有在喜歡的店裡沒出現過的料理，才算不喜歡的類型
    dislikedCuisines: [...new Set(disliked.flatMap((p) => p.cuisines))].filter((c) => !likedCuisines.has(c)),
    dislikedNames: disliked.map((p) => p.name).slice(0, 20),
    totalSaved: places.length,
  }
}

/** 收藏轉成送給後端的精簡格式（含不推薦，讓後端避免把它們當新店推薦） */
export function toSavedInputs(places: PlaceWithUser[]): SavedPlaceInput[] {
  return places.slice(0, MAX_SAVED_INPUTS).map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    city: p.city ?? null,
    district: p.district ?? null,
    cuisines: p.cuisines,
    statuses: p.user.statuses,
    rating: p.user.rating ?? null,
    priceRange: p.priceRange ?? null,
  }))
}
