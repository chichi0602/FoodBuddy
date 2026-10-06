import type { ReactNode } from 'react'
import { Rate, Tag } from 'antd'
import { EnvironmentOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { MEAL_TIMES, PRICE_META } from '../constants'
import { placeRepository } from '../db/placeRepository'
import type { PlaceWithUser } from '../types'
import { formatDistance } from '../utils/geo'
import StatusToggles from './StatusToggles'
import './PlaceCard.css'

interface Props {
  place: PlaceWithUser
  distanceKm?: number
  /** 額外顯示在標籤列的內容，例如 AI 比對提示 */
  extra?: ReactNode
}

export default function PlaceCard({ place, distanceKm, extra }: Props) {
  const location = [place.city, place.district].filter(Boolean).join(' ')
  return (
    <article className="place-card">
      <Link to={`/my/${place.id}`} className="place-card-main">
        {place.images[0] ? (
          <img className="place-card-img" src={place.images[0]} alt="" loading="lazy" />
        ) : (
          <div className="place-card-img place-card-img--empty" aria-hidden>
            {place.name.slice(0, 1)}
          </div>
        )}
        <div className="place-card-body">
          <h3 className="place-card-name">{place.name}</h3>
          <div className="place-card-meta">
            {location && (
              <span>
                <EnvironmentOutlined /> {location}
              </span>
            )}
            {place.priceRange && <span>{PRICE_META[place.priceRange].label}</span>}
            {place.mealTimes?.length > 0 && <span>{place.mealTimes.map((m) => MEAL_TIMES[m]).join('、')}</span>}
            {distanceKm != null && <span className="place-card-distance">距離 {formatDistance(distanceKm)}</span>}
          </div>
          <div className="place-card-tags">
            {place.cuisines.map((c) => (
              <Tag key={c}>{c}</Tag>
            ))}
            {place.tags.map((t) => (
              <Tag key={t} variant="filled">
                #{t}
              </Tag>
            ))}
            {extra}
          </div>
        </div>
      </Link>
      <div className="place-card-foot">
        <Rate
          allowHalf
          value={place.user.rating}
          onChange={(v) => placeRepository.setRating(place.id, v)}
          aria-label="個人評分"
        />
        <StatusToggles
          size="small"
          statuses={place.user.statuses}
          onToggle={(s) => placeRepository.toggleStatus(place.id, s)}
        />
      </div>
    </article>
  )
}
