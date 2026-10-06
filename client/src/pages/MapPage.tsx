import { useMemo, useRef, useState } from 'react'
import { Alert, App, Button, Empty, Modal, Progress } from 'antd'
import { AimOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { placeRepository } from '../db/placeRepository'
import FoodMap, { MARKER_META, markerKindOf, type MapMarker, type MarkerKind } from '../components/FoodMap'
import { PlacePopup } from '../components/MapPopups'
import { geocodePlace } from '../services/geoApi'
import { getCurrentPosition, type LatLng } from '../utils/geo'
import './MapPage.css'

const LEGEND: MarkerKind[] = ['favorite', 'wantToGo', 'visited', 'other', 'notRecommended']

interface BatchState {
  total: number
  done: number
  found: number
  byName: string[]
  notFound: string[]
  error?: string
  finished: boolean
}

export default function MapPage() {
  const { message } = App.useApp()
  const places = useLiveQuery(() => placeRepository.list(), [])
  const [visible, setVisible] = useState<Set<MarkerKind>>(new Set(['favorite', 'wantToGo', 'visited', 'other']))
  const [userLocation, setUserLocation] = useState<LatLng>()
  const [locating, setLocating] = useState(false)
  const [batch, setBatch] = useState<BatchState>()
  const cancelRef = useRef<AbortController>(undefined)

  const located = useMemo(() => places?.filter((p) => p.lat != null && p.lng != null) ?? [], [places])
  const missing = useMemo(() => places?.filter((p) => p.lat == null || p.lng == null) ?? [], [places])

  const counts = useMemo(() => {
    const c = new Map<MarkerKind, number>()
    for (const p of located) {
      const k = markerKindOf(p.user.statuses)
      c.set(k, (c.get(k) ?? 0) + 1)
    }
    return c
  }, [located])

  const markers: MapMarker[] = useMemo(
    () =>
      located
        .map((p) => ({ place: p, kind: markerKindOf(p.user.statuses) }))
        .filter((x) => visible.has(x.kind))
        .map(({ place, kind }) => ({
          id: place.id,
          lat: place.lat!,
          lng: place.lng!,
          kind,
          title: place.name,
          popup: <PlacePopup place={place} />,
        })),
    [located, visible],
  )

  const toggle = (k: MarkerKind) =>
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const locate = async () => {
    setLocating(true)
    try {
      setUserLocation(await getCurrentPosition())
    } catch (e) {
      message.warning((e as Error).message)
    } finally {
      setLocating(false)
    }
  }

  /** 逐間補座標；後端限制每秒一次查詢，所以不並行 */
  const fillMissing = async () => {
    const targets = missing.filter((p) => p.address || p.name)
    const ctrl = new AbortController()
    cancelRef.current = ctrl
    const state: BatchState = { total: targets.length, done: 0, found: 0, byName: [], notFound: [], finished: false }
    setBatch({ ...state })
    for (const p of targets) {
      if (ctrl.signal.aborted) break
      try {
        const hit = await geocodePlace(
          { name: p.name, address: p.address, city: p.city, district: p.district, country: p.country },
          ctrl.signal,
        )
        if (hit) {
          await placeRepository.setLocation(p.id, hit.lat, hit.lng)
          state.found++
          if (hit.matchedBy === 'name') state.byName.push(p.name)
        } else {
          state.notFound.push(p.name)
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') break
        state.error = (e as Error).message
        break
      }
      state.done++
      setBatch({ ...state })
    }
    state.finished = true
    setBatch({ ...state })
  }

  if (!places) return null

  return (
    <div className="map-page">
      <div className="map-head">
        <div>
          <h1 className="page-title">地圖</h1>
          <p className="page-subtitle">你存過的每一間店都在這裡。</p>
        </div>
        <Button icon={<AimOutlined />} loading={locating} onClick={locate}>
          我的位置
        </Button>
      </div>

      <div className="map-legend" role="group" aria-label="顯示的標記">
        {LEGEND.map((k) => (
          <button
            key={k}
            type="button"
            className={visible.has(k) ? 'map-legend-item map-legend-item--on' : 'map-legend-item'}
            aria-pressed={visible.has(k)}
            onClick={() => toggle(k)}
          >
            {MARKER_META[k].icon} {MARKER_META[k].label} {counts.get(k) ?? 0}
          </button>
        ))}
      </div>

      {missing.length > 0 && (
        <Alert
          className="map-missing"
          type="info"
          showIcon
          icon={<EnvironmentOutlined />}
          title={`有 ${missing.length} 間店還沒有座標，不會出現在地圖上。`}
          action={
            <Button size="small" type="primary" onClick={fillMissing}>
              用地址補上座標
            </Button>
          }
        />
      )}

      {places.length === 0 ? (
        <Empty description="還沒有任何店家。先到「我的美食」新增，或用 AI 找美食加入幾間吧。">
          <Link to="/ai">
            <Button type="primary">AI 找美食</Button>
          </Link>
        </Empty>
      ) : (
        <FoodMap markers={markers} userLocation={userLocation} fitKey={String(located.length)} className="map-page-map" />
      )}

      <Modal
        title="用地址補上座標"
        open={!!batch}
        closable={batch?.finished}
        mask={{ closable: false }}
        onCancel={() => setBatch(undefined)}
        footer={
          batch?.finished ? (
            <Button type="primary" onClick={() => setBatch(undefined)}>
              完成
            </Button>
          ) : (
            <Button onClick={() => cancelRef.current?.abort()}>停止</Button>
          )
        }
      >
        {batch && (
          <div className="map-batch">
            <Progress percent={batch.total === 0 ? 100 : Math.round((batch.done / batch.total) * 100)} />
            <p>
              已處理 {batch.done} / {batch.total} 間，找到 {batch.found} 間。
              {!batch.finished && '地圖服務限制每秒查詢一次，請稍候。'}
            </p>
            {batch.error && <Alert type="error" showIcon title={batch.error} />}
            {batch.finished && batch.byName.length > 0 && (
              <p className="map-batch-note">
                這幾間是用店名找到的，位置可能不準，建議到詳細頁確認：{batch.byName.join('、')}
              </p>
            )}
            {batch.finished && batch.notFound.length > 0 && (
              <p className="map-batch-note">
                找不到：{batch.notFound.join('、')}。可以在編輯頁補上地址，或貼上 Google Maps 網址。
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
