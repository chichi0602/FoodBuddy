import { Button, Image, Popconfirm, Rate, Tag } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import type { VisitRecord } from '../types'
import './VisitCard.css'

const REVISIT_LABEL = { yes: '🔁 願意再訪', no: '🚫 不會再去' }

interface Props {
  visit: VisitRecord
  /** 時間軸上顯示店名（詳細頁不需要） */
  placeName?: string
  onEdit: () => void
  onDelete: () => void
}

export default function VisitCard({ visit, placeName, onEdit, onDelete }: Props) {
  const date = dayjs(visit.visitedAt)
  return (
    <article className="visit-card">
      <div className="visit-card-date" aria-label={date.format('YYYY 年 M 月 D 日')}>
        <span className="visit-card-day">{date.format('D')}</span>
        <span className="visit-card-month">{date.format('M 月')}</span>
      </div>
      <div className="visit-card-body">
        <div className="visit-card-head">
          {placeName !== undefined &&
            (placeName ? (
              <Link to={`/my/${visit.placeId}`} className="visit-card-place">
                {placeName}
              </Link>
            ) : (
              <span className="visit-card-place">（店家已刪除）</span>
            ))}
          {visit.rating != null && <Rate disabled allowHalf value={visit.rating} className="visit-card-rate" />}
          {visit.wouldRevisit != null && <Tag>{REVISIT_LABEL[visit.wouldRevisit ? 'yes' : 'no']}</Tag>}
        </div>
        <div className="visit-card-meta">
          {visit.spending != null && <span>花費 ${visit.spending.toLocaleString()}</span>}
          {visit.companions && <span>和 {visit.companions}</span>}
          <span>{date.format('dddd')}</span>
        </div>
        {visit.dishes.length > 0 && <p className="visit-card-dishes">吃了：{visit.dishes.join('、')}</p>}
        {visit.review && <p className="visit-card-review">{visit.review}</p>}
        {visit.photos.length > 0 && (
          <div className="visit-card-photos">
            <Image.PreviewGroup>
              {visit.photos.map((src, i) => (
                <Image key={i} src={src} width={72} height={72} alt={`到訪照片 ${i + 1}`} />
              ))}
            </Image.PreviewGroup>
          </div>
        )}
      </div>
      <div className="visit-card-actions">
        <Button type="text" size="small" icon={<EditOutlined />} aria-label="編輯到訪紀錄" onClick={onEdit} />
        <Popconfirm title="刪除這筆到訪紀錄？" okText="刪除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={onDelete}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="刪除到訪紀錄" />
        </Popconfirm>
      </div>
    </article>
  )
}
