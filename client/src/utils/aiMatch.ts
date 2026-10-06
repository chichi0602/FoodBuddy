import { MEAL_TIMES, PRICE_META } from '../constants'
import type { PlaceInput } from '../db/placeRepository'
import type { PlaceWithUser, Recommendation, SearchConditions } from '../types'
import { distanceKm } from './geo'

/** 地名寬鬆比對：「高雄市」=「高雄」、「臺南」=「台南」 */
export function normalizeArea(s: string): string {
  return s.trim().replace(/臺/g, '台').replace(/(市區|市|縣|區|鄉|鎮)$/, '')
}

/** 店名比對用：去掉空白與標點、轉小寫 */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s·・()（）\-_.,，、]/g, '')
}

function sameArea(want: string | null, place: PlaceWithUser, field: 'city' | 'district'): boolean {
  if (!want) return true
  const target = normalizeArea(want)
  if (place[field]) return normalizeArea(place[field]!) === target
  return !!place.address && place.address.replace(/臺/g, '台').includes(target)
}

export interface CollectionMatch {
  place: PlaceWithUser
  /** 符合的軟性條件，例如「適合晚餐」「符合預算」 */
  hints: string[]
}

/**
 * 用 AI 解析的條件找出「我的美食」中符合的店。
 * 地區與料理是硬條件；時段、預算只作為提示，避免資料不完整的店被排除。
 */
export function matchCollection(places: PlaceWithUser[], c: SearchConditions): CollectionMatch[] {
  const hasArea = !!(c.city || c.district)
  const wantCuisines = c.cuisines.map((x) => x.toLowerCase())
  if (!hasArea && wantCuisines.length === 0) return []

  const matches: CollectionMatch[] = []
  for (const p of places) {
    if (p.user.statuses.includes('notRecommended')) continue
    if (!sameArea(c.city, p, 'city') || !sameArea(c.district, p, 'district')) continue
    if (wantCuisines.length > 0) {
      const text = [p.name, ...p.cuisines, ...p.tags, ...p.recommendedDishes].join(' ').toLowerCase()
      if (!wantCuisines.some((w) => p.cuisines.some((x) => x.toLowerCase() === w) || text.includes(w))) continue
    }

    const hints: string[] = []
    if (c.mealTime && p.mealTimes?.includes(c.mealTime)) hints.push(`適合${MEAL_TIMES[c.mealTime]}`)
    if (c.budgetPerPerson != null && p.priceRange) {
      const { min, max } = PRICE_META[p.priceRange]
      if (c.budgetPerPerson >= min && c.budgetPerPerson <= max) hints.push('符合預算')
    }
    if (c.keywords.some((k) => [p.name, p.user.note, ...p.tags, ...p.recommendedDishes].some((v) => v?.includes(k))))
      hints.push('符合關鍵字')
    matches.push({ place: p, hints })
  }

  // 想再訪、收藏、評分高、符合提示多的排前面
  const weight = (m: CollectionMatch) =>
    (m.place.user.statuses.includes('revisit') ? 30 : 0) +
    (m.place.user.statuses.includes('favorite') ? 20 : 0) +
    (m.place.user.rating ?? 0) * 4 +
    m.hints.length * 10
  return matches.sort((a, b) => weight(b) - weight(a))
}

/**
 * AI 推薦的店是否已經在我的美食裡：店名相同，
 * 或兩邊都有座標、距離 100 公尺內且店名互相包含（例如「一風堂」與「一風堂 巨蛋店」）
 */
export function findSaved(
  places: PlaceWithUser[],
  r: Pick<Recommendation, 'name'> & Partial<Pick<Recommendation, 'lat' | 'lng'>>,
): PlaceWithUser | undefined {
  const target = normalizeName(r.name)
  return places.find((p) => {
    const n = normalizeName(p.name)
    if (n === target) return true
    const similar = Math.min(n.length, target.length) >= 2 && (n.includes(target) || target.includes(n))
    if (!similar) return false
    if (p.lat == null || p.lng == null || r.lat == null || r.lng == null) return Math.min(n.length, target.length) >= 3
    return distanceKm({ lat: p.lat, lng: p.lng }, { lat: r.lat, lng: r.lng }) < 0.1
  })
}

/** 有地址時用「店名＋地址」搜尋，否則用座標，避免連鎖店跳到別間分店 */
export function googleMapsSearchUrl(r: Pick<Recommendation, 'name' | 'address' | 'lat' | 'lng'>): string {
  const q = r.address ? `${r.name} ${r.address}` : `${r.lat},${r.lng}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/** AI 推薦轉成「我的美食」的店家資料，保存 OpenStreetMap 的真實資料與 AI 分析 */
export function recommendationToPlace(r: Recommendation, query: string, country?: string | null): PlaceInput {
  return {
    name: r.name,
    address: r.address ?? undefined,
    country: country ?? '台灣',
    city: r.city ?? undefined,
    district: r.district ?? undefined,
    googleMapsUrl: googleMapsSearchUrl(r),
    lat: r.lat,
    lng: r.lng,
    cuisines: r.cuisines,
    mealTimes: [],
    placeType: r.placeType ?? undefined,
    priceRange: r.priceRange ?? undefined,
    openingHours: r.openingHours ?? undefined,
    phone: r.phone ?? undefined,
    recommendedDishes: r.recommendedDishes,
    images: [],
    links: r.website ? [r.website] : [],
    tags: [],
    source: 'ai',
    aiSummary: {
      reason: r.reason,
      pros: r.pros,
      cons: r.cons,
      reputation: r.reputation ?? undefined,
      suitableFor: r.suitableFor ?? undefined,
      query,
      savedAt: Date.now(),
    },
  }
}
