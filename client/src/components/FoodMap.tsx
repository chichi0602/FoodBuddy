import { useEffect, useMemo, type ReactNode } from 'react'
import L from 'leaflet'
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import type { PlaceStatus } from '../types'
import type { LatLng } from '../utils/geo'
import './FoodMap.css'

/** 標記種類：收藏 ❤️、想去 📌、去過 ✅、不推薦 🚫、其他 📍、AI 推薦 ✨ */
export type MarkerKind = 'favorite' | 'wantToGo' | 'visited' | 'notRecommended' | 'other' | 'ai'

export const MARKER_META: Record<MarkerKind, { icon: string; label: string }> = {
  favorite: { icon: '❤️', label: '收藏' },
  wantToGo: { icon: '📌', label: '想去' },
  visited: { icon: '✅', label: '去過' },
  notRecommended: { icon: '🚫', label: '不推薦' },
  other: { icon: '📍', label: '其他' },
  ai: { icon: '✨', label: 'AI 推薦' },
}

/** 一間店可能有多個狀態，地圖上只能用一個標記：收藏／想再訪 > 想去 > 去過 > 不推薦 */
export function markerKindOf(statuses: PlaceStatus[]): MarkerKind {
  if (statuses.includes('notRecommended')) return 'notRecommended'
  if (statuses.includes('favorite') || statuses.includes('revisit')) return 'favorite'
  if (statuses.includes('wantToGo')) return 'wantToGo'
  if (statuses.includes('visited')) return 'visited'
  return 'other'
}

export interface MapMarker {
  id: string
  lat: number
  lng: number
  kind: MarkerKind
  title: string
  popup: ReactNode
}

interface Props {
  markers: MapMarker[]
  /** 搜尋範圍：畫圓圈並以它為視野 */
  area?: { lat: number; lng: number; radiusMeters: number }
  userLocation?: LatLng
  /** 改變時重新縮放到所有標記 */
  fitKey?: string
  className?: string
}

const TAIWAN_CENTER: [number, number] = [23.7, 120.95]

const iconCache = new Map<MarkerKind, L.DivIcon>()
function iconFor(kind: MarkerKind): L.DivIcon {
  let icon = iconCache.get(kind)
  if (!icon) {
    // 用 divIcon 畫 emoji 圖釘，不用 Leaflet 預設圖檔（打包後路徑會遺失）
    icon = L.divIcon({
      className: `food-pin food-pin--${kind}`,
      html: `<span class="food-pin-inner"><span class="food-pin-emoji">${MARKER_META[kind].icon}</span></span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -30],
    })
    iconCache.set(kind, icon)
  }
  return icon
}

/** 依標記與搜尋範圍調整視野 */
function FitView({ markers, area, fitKey }: Pick<Props, 'markers' | 'area' | 'fitKey'>) {
  const map = useMap()
  useEffect(() => {
    // 地圖剛顯示時容器尺寸可能還沒定案（例如從列表切到地圖），先重新量尺寸再縮放，否則中心會偏掉
    const frame = requestAnimationFrame(() => {
      map.invalidateSize()
      if (area) {
        map.fitBounds(L.latLng(area.lat, area.lng).toBounds(area.radiusMeters * 2), { padding: [16, 16] })
      } else if (markers.length === 1) {
        map.setView([markers[0].lat, markers[0].lng], 16)
      } else if (markers.length > 1) {
        map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng])), { padding: [40, 40], maxZoom: 16 })
      }
    })
    return () => cancelAnimationFrame(frame)
    // 只在 fitKey 改變時重新縮放，避免使用者拖動後被拉回
  }, [fitKey, map])
  return null
}

/** 移動到目前位置 */
function FlyToUser({ userLocation }: { userLocation?: LatLng }) {
  const map = useMap()
  useEffect(() => {
    if (userLocation) map.flyTo([userLocation.lat, userLocation.lng], Math.max(map.getZoom(), 15))
  }, [userLocation, map])
  return null
}

export default function FoodMap({ markers, area, userLocation, fitKey, className }: Props) {
  // 先畫一般收藏，AI 推薦畫在最上層
  const ordered = useMemo(() => [...markers].sort((a, b) => Number(a.kind === 'ai') - Number(b.kind === 'ai')), [markers])

  return (
    <MapContainer center={TAIWAN_CENTER} zoom={7} className={className ? `food-map ${className}` : 'food-map'} scrollWheelZoom>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者'
        maxZoom={19}
      />
      {area && (
        <Circle
          center={[area.lat, area.lng]}
          radius={area.radiusMeters}
          pathOptions={{ color: '#386E80', weight: 1.5, fillColor: '#A6DAEC', fillOpacity: 0.12, dashArray: '6 6' }}
        />
      )}
      {ordered.map((m) => (
        <Marker key={m.id} position={[m.lat, m.lng]} icon={iconFor(m.kind)} title={m.title} alt={m.title}>
          <Popup>{m.popup}</Popup>
        </Marker>
      ))}
      {userLocation && (
        <CircleMarker
          center={[userLocation.lat, userLocation.lng]}
          radius={8}
          pathOptions={{ color: '#fff', weight: 3, fillColor: '#2F80ED', fillOpacity: 1 }}
        />
      )}
      <FitView markers={markers} area={area} fitKey={fitKey} />
      <FlyToUser userLocation={userLocation} />
    </MapContainer>
  )
}
