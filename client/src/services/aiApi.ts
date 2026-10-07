import type { RecommendResult, SavedPlaceInput, SearchConditions, TasteInsight, TasteProfile } from '../types'
import type { LatLng } from '../utils/geo'

export class AiApiError extends Error {}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/ai/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new AiApiError('連不上 FoodBuddy 後端，請確認後端已啟動。')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new AiApiError(
      typeof data?.message === 'string'
        ? data.message
        : res.status === 404
          ? '後端還沒有 AI 功能，請重新啟動後端後再試。'
          : res.status >= 500
          ? '連不上 FoodBuddy 後端，請確認後端已啟動。'
          : '搜尋條件有誤，請調整後再試一次。',
    )
  }
  return res.json() as Promise<T>
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
