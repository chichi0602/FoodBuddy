import { useState } from 'react'
import { Button, Empty, Input, Spin } from 'antd'
import { PlusOutlined, SendOutlined } from '@ant-design/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { placeRepository } from '../db/placeRepository'
import { STATUS_META, STATUS_ORDER } from '../constants'
import StatusTags from '../components/StatusTags'
import './HomePage.css'

const EXAMPLES = [
  '高雄左營，三個人晚餐，每人 500 元左右的日式料理',
  '台南中西區晚上想吃牛肉湯',
  '台北信義區適合下午茶的甜點店',
]

export default function HomePage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const places = useLiveQuery(() => placeRepository.list(), [])

  const search = (q: string) => {
    const text = q.trim()
    if (text) navigate(`/ai?q=${encodeURIComponent(text)}`)
  }

  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <h1 id="home-hero-title" className="home-hero-title">今天想吃什麼？</h1>
        <p className="home-hero-desc">說出地點、人數、預算和想吃的料理，AI 會一併參考你收藏過的店。</p>
        <form
          className="home-hero-form"
          onSubmit={(e) => {
            e.preventDefault()
            search(query)
          }}
        >
          <Input.TextArea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                search(query)
              }
            }}
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder="例如：高雄巨蛋附近，兩個人的晚餐，想吃燒肉"
            aria-label="描述你想吃的"
            className="home-hero-input"
          />
          <Button type="primary" htmlType="submit" size="large" icon={<SendOutlined />} className="home-hero-submit">
            找美食
          </Button>
        </form>
        <div className="home-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="home-example" onClick={() => search(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </section>

      <section className="home-mine" aria-labelledby="home-mine-title">
        <div className="home-mine-head">
          <h2 id="home-mine-title" className="home-section-title">我的美食</h2>
          <Link to="/my/new">
            <Button icon={<PlusOutlined />}>新增店家</Button>
          </Link>
        </div>

        <div className="home-counts">
          {STATUS_ORDER.filter((s) => s !== 'notRecommended').map((s) => (
            <Link key={s} to={`/my?status=${s}`} className="home-count">
              <span className="home-count-num">{places?.filter((p) => p.user.statuses.includes(s)).length ?? 0}</span>
              <span className="home-count-label">
                {STATUS_META[s].icon} {STATUS_META[s].label}
              </span>
            </Link>
          ))}
        </div>

        <h3 className="home-recent-title">最近更新</h3>
        {!places ? (
          <Spin />
        ) : places.length === 0 ? (
          <Empty description="還沒有任何店家。用 AI 找一間，或手動新增第一間吧。" />
        ) : (
          <ul className="home-recent">
            {places.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link to={`/my/${p.id}`} className="home-recent-item">
                  <span className="home-recent-name">{p.name}</span>
                  <span className="home-recent-meta">
                    {[p.city, p.district, p.cuisines.join('、')].filter(Boolean).join(' ／ ')}
                  </span>
                  <StatusTags statuses={p.user.statuses} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
