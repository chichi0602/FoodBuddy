import { Link } from 'react-router-dom'
import type { BarItem } from '../utils/foodStats'
import './StatBars.css'

interface Props {
  title: string
  items: BarItem[]
  /** 長條的滿格值；預設為最大值（評分用 5） */
  max?: number
  unit?: string
  emptyText: string
}

/** 單一數列的水平長條清單：一個色相、數值直接標在長條旁，不需要圖例 */
export default function StatBars({ title, items, max, unit = '', emptyText }: Props) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <section className="stat-bars" aria-label={title}>
      <h3 className="stat-bars-title">{title}</h3>
      {items.length === 0 ? (
        <p className="stat-bars-empty">{emptyText}</p>
      ) : (
        <ol className="stat-bars-list">
          {items.map((item) => {
            const text = item.display ?? `${item.value}${unit}`
            return (
              <li key={item.label} className="stat-bars-row" title={`${item.label}：${text}`}>
                <span className="stat-bars-label">
                  {item.href ? <Link to={item.href}>{item.label}</Link> : item.label}
                </span>
                <span className="stat-bars-track" aria-hidden>
                  <span className="stat-bars-fill" style={{ width: `${Math.max(4, (item.value / top) * 100)}%` }} />
                </span>
                <span className="stat-bars-value">{text}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
