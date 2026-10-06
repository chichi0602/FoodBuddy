import { Button, Rate } from 'antd'
import { Link } from 'react-router-dom'
import type { PlaceWithUser, Recommendation } from '../types'
import { googleMapsSearchUrl } from '../utils/aiMatch'
import { formatDistance } from '../utils/geo'
import StatusTags from './StatusTags'
import './MapPopups.css'

/** 地圖上「我的美食」店家的 Popup；note 用來顯示 AI 對這間收藏的評語 */
export function PlacePopup({ place, note }: { place: PlaceWithUser; note?: string }) {
  const location = [place.city, place.district].filter(Boolean).join(' ')
  return (
    <div className="map-popup">
      <strong className="map-popup-name">{place.name}</strong>
      {location && <span className="map-popup-meta">{location}</span>}
      {place.cuisines.length > 0 && <span className="map-popup-meta">{place.cuisines.join('、')}</span>}
      <StatusTags statuses={place.user.statuses} />
      {place.user.rating != null && <Rate disabled allowHalf value={place.user.rating} className="map-popup-rate" />}
      {note && <p className="map-popup-note">{note}</p>}
      <Link to={`/my/${place.id}`}>查看詳細</Link>
    </div>
  )
}

/** 地圖上 AI 推薦店家的 Popup */
export function RecommendationPopup({
  item,
  saved,
  onSave,
}: {
  item: Recommendation
  saved?: PlaceWithUser
  onSave: () => void
}) {
  return (
    <div className="map-popup">
      <strong className="map-popup-name">{item.name}</strong>
      <span className="map-popup-meta">
        符合度 {item.matchScore} ・ 距離 {formatDistance(item.distanceMeters / 1000)}
      </span>
      {item.preferenceReason && <p className="map-popup-note map-popup-note--pref">為你推薦：{item.preferenceReason}</p>}
      <p className="map-popup-note">{item.reason}</p>
      {saved ? (
        <>
          <StatusTags statuses={saved.user.statuses} />
          <Link to={`/my/${saved.id}`}>查看詳細</Link>
        </>
      ) : (
        <Button size="small" type="primary" onClick={onSave}>
          📌 加入想去
        </Button>
      )}
      <a href={googleMapsSearchUrl(item)} target="_blank" rel="noreferrer">
        在 Google Maps 確認
      </a>
    </div>
  )
}
