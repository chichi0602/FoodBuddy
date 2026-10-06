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
  let res: Response
  try {
    res = await fetch('/api/geo/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error('連不上 FoodBuddy 後端，請確認後端已啟動。')
  }
  if (res.status === 404) {
    const data = await res.json().catch(() => null)
    // 後端是舊版時整個端點不存在，回應不會有 message
    if (typeof data?.message !== 'string') throw new Error('後端還沒有找座標功能，請重新啟動後端後再試。')
    return null
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(typeof data?.message === 'string' ? data.message : '找座標失敗，請稍後再試。')
  }
  return res.json() as Promise<GeocodeResult>
}
