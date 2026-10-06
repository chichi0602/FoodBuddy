import { Button, Space } from 'antd'
import { STATUS_META, STATUS_ORDER } from '../constants'
import type { PlaceStatus } from '../types'

interface Props {
  statuses: PlaceStatus[]
  onToggle: (status: PlaceStatus) => void
  size?: 'small' | 'middle'
}

/** 店家狀態切換按鈕（可多選） */
export default function StatusToggles({ statuses, onToggle, size = 'middle' }: Props) {
  return (
    <Space wrap size={6}>
      {STATUS_ORDER.map((s) => {
        const on = statuses.includes(s)
        return (
          <Button
            key={s}
            size={size}
            type={on ? 'primary' : 'default'}
            aria-pressed={on}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggle(s)
            }}
          >
            {STATUS_META[s].icon} {STATUS_META[s].label}
          </Button>
        )
      })}
    </Space>
  )
}
