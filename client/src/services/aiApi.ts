import type { RecommendResult, SavedPlaceInput, SearchConditions, TasteInsight, TasteProfile } from '../types'
import type { LatLng } from '../utils/geo'
import { requestJson } from './http'

export { HttpError as AiApiError } from './http'

function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(`/api/ai/${path}`, { body, signal, fallback: '搜尋條件有誤，請調整後再試一次。' })
}

export const aiApi = {
  parse: (query: string, signal?: AbortSignal) =>
    post<{ conditions: SearchConditions; mock: boolean }>('parse', { query }, signal),

  recommend: (
    query: string,
    conditions: SearchConditions,
    excludeNames: string[],
    origin: LatLng | undefined,
    personal: { profile: TasteProfile | null; savedPlaces: SavedPlaceInput[]; excludeIds: string[] },
    signal?: AbortSignal,
  ) => post<RecommendResult>('recommend', { query, conditions, excludeNames, origin, ...personal }, signal),

  /** 首頁「為你推薦」：依口味在指定地區或目前位置推薦還沒去過的店 */
  forYou: (body: {
    city: string | null
    district: string | null
    origin: LatLng | null
    profile: TasteProfile | null
    savedPlaces: SavedPlaceInput[]
    excludeNames: string[]
    excludeIds: string[]
  }) => post<RecommendResult>('for-you', body),

  /** 口味分析；visits 只含店名、料理、地區、評分等，不含心得與備註 */
  tasteInsight: (body: {
    profile: TasteProfile | null
    stats: { totalSaved: number; visitedPlaces: number; visitCount: number; averageRating: number | null }
    visits: {
      placeName: string
      cuisines: string[]
      area: string | null
      visitedAt: string
      rating: number | null
      wouldRevisit: boolean | null
      dishes: string[]
    }[]
    notRecommended: string[]
  }) => post<{ insight: TasteInsight; mock: boolean }>('taste-insight', body),
}
