import { PRICE_ORDER } from '../constants'
import type { PlaceStatus, PlaceWithUser, PriceRange, SavedPlaceInput, TasteProfile, VisitRecord } from '../types'

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

/** 依地點分組的到訪摘要 */
interface VisitStats {
  count: number
  highRated: number
  /** 最新一次到訪是否表示不會再去 */
  lastSaidNo: boolean
}

function visitStatsByPlace(visits: VisitRecord[]): Map<string, VisitStats> {
  const map = new Map<string, VisitStats & { lastDate: string }>()
  for (const v of visits) {
    const s = map.get(v.placeId) ?? { count: 0, highRated: 0, lastSaidNo: false, lastDate: '' }
    s.count++
    if ((v.rating ?? 0) >= 4) s.highRated++
    if (v.visitedAt >= s.lastDate) {
      s.lastDate = v.visitedAt
      s.lastSaidNo = v.wouldRevisit === false
    }
    map.set(v.placeId, s)
  }
  return map
}

function isDisliked(p: PlaceWithUser, stats?: VisitStats): boolean {
  return p.user.statuses.includes('notRecommended') || !!stats?.lastSaidNo
}

/** 喜好權重：狀態＋高評分＋到訪次數（每次 +1、該次評分 ≥4 再 +1） */
function weightOf(p: PlaceWithUser, stats?: VisitStats): number {
  if (isDisliked(p, stats)) return 0
  const status = p.user.statuses.reduce((sum, s) => sum + (STATUS_WEIGHT[s] ?? 0), 0)
  const visits = stats ? stats.count + stats.highRated : 0
  return status + ((p.user.rating ?? 0) >= 4 ? 2 : 0) + visits
}

const topBy = (counts: Map<string, number>, n: number) =>
  [...counts].sort((a, b) => b[1] - a[1]).slice(0, n)

export function buildTasteProfile(places: PlaceWithUser[], visits: VisitRecord[] = []): TasteProfile | null {
  const statsByPlace = visitStatsByPlace(visits)
  const liked = places.filter((p) => weightOf(p, statsByPlace.get(p.id)) > 0)
  if (liked.length < MIN_PLACES) return null

  const cuisines = new Map<string, number>()
  const prices = new Map<string, number>()
  const districts = new Map<string, number>()
  for (const p of liked) {
    const w = weightOf(p, statsByPlace.get(p.id))
    for (const c of p.cuisines) cuisines.set(c, (cuisines.get(c) ?? 0) + w)
    if (p.priceRange) prices.set(p.priceRange, (prices.get(p.priceRange) ?? 0) + w)
    const area = [p.city, p.district].filter(Boolean).join('')
    if (area) districts.set(area, (districts.get(area) ?? 0) + w)
  }

  const disliked = places.filter((p) => isDisliked(p, statsByPlace.get(p.id)))
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
    topDistricts: topBy(districts, 3).map(([d]) => d),
    visitCount: visits.length,
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
