import { useMemo, useState } from 'react'
import { Alert, App, Button, Empty, Segmented, Skeleton } from 'antd'
import { AimOutlined, ReloadOutlined, StarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { placeRepository } from '../db/placeRepository'
import { useDismissed } from '../hooks/useDismissed'
import { aiApi } from '../services/aiApi'
import { STATUS_META } from '../constants'
import type { PlaceStatus, Recommendation, RecommendResult } from '../types'
import { findSaved, recommendationToPlace } from '../utils/aiMatch'
import { getCurrentPosition } from '../utils/geo'
import { buildTasteProfile, toSavedInputs } from '../utils/tasteProfile'
import RecommendationCard from './RecommendationCard'
import './ForYouSection.css'

const STORAGE_KEY = 'foodbuddy.forYou'
const HERE = '__here__'

interface SavedForYou {
  area: string
  result: RecommendResult
  at: number
}

function load(): SavedForYou | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedForYou) : undefined
  } catch {
    return undefined
  }
}

function store(value: SavedForYou) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // 存不了就只在這次畫面顯示
  }
}

/** 「高雄市左營區」→ 城市與行政區 */
function splitArea(area: string): { city: string | null; district: string | null } {
  const m = area.match(/^(.+?[市縣])(.*)$/)
  return m ? { city: m[1], district: m[2] || null } : { city: null, district: area }
}

/** 首頁「為你推薦」：依口味推薦還沒去過的店，並提醒附近收藏還沒去的店（Agenda 第 18 節自動推薦） */
export default function ForYouSection() {
  const { message } = App.useApp()
  const places = useLiveQuery(() => placeRepository.list(), [])
  const visits = useLiveQuery(() => db.visits.toArray(), [])
  const dismissed = useDismissed()
  const profile = useMemo(() => (places && visits ? buildTasteProfile(places, visits) : null), [places, visits])
  // 與後端相同：只用有份量的料理（權重 ≥ 2），至少保留第一名
  const mainCuisines = useMemo(() => {
    if (!profile) return []
    const strong = profile.topCuisines.filter((c) => c.count >= 2).slice(0, 3)
    return (strong.length > 0 ? strong : profile.topCuisines.slice(0, 1)).map((c) => c.name)
  }, [profile])

  const [saved, setSaved] = useState<SavedForYou | undefined>(load)
  const areas = profile?.topDistricts ?? []
  const [area, setArea] = useState<string>(saved?.area ?? '')
  const currentArea = area || areas[0] || HERE
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [savingName, setSavingName] = useState<string>()

  const recommend = async () => {
    if (!places || !profile) return
    setLoading(true)
    setError(undefined)
    try {
      const origin = currentArea === HERE ? await getCurrentPosition() : null
      const { city, district } = currentArea === HERE ? { city: null, district: null } : splitArea(currentArea)
      const result = await aiApi.forYou({
        city,
        district,
        origin,
        profile,
        savedPlaces: toSavedInputs(places),
        excludeNames: [],
        excludeIds: dismissed.ids,
      })
      const value = { area: currentArea, result, at: Date.now() }
      store(value)
      setSaved(value)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const save = async (r: Recommendation, status: PlaceStatus) => {
    setSavingName(r.name)
    try {
      await placeRepository.create(recommendationToPlace(r, '為你推薦'), { statuses: [status] })
      message.success(`已將「${r.name}」加入${STATUS_META[status].label}`)
    } finally {
      setSavingName(undefined)
    }
  }

  if (!places || !visits) return null

  const recs = saved?.result.recommendations.filter((r) => !dismissed.isDismissed(r.id)) ?? []
  const byId = new Map(places.map((p) => [p.id, p]))
  const unvisited = (saved?.result.saved ?? []).flatMap((s) => {
    const p = byId.get(s.placeId)
    return p && !p.user.statuses.includes('visited') ? [{ place: p, reason: s.reason }] : []
  })

  return (
    <section className="for-you" aria-labelledby="for-you-title">
      <div className="for-you-head">
        <div>
          <h2 id="for-you-title" className="for-you-title">
            為你推薦
          </h2>
          <p className="for-you-sub">
            {profile
              ? `依你的口味（${mainCuisines.join('、')}），找你可能會喜歡、還沒去過的店。`
              : '收藏至少 3 間喜歡的店之後，就能依你的口味推薦。'}
          </p>
        </div>
      </div>

      {!profile ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先用 AI 找美食找幾間喜歡的店、加入收藏或想去吧。">
          <Link to="/ai">
            <Button type="primary">AI 找美食</Button>
          </Link>
        </Empty>
      ) : (
        <>
          <div className="for-you-controls">
            <Segmented<string>
              value={currentArea}
              onChange={setArea}
              options={[
                ...areas.map((a) => ({ value: a, label: a })),
                { value: HERE, label: '目前位置', icon: <AimOutlined /> },
              ]}
            />
            <Button
              type={saved ? 'default' : 'primary'}
              icon={saved ? <ReloadOutlined /> : <StarOutlined />}
              loading={loading}
              onClick={recommend}
            >
              {saved ? '更新推薦' : '幫我推薦'}
            </Button>
          </div>

          {error && <Alert type="error" showIcon title={error} />}

          {loading && (
            <>
              <p className="for-you-status">正在查詢地圖上的店家，再由 AI 依你的口味挑選，大約需要 20～40 秒…</p>
              <Skeleton active />
            </>
          )}

          {!loading && saved && (
            <>
              <p className="for-you-meta">
                {saved.area === HERE ? '目前位置' : saved.area}附近 ・ {dayjs(saved.at).format('M/D HH:mm')} 推薦
                {saved.result.mock && '（示範資料）'}
              </p>

              {unvisited.length > 0 && (
                <div className="for-you-unvisited">
                  <span className="for-you-unvisited-label">附近你收藏還沒去的店</span>
                  {unvisited.map(({ place, reason }) => (
                    <Link key={place.id} to={`/my/${place.id}`} className="for-you-unvisited-item" title={reason}>
                      {place.name}
                    </Link>
                  ))}
                </div>
              )}

              {saved.result.message && <Alert type="warning" showIcon title={saved.result.message} />}

              {recs.length > 0 ? (
                <div className="for-you-grid">
                  {recs.map((r) => (
                    <RecommendationCard
                      key={r.id}
                      item={r}
                      saved={findSaved(places, r)}
                      saving={savingName === r.name}
                      onSave={(st) => save(r, st)}
                      onDismiss={() => dismissed.dismiss(r)}
                    />
                  ))}
                </div>
              ) : (
                !saved.result.message && <Empty description="這批推薦你都看過了，按「更新推薦」再找一批。" />
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
