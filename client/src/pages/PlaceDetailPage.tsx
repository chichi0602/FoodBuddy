import { App, Button, Card, Descriptions, Empty, Image, Popconfirm, Rate, Result, Space, Spin, Tag } from 'antd'
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { placeRepository } from '../db/placeRepository'
import { MEAL_TIMES, PRICE_META } from '../constants'
import StatusToggles from '../components/StatusToggles'
import './PlaceDetailPage.css'

export default function PlaceDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  // useLiveQuery 回傳 undefined 代表載入中，因此找不到時改回傳 null
  const place = useLiveQuery(async () => (await placeRepository.get(id)) ?? null, [id])

  if (place === undefined) return <Spin />
  if (place === null)
    return (
      <Result
        status="404"
        title="找不到這間店"
        subTitle="可能已經被刪除了。"
        extra={
          <Link to="/my">
            <Button type="primary">回到我的美食</Button>
          </Link>
        }
      />
    )

  const mapsUrl =
    place.googleMapsUrl ||
    (place.lat != null && place.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
      : place.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`
        : undefined)

  const remove = async () => {
    await placeRepository.remove(place.id)
    message.success(`已刪除「${place.name}」`)
    navigate('/my', { replace: true })
  }

  return (
    <div className="place-detail">
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} className="place-detail-back">
        返回
      </Button>

      <header className="place-detail-head">
        <div>
          <h1 className="page-title">{place.name}</h1>
          <p className="page-subtitle">
            {[place.city, place.district, place.placeType].filter(Boolean).join(' ／ ') || '尚未填寫地區'}
          </p>
        </div>
        <Space wrap>
          {mapsUrl && (
            <Button href={mapsUrl} target="_blank" rel="noreferrer" icon={<EnvironmentOutlined />}>
              在 Google Maps 開啟
            </Button>
          )}
          <Link to={`/my/${place.id}/edit`}>
            <Button icon={<EditOutlined />}>編輯</Button>
          </Link>
          <Popconfirm
            title="刪除這間店？"
            description="相關的到訪紀錄也會一起刪除，無法復原。"
            okText="刪除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={remove}
          >
            <Button danger icon={<DeleteOutlined />}>
              刪除
            </Button>
          </Popconfirm>
        </Space>
      </header>

      {place.images.length > 0 && (
        <div className="place-detail-gallery">
          <Image.PreviewGroup>
            {place.images.map((src, i) => (
              <Image key={i} src={src} alt={`${place.name} 圖片 ${i + 1}`} width={180} height={140} />
            ))}
          </Image.PreviewGroup>
        </div>
      )}

      <div className="place-detail-grid">
        <Card title="我的紀錄" className="place-detail-card place-detail-card--mine">
          <div className="place-detail-row">
            <span className="place-detail-label">狀態</span>
            <StatusToggles statuses={place.user.statuses} onToggle={(s) => placeRepository.toggleStatus(place.id, s)} />
          </div>
          <div className="place-detail-row">
            <span className="place-detail-label">個人評分</span>
            <Rate allowHalf value={place.user.rating} onChange={(v) => placeRepository.setRating(place.id, v)} />
          </div>
          <div className="place-detail-row">
            <span className="place-detail-label">備註</span>
            <p className="place-detail-note">{place.user.note || '還沒有備註。'}</p>
          </div>
          {place.tags.length > 0 && (
            <div className="place-detail-row">
              <span className="place-detail-label">Tag</span>
              <div>
                {place.tags.map((t) => (
                  <Tag key={t}>#{t}</Tag>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title="基本資料" className="place-detail-card">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="地址">{place.address || '—'}</Descriptions.Item>
            <Descriptions.Item label="食物類型">{place.cuisines.join('、') || '—'}</Descriptions.Item>
            <Descriptions.Item label="適合時段">
              {place.mealTimes?.map((m) => MEAL_TIMES[m]).join('、') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="價格">{place.priceRange ? PRICE_META[place.priceRange].label : '—'}</Descriptions.Item>
            <Descriptions.Item label="營業時間">{place.openingHours || '—'}</Descriptions.Item>
            <Descriptions.Item label="電話">
              {place.phone ? <a href={`tel:${place.phone}`}>{place.phone}</a> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="推薦餐點">{place.recommendedDishes.join('、') || '—'}</Descriptions.Item>
            {place.lat != null && place.lng != null && (
              <Descriptions.Item label="經緯度">
                {place.lat}, {place.lng}
              </Descriptions.Item>
            )}
          </Descriptions>
          {place.links.length > 0 && (
            <ul className="place-detail-links">
              {place.links.map((l) => (
                <li key={l}>
                  <a href={l} target="_blank" rel="noreferrer">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="AI 整理" className="place-detail-card">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="AI 店家分析會在 AI 找美食功能完成後提供。" />
        </Card>
      </div>
    </div>
  )
}
