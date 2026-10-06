import { useMemo, useState } from 'react'
import { Alert, App, Button, Empty, Input, Select, Spin, Tabs } from 'antd'
import { PlusOutlined, ReloadOutlined, StarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router-dom'
import { placeRepository } from '../db/placeRepository'
import { visitRepository, type VisitWithPlace } from '../db/visitRepository'
import VisitCard from '../components/VisitCard'
import VisitFormModal from '../components/VisitFormModal'
import StatBars from '../components/StatBars'
import { aiApi } from '../services/aiApi'
import type { PlaceWithUser, TasteInsight, VisitRecord } from '../types'
import { computeFoodStats } from '../utils/foodStats'
import { buildTasteProfile } from '../utils/tasteProfile'
import './VisitsPage.css'

type TabKey = 'timeline' | 'stats'

const INSIGHT_KEY = 'foodbuddy.tasteInsight'

interface SavedInsight {
  insight: TasteInsight
  mock: boolean
  at: number
}

/** localStorage 可能被停用或已滿，讀寫都要能失敗 */
function loadInsight(): SavedInsight | undefined {
  try {
    const raw = localStorage.getItem(INSIGHT_KEY)
    return raw ? (JSON.parse(raw) as SavedInsight) : undefined
  } catch {
    return undefined
  }
}

function storeInsight(value: SavedInsight) {
  try {
    localStorage.setItem(INSIGHT_KEY, JSON.stringify(value))
  } catch {
    // 存不了就只在這次畫面顯示
  }
}

function Timeline({ visits, places }: { visits: VisitWithPlace[]; places: PlaceWithUser[] }) {
  const { message } = App.useApp()
  const [keyword, setKeyword] = useState('')
  const [placeId, setPlaceId] = useState<string>()
  const [modal, setModal] = useState<{ open: boolean; visit?: VisitRecord }>({ open: false })

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return visits.filter((v) => {
      if (placeId && v.placeId !== placeId) return false
      if (!kw) return true
      return [v.place?.name, v.review, v.companions, ...v.dishes].filter(Boolean).some((s) => s!.toLowerCase().includes(kw))
    })
  }, [visits, keyword, placeId])

  // 依月份分組（visits 已是新到舊）
  const groups = useMemo(() => {
    const map = new Map<string, VisitWithPlace[]>()
    for (const v of filtered) {
      const key = dayjs(v.visitedAt).format('YYYY 年 M 月')
      map.set(key, [...(map.get(key) ?? []), v])
    }
    return [...map]
  }, [filtered])

  const visitedPlaces = useMemo(() => {
    const ids = new Set(visits.map((v) => v.placeId))
    return places.filter((p) => ids.has(p.id))
  }, [visits, places])

  return (
    <div className="visits-timeline">
      <div className="visits-toolbar">
        <Input.Search
          allowClear
          placeholder="搜尋店名、吃了什麼、心得、同行人"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="visits-search"
        />
        <Select
          allowClear
          showSearch
          placeholder="全部店家"
          optionFilterProp="label"
          value={placeId}
          onChange={setPlaceId}
          options={visitedPlaces.map((p) => ({ value: p.id, label: p.name }))}
          className="visits-place-filter"
          aria-label="篩選店家"
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={places.length === 0}
          onClick={() => setModal({ open: true })}
        >
          新增到訪
        </Button>
      </div>

      {places.length === 0 ? (
        <Empty description="到訪紀錄要掛在「我的美食」的店家下。先存一間店吧。">
          <Link to="/my/new">
            <Button type="primary">新增店家</Button>
          </Link>
        </Empty>
      ) : visits.length === 0 ? (
        <Empty description="還沒有到訪紀錄。吃完記一筆：日期、評分、吃了什麼和心得，AI 會越來越懂你。" />
      ) : filtered.length === 0 ? (
        <Empty description="沒有符合的到訪紀錄，換個關鍵字試試。" />
      ) : (
        groups.map(([month, list]) => (
          <section key={month} className="visits-month" aria-label={month}>
            <h2 className="visits-month-title">
              {month} <span className="visits-month-count">{list.length} 次</span>
            </h2>
            <div className="visits-list">
              {list.map((v) => (
                <VisitCard
                  key={v.id}
                  visit={v}
                  placeName={v.place?.name ?? ''}
                  onEdit={() => setModal({ open: true, visit: v })}
                  onDelete={async () => {
                    await visitRepository.remove(v.id)
                    message.success('已刪除到訪紀錄')
                  }}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <VisitFormModal
        open={modal.open}
        visit={modal.visit}
        places={places}
        onClose={() => setModal({ open: false })}
      />
    </div>
  )
}

function Stats({ visits, places }: { visits: VisitWithPlace[]; places: PlaceWithUser[] }) {
  const stats = useMemo(() => computeFoodStats(places, visits), [places, visits])
  const [saved, setSaved] = useState<SavedInsight | undefined>(loadInsight)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string>()

  const analyze = async () => {
    setAnalyzing(true)
    setError(undefined)
    try {
      const res = await aiApi.tasteInsight({
        profile: buildTasteProfile(places, visits),
        stats: {
          totalSaved: stats.totalSaved,
          visitedPlaces: stats.visitedPlaces,
          visitCount: stats.visitCount,
          averageRating: stats.averageRating,
        },
        // 不送心得、備註、同行人與照片
        visits: visits.map((v) => ({
          placeName: v.place?.name ?? '（已刪除）',
          cuisines: v.place?.cuisines ?? [],
          area: [v.place?.city, v.place?.district].filter(Boolean).join(' ') || null,
          visitedAt: v.visitedAt,
          rating: v.rating ?? null,
          wouldRevisit: v.wouldRevisit ?? null,
          dishes: v.dishes,
        })),
        notRecommended: places.filter((p) => p.user.statuses.includes('notRecommended')).map((p) => p.name),
      })
      const value = { insight: res.insight, mock: res.mock, at: Date.now() }
      storeInsight(value)
      setSaved(value)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="visits-stats">
      <div className="visits-tiles">
        <div className="visits-tile">
          <span className="visits-tile-num">{stats.totalSaved}</span>
          <span className="visits-tile-label">收藏的店</span>
        </div>
        <div className="visits-tile">
          <span className="visits-tile-num">{stats.visitedPlaces}</span>
          <span className="visits-tile-label">去過的店</span>
        </div>
        <div className="visits-tile">
          <span className="visits-tile-num">{stats.visitCount}</span>
          <span className="visits-tile-label">到訪次數</span>
        </div>
        <div className="visits-tile">
          <span className="visits-tile-num">{stats.averageRating == null ? '—' : stats.averageRating.toFixed(1)}</span>
          <span className="visits-tile-label">到訪平均評分</span>
        </div>
      </div>

      <section className="visits-ai" aria-labelledby="visits-ai-title">
        <div className="visits-ai-head">
          <h2 id="visits-ai-title" className="visits-ai-title">
            AI 口味分析
          </h2>
          <Button
            type={saved ? 'default' : 'primary'}
            icon={saved ? <ReloadOutlined /> : <StarOutlined />}
            loading={analyzing}
            disabled={stats.totalSaved === 0}
            onClick={analyze}
          >
            {saved ? '重新分析' : '分析我的口味'}
          </Button>
        </div>
        {error && <Alert type="error" showIcon title={error} />}
        {!saved && !error && (
          <p className="visits-ai-hint">
            AI 會讀你的收藏與到訪紀錄（店名、料理、地區、評分，不含心得與備註），寫一段口味觀察與下次可以試試的方向。
          </p>
        )}
        {saved && (
          <div className="visits-ai-body">
            <p className="visits-ai-summary">{saved.insight.summary}</p>
            {saved.insight.highlights.length > 0 && (
              <ul className="visits-ai-list">
                {saved.insight.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
            {saved.insight.suggestions.length > 0 && (
              <>
                <h3 className="visits-ai-subtitle">下次可以試試</h3>
                <ul className="visits-ai-list visits-ai-list--try">
                  {saved.insight.suggestions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="visits-ai-meta">
              {dayjs(saved.at).format('YYYY/MM/DD HH:mm')} 分析{saved.mock && '（示範資料）'}。記錄有變化時可以重新分析。
            </p>
          </div>
        )}
      </section>

      <div className="visits-bars">
        <StatBars title="最常收藏的料理" items={stats.savedCuisines} unit=" 間" emptyText="收藏的店還沒有填料理類型。" />
        <StatBars title="最常去吃的料理" items={stats.visitedCuisines} unit=" 次" emptyText="還沒有到訪紀錄。" />
        <StatBars title="最常去的地區" items={stats.districts} unit=" 次" emptyText="還沒有到訪紀錄，或店家沒有填城市與地區。" />
        <StatBars title="評分最高的店" items={stats.topRated} max={5} emptyText="還沒有評過分的店。" />
        <StatBars title="收藏的價位" items={stats.priceRanges} unit=" 間" emptyText="收藏的店還沒有填價格區間。" />
      </div>
    </div>
  )
}

export default function VisitsPage() {
  const [params, setParams] = useSearchParams()
  const tab: TabKey = params.get('tab') === 'stats' ? 'stats' : 'timeline'
  const visits = useLiveQuery(() => visitRepository.listWithPlace(), [])
  const places = useLiveQuery(() => placeRepository.list(), [])

  return (
    <div className="visits-page">
      <h1 className="page-title">到訪與統計</h1>
      <p className="page-subtitle">每一次去吃的紀錄，以及從中看出的口味。</p>
      {!visits || !places ? (
        <Spin />
      ) : (
        <Tabs
          activeKey={tab}
          onChange={(k) => setParams(k === 'stats' ? { tab: 'stats' } : {})}
          items={[
            { key: 'timeline', label: `時間軸 ${visits.length}`, children: <Timeline visits={visits} places={places} /> },
            { key: 'stats', label: '我的統計', children: <Stats visits={visits} places={places} /> },
          ]}
        />
      )}
    </div>
  )
}
