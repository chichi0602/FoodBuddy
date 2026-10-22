import { HttpError, requestJson } from './http'

export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
  /** address：依地址找到；name：依店名找到（較可能找錯，請使用者確認） */
  matchedBy: 'address' | 'name'
}

export interface GeocodeInput {
  name: string
  address?: string
  city?: string
  district?: string
  country?: string
}

/** 用地址或店名找座標；找不到回傳 null，其他錯誤丟出可直接顯示的訊息 */
export async function geocodePlace(input: GeocodeInput, signal?: AbortSignal): Promise<GeocodeResult | null> {
  try {
    return await requestJson<GeocodeResult>('/api/geo/geocode', { body: input, signal, fallback: '找座標失敗，請稍後再試。' })
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null
    throw e
  }
}
