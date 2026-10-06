import { Button, Progress, Space, Tag } from 'antd'
import { EnvironmentOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { PRICE_META, STATUS_META } from '../constants'
import type { PlaceStatus, PlaceWithUser, Recommendation } from '../types'
import { googleMapsSearchUrl } from '../utils/aiMatch'
import StatusTags from './StatusTags'
import './RecommendationCard.css'

const QUICK_ACTIONS: PlaceStatus[] = ['wantToGo', 'favorite', 'visited']

interface Props {
  item: Recommendation
  saved?: PlaceWithUser
  onSave: (status: PlaceStatus) => void
  saving?: boolean
}

export default function RecommendationCard({ item, saved, onSave, saving }: Props) {
  const location = [item.city, item.district].filter(Boolean).join(' ')
  const price = item.estimatedPricePerPerson
    ? `約 $${item.estimatedPricePerPerson} / 人`
    : item.priceRange
      ? PRICE_META[item.priceRange].label
      : undefined

  return (
    <article className="rec-card">
      <header className="rec-card-head">
        <div className="rec-card-title">
          <h3 className="rec-card-name">{item.name}</h3>
          <div className="rec-card-meta">
            {location && (
              <span>
                <EnvironmentOutlined /> {location}
              </span>
            )}
            {item.placeType && <span>{item.placeType}</span>}
            {price && <span>{price}</span>}
          </div>
        </div>
        <div className="rec-card-score" aria-label={`符合度 ${item.matchScore}`}>
          <Progress type="circle" percent={item.matchScore} size={52} strokeColor="#386E80" format={(p) => `${p}`} />
          <span>符合度</span>
        </div>
      </header>

      <div className="rec-card-tags">
        {item.cuisines.map((c) => (
          <Tag key={c}>{c}</Tag>
        ))}
      </div>

      <p className="rec-card-reason">{item.reason}</p>

      {item.recommendedDishes.length > 0 && (
        <p className="rec-card-line">
          <span className="rec-card-label">推薦餐點</span>
          {item.recommendedDishes.join('、')}
        </p>
      )}
      {item.reputation && (
        <p className="rec-card-line">
          <span className="rec-card-label">網路評價</span>
          {item.reputation}
        </p>
      )}

      <div className="rec-card-proscons">
        {item.pros.length > 0 && (
          <ul className="rec-card-pros" aria-label="優點">
            {item.pros.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {item.cons.length > 0 && (
          <ul className="rec-card-cons" aria-label="可能缺點">
            {item.cons.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </div>

      <footer className="rec-card-foot">
        {saved ? (
          <Space wrap>
            <span className="rec-card-saved">已在我的美食</span>
            <StatusTags statuses={saved.user.statuses} />
            <Link to={`/my/${saved.id}`}>
              <Button size="small">查看</Button>
            </Link>
          </Space>
        ) : (
          <Space wrap>
            {QUICK_ACTIONS.map((s) => (
              <Button key={s} size="small" type={s === 'wantToGo' ? 'primary' : 'default'} loading={saving} onClick={() => onSave(s)}>
                {STATUS_META[s].icon} {s === 'visited' ? '標記去過' : `加入${STATUS_META[s].label}`}
              </Button>
            ))}
          </Space>
        )}
        <a href={googleMapsSearchUrl(item)} target="_blank" rel="noreferrer" className="rec-card-maps">
          在 Google Maps 確認
        </a>
      </footer>
    </article>
  )
}
