import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App, Button, Empty, Input, Skeleton, Tag } from 'antd'
import { CloseOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../db/db'
import { placeRepository } from '../db/placeRepository'
import { MEAL_TIMES, STATUS_META } from '../constants'
import { aiApi } from '../services/aiApi'
import PlaceCard from '../components/PlaceCard'
import RecommendationCard from '../components/RecommendationCard'
import type { PlaceStatus, Recommendation, SearchConditions } from '../types'
import { findSaved, matchCollection, recommendationToPlace } from '../utils/aiMatch'
import './AiSearchPage.css'

type Phase = 'idle' | 'parsing' | 'recommending' | 'done' | 'error'

interface ConditionChip {
  key: string
  label: string
  remove: (c: SearchConditions) => SearchConditions
}

/** 解析條件轉成可單獨移除的標籤 */
function conditionChips(c: SearchConditions): ConditionChip[] {
  const chips: ConditionChip[] = []
  const area = [c.city, c.district].filter(Boolean).join(' ')
  if (area) chips.push({ key: 'area', label: `📍 ${area}`, remove: (x) => ({ ...x, country: null, city: null, district: null }) })
  if (c.landmark) chips.push({ key: 'landmark', label: `🏷 ${c.landmark} 附近`, remove: (x) => ({ ...x, landmark: null }) })
  c.cuisines.forEach((v) =>
    chips.push({ key: `cuisine-${v}`, label: `🍽 ${v}`, remove: (x) => ({ ...x, cuisines: x.cuisines.filter((y) => y !== v) }) }),
  )
  if (c.mealTime) chips.push({ key: 'meal', label: `🕒 ${MEAL_TIMES[c.mealTime]}`, remove: (x) => ({ ...x, mealTime: null }) })
  if (c.people) chips.push({ key: 'people', label: `👥 ${c.people} 人`, remove: (x) => ({ ...x, people: null }) })
  if (c.budgetPerPerson)
    chips.push({ key: 'budget', label: `💰 約 $${c.budgetPerPerson} / 人`, remove: (x) => ({ ...x, budgetPerPerson: null }) })
  c.keywords.forEach((v) =>
    chips.push({ key: `kw-${v}`, label: `# ${v}`, remove: (x) => ({ ...x, keywords: x.keywords.filter((y) => y !== v) }) }),
  )
  return chips
}

async function saveHistory(query: string) {
  await db.transaction('rw', db.searchHistory, async () => {
    await db.searchHistory.filter((h) => h.query === query).delete()
    await db.searchHistory.add({ id: crypto.randomUUID(), query, createdAt: Date.now() })
  })
}

export default function AiSearchPage() {
  const { message } = App.useApp()
  const [params, setParams] = useSearchParams()
  const q = params.get('q')?.trim() ?? ''
  const [input, setInput] = useState(q)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string>()
  const [conditions, setConditions] = useState<SearchConditions>()
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [mock, setMock] = useState(false)
  const [savingName, setSavingName] = useState<string>()
  const abortRef = useRef<AbortController>(undefined)

  const places = useLiveQuery(() => placeRepository.list(), [])
  const history = useLiveQuery(() => db.searchHistory.orderBy('createdAt').reverse().limit(5).toArray(), [])

  const collection = useMemo(
    () => (conditions && places ? matchCollection(places, conditions) : []),
    [conditions, places],
  )
  const placesRef = useRef(places)
  placesRef.current = places

  const recommend = useCallback(async (query: string, cond: SearchConditions, exclude: string[] = []) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPhase('recommending')
    setError(undefined)
    // 排除收藏中已符合條件的店，讓 AI 專心找新店
    const inCollection = matchCollection(placesRef.current ?? [], cond).map((m) => m.place.name)
    try {
      const res = await aiApi.recommend(query, cond, [...inCollection, ...exclude], ctrl.signal)
      setRecommendations(res.recommendations)
      setMock(res.mock)
      setPhase('done')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message)
      setPhase('error')
    }
  }, [])

  const search = useCallback(
    async (query: string) => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setPhase('parsing')
      setError(undefined)
      setConditions(undefined)
      setRecommendations([])
      try {
        const res = await aiApi.parse(query, ctrl.signal)
        // 解析期間使用者已送出新的搜尋，就不要覆蓋新的結果
        if (ctrl.signal.aborted) return
        setConditions(res.conditions)
        setMock(res.mock)
        void saveHistory(query)
        await recommend(query, res.conditions)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setError((e as Error).message)
        setPhase('error')
      }
    },
    [recommend],
  )

  useEffect(() => {
    setInput(q)
    if (q) void search(q)
    else setPhase('idle')
    return () => abortRef.current?.abort()
  }, [q, search])

  const submit = (text: string) => {
    const t = text.trim()
    if (!t) return
    if (t === q) void search(t)
    else setParams({ q: t })
  }

  const updateConditions = (next: SearchConditions) => {
    setConditions(next)
    void recommend(q, next)
  }

  const save = async (r: Recommendation, status: PlaceStatus) => {
    setSavingName(r.name)
    try {
      await placeRepository.create(recommendationToPlace(r, q, conditions?.country), { statuses: [status] })
      message.success(`已將「${r.name}」加入${STATUS_META[status].label}`)
    } finally {
      setSavingName(undefined)
    }
  }

  const busy = phase === 'parsing' || phase === 'recommending'
  const chips = conditions ? conditionChips(conditions) : []

  return (
    <div className="ai">
      <section className="ai-search" aria-labelledby="ai-title">
        <h1 id="ai-title" className="ai-title">AI 找美食</h1>
        <form
          className="ai-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
        >
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                submit(input)
              }
            }}
            autoSize={{ minRows: 1, maxRows: 4 }}
            maxLength={500}
            placeholder="例如：台南中西區晚上想吃牛肉湯"
            aria-label="描述你想吃的"
            className="ai-input"
          />
          <Button type="primary" htmlType="submit" size="large" icon={<SendOutlined />} loading={busy} className="ai-submit">
            找美食
          </Button>
        </form>
        {!q && history && history.length > 0 && (
          <div className="ai-history">
            <span className="ai-history-label">最近搜尋</span>
            {history.map((h) => (
              <button key={h.id} type="button" className="ai-history-item" onClick={() => submit(h.query)}>
                {h.query}
              </button>
            ))}
          </div>
        )}
      </section>

      {!q && (
        <Empty
          className="ai-empty"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="說說看地點、人數、預算和想吃的料理，AI 會幫你找店，也會一起翻翻你的收藏。"
        />
      )}

      {mock && phase !== 'parsing' && (
        <Alert
          type="info"
          showIcon
          title="目前顯示的是示範資料"
          description="後端還沒有設定 Azure OpenAI 金鑰，設定後就會出現真實的 AI 推薦。"
        />
      )}

      {phase === 'parsing' && (
        <section className="ai-section">
          <p className="ai-status">AI 正在理解你的需求…</p>
          <Skeleton active paragraph={{ rows: 1 }} title={false} />
        </section>
      )}

      {conditions && (
        <section className="ai-section" aria-labelledby="ai-cond-title">
          <h2 id="ai-cond-title" className="ai-section-title">
            AI 理解的需求
          </h2>
          <p className="ai-summary">{conditions.summary}</p>
          <div className="ai-chips">
            {chips.map((c) => (
              <Tag
                key={c.key}
                className="ai-chip"
                closable={!busy}
                closeIcon={<CloseOutlined aria-label={`移除 ${c.label}`} />}
                onClose={(e) => {
                  e.preventDefault()
                  updateConditions(c.remove(conditions))
                }}
              >
                {c.label}
              </Tag>
            ))}
            {chips.length === 0 && <span className="ai-hint">沒有解析出具體條件，AI 會依整句描述推薦。</span>}
          </div>
        </section>
      )}

      {conditions && collection.length > 0 && (
        <section className="ai-section" aria-labelledby="ai-mine-title">
          <h2 id="ai-mine-title" className="ai-section-title">
            我的收藏符合條件 <span className="ai-count">{collection.length}</span>
          </h2>
          <p className="ai-hint">你之前存過的店，這次也符合需求，可以優先考慮。</p>
          <div className="ai-grid">
            {collection.map((m) => (
              <PlaceCard
                key={m.place.id}
                place={m.place}
                extra={m.hints.map((h) => (
                  <Tag key={h} color="#386E80">
                    {h}
                  </Tag>
                ))}
              />
            ))}
          </div>
        </section>
      )}

      {(phase === 'recommending' || phase === 'done' || (phase === 'error' && conditions)) && (
        <section className="ai-section" aria-labelledby="ai-rec-title">
          <div className="ai-section-head">
            <h2 id="ai-rec-title" className="ai-section-title">
              AI 推薦 {phase === 'done' && <span className="ai-count">{recommendations.length}</span>}
            </h2>
            {phase === 'done' && conditions && recommendations.length > 0 && (
              <Button
                icon={<ReloadOutlined />}
                onClick={() => recommend(q, conditions, recommendations.map((r) => r.name))}
              >
                換一批
              </Button>
            )}
          </div>
          <p className="ai-hint">由 AI 依既有知識推薦，店家資訊可能過時或有誤，出發前請先在 Google Maps 確認。</p>

          {phase === 'recommending' && (
            <>
              <p className="ai-status">AI 正在挑選店家並整理分析，大約需要 15～30 秒…</p>
              <div className="ai-grid">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="ai-skeleton">
                    <Skeleton active />
                  </div>
                ))}
              </div>
            </>
          )}

          {phase === 'done' && recommendations.length === 0 && (
            <Empty description="AI 沒有找到符合的店，試著移除一些條件或換個說法。" />
          )}

          {phase === 'done' && recommendations.length > 0 && (
            <div className="ai-grid">
              {recommendations.map((r) => (
                <RecommendationCard
                  key={r.name}
                  item={r}
                  saved={places ? findSaved(places, r.name) : undefined}
                  saving={savingName === r.name}
                  onSave={(s) => save(r, s)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {phase === 'error' && (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button size="small" onClick={() => (conditions ? recommend(q, conditions) : search(q))}>
              再試一次
            </Button>
          }
        />
      )}

      {phase === 'done' && (
        <p className="ai-footnote">
          想手動記下一間店？<Link to="/my/new">新增店家</Link>
        </p>
      )}
    </div>
  )
}
