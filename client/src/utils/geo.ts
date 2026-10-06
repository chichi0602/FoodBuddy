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
