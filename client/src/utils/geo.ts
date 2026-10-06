/**
 * 從 Google Maps 網址解析經緯度。
 * 支援 .../@22.6614,120.3051,17z 與 ...?q=22.6614,120.3051 兩種格式；短網址（maps.app.goo.gl）無法解析。
 */
export function parseLatLngFromMapsUrl(url: string): { lat: number; lng: number } | undefined {
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? url.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
  if (!match) return undefined
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined
  return { lat, lng }
}

export interface LatLng {
  lat: number
  lng: number
}

/** 兩點直線距離（公里，Haversine） */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 取得目前位置；失敗時回傳可直接顯示給使用者的錯誤訊息 */
export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('這個瀏覽器不支援定位。'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const messages: Record<number, string> = {
          1: '沒有定位權限，請在瀏覽器設定中允許此網站使用位置。',
          2: '目前無法取得位置，請確認裝置已開啟定位。',
          3: '定位逾時，請再試一次。',
        }
        reject(new Error(messages[err.code] ?? '定位失敗，請再試一次。'))
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  })
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} 公尺` : `${km.toFixed(1)} 公里`
}
