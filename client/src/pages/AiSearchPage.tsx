import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App, Button, Empty, Input, Segmented, Skeleton, Tag } from 'antd'
import { CloseOutlined, CompassOutlined, ReloadOutlined, SendOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../db/db'
import { placeRepository } from '../db/placeRepository'
import { MEAL_TIMES, PRICE_META, STATUS_META } from '../constants'
import { aiApi } from '../services/aiApi'
import PlaceCard from '../components/PlaceCard'
import RecommendationCard from '../components/RecommendationCard'
import FoodMap, { MARKER_META, markerKindOf, type MapMarker, type MarkerKind } from '../components/FoodMap'
import { PlacePopup, RecommendationPopup } from '../components/MapPopups'
import type { PlaceStatus, Recommendation, RecommendResult, SearchConditions } from '../types'
import { findSaved, matchCollection, recommendationToPlace } from '../utils/aiMatch'
import { buildTasteProfile, toSavedInputs } from '../utils/tasteProfile'
import { distanceKm, formatDistance, getCurrentPosition, type LatLng } from '../utils/geo'
import './AiSearchPage.css'

type Phase = 'idle' | 'parsing' | 'locating' | 'recommending' | 'done' | 'error'

const hasPlace = (c: SearchConditions) => !!(c.city || c.district || c.landmark)

/** 取得定位；失敗時補上「可以改在需求中加地點」的提示 */
async function locate(): Promise<LatLng> {
  try {
    return await getCurrentPosition()
  } catch (e) {
    throw new Error(`${(e as Error).message}也可以在需求中加上地點，例如「高雄左營想吃拉麵」。`)
  }
}

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
  const [result, setResult] = useState<RecommendResult>()
  const [view, setView] = useState<'list' | 'map'>('list')
  const abortRef = useRef<AbortController>(undefined)
  const originRef = useRef<LatLng>(undefined)

  const places = useLiveQuery(() => placeRepository.list(), [])
  const history = useLiveQuery(() => db.searchHistory.orderBy('createdAt').reverse().limit(5).toArray(), [])

  const visits = useLiveQuery(() => db.visits.toArray(), [])
  const profile = useMemo(() => (places ? buildTasteProfile(places, visits) : null), [places, visits])
  const visitsRef = useRef(visits)
  visitsRef.current = visits

  // 收藏區：AI 回來前先用地名與料理比對立即顯示，回來後改用 AI 的挑選與評語
  const collection = useMemo(() => {
    if (!conditions || !places) return []
    if (phase === 'done' && result) {
      const byId = new Map(places.map((p) => [p.id, p]))
      return result.saved.flatMap((pick) => {
        const place = byId.get(pick.placeId)
        return place ? [{ place, hints: [] as string[], reason: pick.reason as string | undefined }] : []
      })
    }
    return matchCollection(places, conditions).map((m) => ({ ...m, reason: undefined as string | undefined }))
  }, [conditions, places, phase, result])

  const preferred = recommendations.filter((r) => r.preferenceReason)
  const discovered = recommendations.filter((r) => !r.preferenceReason)

  // 地圖：AI 推薦 ✨＋搜尋範圍內所有有座標的收藏（Agenda 第 13 節：發現附近以前收藏但還沒去的店）
  const mapMarkers = useMemo<MapMarker[]>(() => {
    const area = result?.area
    if (!area || !places) return []
    const notes = new Map(result.saved.map((p) => [p.placeId, p.reason]))
    const shown = new Set<string>()
    const markers: MapMarker[] = []
    for (const r of recommendations) {
      // 已加入我的美食的推薦改用收藏的標記，例如加入想去後變成 📌
      const saved = findSaved(places, r)
      if (saved) shown.add(saved.id)
      markers.push({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        kind: saved ? markerKindOf(saved.user.statuses) : 'ai',
        title: r.name,
        popup: <RecommendationPopup item={r} saved={saved} onSave={() => save(r, 'wantToGo')} />,
      })
    }
    const maxKm = (area.radiusMeters / 1000) * 1.2
    for (const p of places) {
      if (shown.has(p.id) || p.lat == null || p.lng == null) continue
      // 不推薦的店和收藏區一樣不顯示
      if (p.user.statuses.includes('notRecommended')) continue
      if (distanceKm({ lat: area.lat, lng: area.lng }, { lat: p.lat, lng: p.lng }) > maxKm) continue
      markers.push({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        kind: markerKindOf(p.user.statuses),
        title: p.name,
        popup: <PlacePopup place={p} note={notes.get(p.id)} />,
      })
    }
    return markers
    // save 每次 render 都是新函式，不放進相依避免地圖標記一直重建
  }, [result, places, recommendations])

  const mapCounts = useMemo(() => {
    const c = new Map<MarkerKind, number>()
    for (const m of mapMarkers) c.set(m.kind, (c.get(m.kind) ?? 0) + 1)
    return c
  }, [mapMarkers])
  const showMap = phase === 'done' && view === 'map' && !!result?.area
  const placesRef = useRef(places)
  placesRef.current = places

  const recommend = useCallback(async (query: string, cond: SearchConditions, exclude: string[] = []) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(undefined)
    setResult(undefined)
    const mine = placesRef.current ?? []
    try {
      // 需求沒有地點時，用目前位置當搜尋中心
      let origin: LatLng | undefined
      if (!hasPlace(cond)) {
        setPhase('locating')
        origin = originRef.current ?? (originRef.current = await locate())
        if (ctrl.signal.aborted) return
      }
      setPhase('recommending')
      // 收藏與口味摘要一起送出：後端找出範圍內的收藏，AI 依口味分出「為你推薦」與「新發現」
      const res = await aiApi.recommend(
        query,
        cond,
        exclude,
        origin,
        { profile: buildTasteProfile(mine, visitsRef.current), savedPlaces: toSavedInputs(mine) },
        ctrl.signal,
      )
      setRecommendations(res.recommendations)
      setResult(res)
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

  const renderCard = (r: Recommendation) => (
    <RecommendationCard
      key={r.id}
      item={r}
      saved={places ? findSaved(places, r) : undefined}
      saving={savingName === r.name}
      onSave={(st) => save(r, st)}
    />
  )

  const busy = phase === 'parsing' || phase === 'locating' || phase === 'recommending'
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

      {phase === 'done' && result?.area && (
        <div className="ai-view-switch">
          <Segmented<'list' | 'map'>
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: '列表', icon: <UnorderedListOutlined /> },
              { value: 'map', label: '地圖', icon: <CompassOutlined /> },
            ]}
          />
        </div>
      )}

      {showMap && result?.area && (
        <section className="ai-section" aria-label="地圖">
          <p className="ai-area">
            以「{result.area.label}」為中心 {formatDistance(result.area.radiusMeters / 1000)}內
          </p>
          <div className="ai-map-legend">
            {(['ai', 'favorite', 'wantToGo', 'visited', 'other'] as MarkerKind[])
              .filter((k) => (mapCounts.get(k) ?? 0) > 0)
              .map((k) => (
                <span key={k}>
                  {MARKER_META[k].icon} {k === 'ai' ? 'AI 推薦新店' : MARKER_META[k].label} {mapCounts.get(k)}
                </span>
              ))}
          </div>
          <FoodMap markers={mapMarkers} area={result.area} fitKey={`${result.area.lat},${result.area.lng}`} className="ai-map" />
          <p className="ai-hint">點標記看店家資訊；範圍內你收藏過的店也會一起顯示。</p>
        </section>
      )}

      {!showMap && conditions && collection.length > 0 && (
        <section className="ai-section" aria-labelledby="ai-mine-title">
          <h2 id="ai-mine-title" className="ai-section-title">
            我的收藏符合條件 <span className="ai-count">{collection.length}</span>
          </h2>
          <p className="ai-hint">
            {phase === 'done'
              ? '你之前存過的店，AI 判斷這次也適合，可以優先考慮。'
              : '你之前存過、地區與料理相符的店；AI 正在確認是否適合這次需求…'}
          </p>
          <div className="ai-grid">
            {collection.map((m) => (
              <div key={m.place.id} className="ai-saved">
                {m.reason && <p className="ai-saved-reason">{m.reason}</p>}
                <PlaceCard
                  place={m.place}
                  extra={m.hints.map((h) => (
                    <Tag key={h} color="#386E80">
                      {h}
                    </Tag>
                  ))}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {!showMap && (phase === 'locating' || phase === 'recommending' || phase === 'done' || (phase === 'error' && conditions)) && (
        <section className="ai-section" aria-labelledby="ai-rec-title">
          <div className="ai-section-head">
            <h2 id="ai-rec-title" className="ai-section-title">
              AI 推薦新店 {phase === 'done' && <span className="ai-count">{recommendations.length}</span>}
            </h2>
            {phase === 'done' && conditions && recommendations.length > 0 && (
              <Button icon={<ReloadOutlined />} onClick={() => recommend(q, conditions, recommendations.map((r) => r.name))}>
                換一批
              </Button>
            )}
          </div>
          <p className="ai-hint">
            店家資料來自 OpenStreetMap，評價與推薦餐點由 AI 整理，可能不完整；出發前請先在 Google Maps 確認營業狀況。
          </p>
          {result?.area && (
            <p className="ai-area">
              以「{result.area.label}」為中心 {formatDistance(result.area.radiusMeters / 1000)}內，從地圖資料找到{' '}
              {result.candidateCount} 間相關店家
            </p>
          )}
          {profile && (
            <p className="ai-taste">
              <span className="ai-taste-label">AI 參考了你的口味</span>
              {profile.topCuisines.slice(0, 3).map((c) => (
                <Tag key={c.name} className="ai-taste-tag">
                  {c.name}
                </Tag>
              ))}
              {profile.preferredPriceRanges.length > 0 && (
                <Tag className="ai-taste-tag">
                  常見價位 {profile.preferredPriceRanges.map((p) => PRICE_META[p].label).join('、')}
                </Tag>
              )}
            </p>
          )}
          {phase === 'done' && result?.message && <Alert type="warning" showIcon title={result.message} />}

          {phase === 'locating' && <p className="ai-status">需求中沒有地點，正在取得你的目前位置…</p>}

          {phase === 'recommending' && (
            <>
              <p className="ai-status">正在查詢地圖上的店家，再由 AI 對照你的收藏與口味挑選，大約需要 20～40 秒…</p>
              <div className="ai-grid">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="ai-skeleton">
                    <Skeleton active />
                  </div>
                ))}
              </div>
            </>
          )}

          {phase === 'done' && recommendations.length === 0 && !result?.message && (
            <Empty description="沒有找到符合的新店，試著移除一些條件或換個說法。" />
          )}

          {phase === 'done' && preferred.length > 0 && (
            <div className="ai-subsection">
              <h3 className="ai-subtitle">
                根據你的口味推薦 <span className="ai-count">{preferred.length}</span>
              </h3>
              <p className="ai-hint">和你常收藏、評分高的店相似的新店。</p>
              <div className="ai-grid">{preferred.map(renderCard)}</div>
            </div>
          )}

          {phase === 'done' && discovered.length > 0 && (
            <div className="ai-subsection">
              <h3 className="ai-subtitle">
                AI 網路探索 <span className="ai-count">{discovered.length}</span>
              </h3>
              <p className="ai-hint">符合這次需求、你還沒收藏過的新發現。</p>
              <div className="ai-grid">{discovered.map(renderCard)}</div>
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
          <span className="ai-attribution">
            地圖資料 ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>{' '}
            貢獻者
          </span>
        </p>
      )}
    </div>
  )
}
