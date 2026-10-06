import { PRICE_META, PRICE_ORDER } from '../constants'
import type { MealTime, PlaceStatus, PlaceWithUser, PriceRange } from '../types'
import { distanceKm, type LatLng } from './geo'

export interface PlaceFilter {
  keyword: string
  countries: string[]
  cities: string[]
  districts: string[]
  cuisines: string[]
  mealTimes: MealTime[]
  priceRanges: PriceRange[]
  /** 自訂每人預算 */
  budget?: number
  statuses: PlaceStatus[]
  notVisited: boolean
  tags: string[]
  /** 附近範圍（公里），需搭配目前位置 */
  radiusKm?: number
}

export type SortKey = 'updated' | 'rating' | 'name' | 'priceAsc' | 'priceDesc' | 'distance'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated', label: '最近更新' },
  { value: 'rating', label: '個人評分高到低' },
  { value: 'name', label: '店名' },
  { value: 'priceAsc', label: '價格低到高' },
  { value: 'priceDesc', label: '價格高到低' },
  { value: 'distance', label: '距離近到遠' },
]

export const EMPTY_FILTER: PlaceFilter = {
  keyword: '',
  countries: [],
  cities: [],
  districts: [],
  cuisines: [],
  mealTimes: [],
  priceRanges: [],
  statuses: [],
  notVisited: false,
  tags: [],
}

export interface PlaceResult extends PlaceWithUser {
  distanceKm?: number
}

/** 同一類條件多選為 OR，不同類條件之間為 AND */
export function filterPlaces(places: PlaceWithUser[], f: PlaceFilter, origin?: LatLng): PlaceResult[] {
  const kw = f.keyword.trim().toLowerCase()
  const anyOf = <T,>(selected: T[], values: T[]) => selected.length === 0 || selected.some((s) => values.includes(s))
  const oneOf = <T,>(selected: T[], value: T | undefined) =>
    selected.length === 0 || (value !== undefined && selected.includes(value))

  const results: PlaceResult[] = []
  for (const p of places) {
    if (!oneOf(f.countries, p.country)) continue
    if (!oneOf(f.cities, p.city)) continue
    if (!oneOf(f.districts, p.district)) continue
    if (!anyOf(f.cuisines, p.cuisines)) continue
    if (!anyOf(f.mealTimes, p.mealTimes ?? [])) continue
    if (!anyOf(f.tags, p.tags)) continue
    if (!oneOf(f.priceRanges, p.priceRange)) continue
    if (f.budget != null) {
      if (!p.priceRange) continue
      const { min, max } = PRICE_META[p.priceRange]
      if (f.budget < min || f.budget > max) continue
    }
    // 「未去過」與其他狀態屬於同一類，任一符合即可
    if (f.statuses.length > 0 || f.notVisited) {
      const matchStatus = f.statuses.some((s) => p.user.statuses.includes(s))
      const matchNotVisited = f.notVisited && !p.user.statuses.includes('visited')
      if (!matchStatus && !matchNotVisited) continue
    }
    if (
      kw &&
      ![p.name, p.address, p.country, p.city, p.district, p.placeType, p.user.note, ...p.cuisines, ...p.tags, ...p.recommendedDishes]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(kw))
    )
      continue

    const dist = origin && p.lat != null && p.lng != null ? distanceKm(origin, { lat: p.lat, lng: p.lng }) : undefined
    if (f.radiusKm != null && origin && (dist === undefined || dist > f.radiusKm)) continue

    results.push({ ...p, distanceKm: dist })
  }
  return results
}

const priceIndex = (p: PlaceResult) => (p.priceRange ? PRICE_ORDER.indexOf(p.priceRange) : undefined)

/** 缺少排序依據的店一律排在最後 */
function compareOptional(a: number | undefined, b: number | undefined, desc = false) {
  if (a === undefined && b === undefined) return 0
  if (a === undefined) return 1
  if (b === undefined) return -1
  return desc ? b - a : a - b
}

export function sortPlaces(places: PlaceResult[], key: SortKey): PlaceResult[] {
  const sorted = [...places]
  switch (key) {
    case 'rating':
      return sorted.sort((a, b) => compareOptional(a.user.rating, b.user.rating, true))
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
    case 'priceAsc':
      return sorted.sort((a, b) => compareOptional(priceIndex(a), priceIndex(b)))
    case 'priceDesc':
      return sorted.sort((a, b) => compareOptional(priceIndex(a), priceIndex(b), true))
    case 'distance':
      return sorted.sort((a, b) => compareOptional(a.distanceKm, b.distanceKm))
    default:
      return sorted.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

/** 已套用的條件數（不含關鍵字與狀態分頁） */
export function countActive(f: PlaceFilter): number {
  return (
    f.countries.length +
    f.cities.length +
    f.districts.length +
    f.cuisines.length +
    f.mealTimes.length +
    f.priceRanges.length +
    (f.budget != null ? 1 : 0) +
    f.statuses.length +
    (f.notVisited ? 1 : 0) +
    f.tags.length +
    (f.radiusKm != null ? 1 : 0)
  )
}

/** 篩選條件 <-> URL query，讓重新整理或分享連結時保留條件 */
export function filterFromParams(params: URLSearchParams): { filter: PlaceFilter; sort: SortKey } {
  const num = (key: string) => {
    const v = params.get(key)
    return v !== null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined
  }
  const sort = params.get('sort') as SortKey | null
  return {
    filter: {
      keyword: params.get('q') ?? '',
      countries: params.getAll('country'),
      cities: params.getAll('city'),
      districts: params.getAll('district'),
      cuisines: params.getAll('cuisine'),
      mealTimes: params.getAll('meal') as MealTime[],
      priceRanges: params.getAll('price').filter((p): p is PriceRange => p in PRICE_META),
      budget: num('budget'),
      statuses: params.getAll('status') as PlaceStatus[],
      notVisited: params.get('notVisited') === '1',
      tags: params.getAll('tag'),
      radiusKm: num('km'),
    },
    sort: sort && SORT_OPTIONS.some((o) => o.value === sort) ? sort : 'updated',
  }
}

export function filterToParams(f: PlaceFilter, sort: SortKey): URLSearchParams {
  const params = new URLSearchParams()
  const addAll = (key: string, values: string[]) => values.forEach((v) => params.append(key, v))
  if (f.keyword) params.set('q', f.keyword)
  addAll('country', f.countries)
  addAll('city', f.cities)
  addAll('district', f.districts)
  addAll('cuisine', f.cuisines)
  addAll('meal', f.mealTimes)
  addAll('price', f.priceRanges)
  if (f.budget != null) params.set('budget', String(f.budget))
  addAll('status', f.statuses)
  if (f.notVisited) params.set('notVisited', '1')
  addAll('tag', f.tags)
  if (f.radiusKm != null) params.set('km', String(f.radiusKm))
  if (sort !== 'updated') params.set('sort', sort)
  return params
}
