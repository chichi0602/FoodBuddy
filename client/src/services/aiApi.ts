import type { Recommendation, SearchConditions } from '../types'

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

  recommend: (query: string, conditions: SearchConditions, excludeNames: string[], signal?: AbortSignal) =>
    post<{ recommendations: Recommendation[]; mock: boolean }>('recommend', { query, conditions, excludeNames }, signal),
}
