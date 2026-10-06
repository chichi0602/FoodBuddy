import { Tag } from 'antd'
import { STATUS_META, STATUS_ORDER } from '../constants'
import type { PlaceStatus } from '../types'

export default function StatusTags({ statuses }: { statuses: PlaceStatus[] }) {
  return (
    <span>
      {STATUS_ORDER.filter((s) => statuses.includes(s)).map((s) => (
        <Tag key={s} color={STATUS_META[s].color}>
          {STATUS_META[s].icon} {STATUS_META[s].label}
        </Tag>
      ))}
    </span>
  )
}
