import { useState } from 'react'
import { Button, Progress, Space, Tag } from 'antd'
import {
  ClockCircleOutlined,
  DownOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
  UpOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { PRICE_META, STATUS_META } from '../constants'
import type { PlaceStatus, PlaceWithUser, Recommendation } from '../types'
import { googleMapsSearchUrl } from '../utils/aiMatch'
import { formatDistance } from '../utils/geo'
import StatusTags from './StatusTags'
import './RecommendationCard.css'

const QUICK_ACTIONS: PlaceStatus[] = ['wantToGo', 'favorite', 'visited']

interface Props {
  item: Recommendation
  saved?: PlaceWithUser
  onSave: (status: PlaceStatus) => void
  saving?: boolean
  /** 按「沒興趣」；沒傳就不顯示按鈕 */
  onDismiss?: () => void
}

export default function RecommendationCard({ item, saved, onSave, saving, onDismiss }: Props) {
  const [showScore, setShowScore] = useState(false)
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
            <span className="rec-card-verified">
              <SafetyCertificateOutlined /> 地圖已驗證
            </span>
            <span>距離 {formatDistance(item.distanceMeters / 1000)}</span>
            {item.placeType && <span>{item.placeType}</span>}
            {price && <span>{price}</span>}
          </div>
        </div>
        <button
          type="button"
          className="rec-card-score"
          aria-label={`推薦分數 ${item.score}，${showScore ? '收合' : '展開'}分數明細`}
          aria-expanded={showScore}
          onClick={() => setShowScore(!showScore)}
        >
          <Progress type="circle" percent={item.score} size={52} strokeColor="#386E80" format={(p) => `${p}`} />
          <span>
            推薦分數 {showScore ? <UpOutlined /> : <DownOutlined />}
          </span>
        </button>
      </header>

      {showScore && (
        <ul className="rec-card-breakdown" aria-label="推薦分數明細">
          {item.scoreBreakdown.map((b) => (
            <li key={b.key}>
              <span className="rec-card-breakdown-label">{b.label}</span>
              <span className="rec-card-breakdown-track" aria-hidden>
                <span className="rec-card-breakdown-fill" style={{ width: `${(b.points / b.max) * 100}%` }} />
              </span>
              <span className="rec-card-breakdown-points">
                {b.points}/{b.max}
              </span>
              <span className="rec-card-breakdown-note">{b.note}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="rec-card-tags">
        {item.cuisines.map((c) => (
          <Tag key={c}>{c}</Tag>
        ))}
      </div>

      {item.preferenceReason && (
        <p className="rec-card-pref">
          <span className="rec-card-pref-label">為你推薦</span>
          {item.preferenceReason}
        </p>
      )}

      <p className="rec-card-reason">{item.reason}</p>

      <ul className="rec-card-facts">
        <li>
          <EnvironmentOutlined /> {item.address ?? '地圖資料沒有地址，請用 Google Maps 確認位置'}
        </li>
        {item.openingHours && (
          <li>
            <ClockCircleOutlined /> {item.openingHours}
          </li>
        )}
        {item.phone && (
          <li>
            <PhoneOutlined /> <a href={`tel:${item.phone}`}>{item.phone}</a>
          </li>
        )}
        {item.website && (
          <li>
            <GlobalOutlined />{' '}
            <a href={item.website} target="_blank" rel="noreferrer">
              官方網站
            </a>
          </li>
        )}
      </ul>

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
        <Space size={12}>
          <a href={googleMapsSearchUrl(item)} target="_blank" rel="noreferrer" className="rec-card-maps">
            在 Google Maps 確認
          </a>
          {onDismiss && !saved && (
            <Button type="text" size="small" icon={<StopOutlined />} className="rec-card-dismiss" onClick={onDismiss}>
              沒興趣
            </Button>
          )}
        </Space>
      </footer>
    </article>
  )
}
