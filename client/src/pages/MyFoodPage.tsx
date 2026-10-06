import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Drawer, Empty, Grid, Input, Segmented, Select, Spin, Tag } from 'antd'
import { FilterOutlined, PlusOutlined } from '@ant-design/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../db/db'
import { placeRepository } from '../db/placeRepository'
import { MEAL_TIMES, PRICE_META, STATUS_META, STATUS_ORDER } from '../constants'
import PlaceCard from '../components/PlaceCard'
import FilterPanel from '../components/FilterPanel'
import type { PlaceStatus } from '../types'
import {
  EMPTY_FILTER,
  SORT_OPTIONS,
  countActive,
  filterFromParams,
  filterPlaces,
  filterToParams,
  sortPlaces,
  type PlaceFilter,
  type SortKey,
} from '../utils/filterPlaces'
import { getCurrentPosition, type LatLng } from '../utils/geo'
import './MyFoodPage.css'

type Tab = 'all' | PlaceStatus

interface ActiveChip {
  key: string
  label: string
  remove: (f: PlaceFilter) => PlaceFilter
}

/** 已套用條件的摘要，每一項都可以單獨移除 */
function activeChips(f: PlaceFilter): ActiveChip[] {
  const without = <K extends keyof PlaceFilter>(key: K, item: unknown) => (x: PlaceFilter) => ({
    ...x,
    [key]: (x[key] as unknown[]).filter((v) => v !== item),
  })
  return [
    ...f.countries.map((v) => ({ key: `country-${v}`, label: v, remove: without('countries', v) })),
    ...f.cities.map((v) => ({ key: `city-${v}`, label: v, remove: without('cities', v) })),
    ...f.districts.map((v) => ({ key: `district-${v}`, label: v, remove: without('districts', v) })),
    ...(f.radiusKm != null
      ? [{ key: 'km', label: `${f.radiusKm} 公里內`, remove: (x: PlaceFilter) => ({ ...x, radiusKm: undefined }) }]
      : []),
    ...f.cuisines.map((v) => ({ key: `cuisine-${v}`, label: v, remove: without('cuisines', v) })),
    ...f.mealTimes.map((v) => ({ key: `meal-${v}`, label: MEAL_TIMES[v], remove: without('mealTimes', v) })),
    ...f.priceRanges.map((v) => ({ key: `price-${v}`, label: PRICE_META[v].label, remove: without('priceRanges', v) })),
    ...(f.budget != null
      ? [{ key: 'budget', label: `預算 $${f.budget}/人`, remove: (x: PlaceFilter) => ({ ...x, budget: undefined }) }]
      : []),
    ...f.statuses.map((v) => ({ key: `status-${v}`, label: STATUS_META[v].label, remove: without('statuses', v) })),
    ...(f.notVisited ? [{ key: 'notVisited', label: '未去過', remove: (x: PlaceFilter) => ({ ...x, notVisited: false }) }] : []),
    ...f.tags.map((v) => ({ key: `tag-${v}`, label: `#${v}`, remove: without('tags', v) })),
  ]
}

export default function MyFoodPage() {
  const isDesktop = !!Grid.useBreakpoint().md
  const [params, setParams] = useSearchParams()
  const { filter, sort } = useMemo(() => filterFromParams(params), [params])
  const [panelOpen, setPanelOpen] = useState(false)
  const [origin, setOrigin] = useState<LatLng>()
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string>()

  const places = useLiveQuery(() => placeRepository.list(), [])
  const tags = useLiveQuery(async () => (await db.tags.toArray()).map((t) => t.name), [])

  const update = (next: PlaceFilter, nextSort: SortKey = sort) => setParams(filterToParams(next, nextSort), { replace: true })

  // 開啟「附近」時才要求定位
  const wantsLocation = filter.radiusKm != null || sort === 'distance'
  useEffect(() => {
    // 關閉後清掉錯誤，下次開啟時才會重新嘗試定位
    if (!wantsLocation) {
      setLocationError(undefined)
      return
    }
    if (origin || locating || locationError) return
    setLocating(true)
    getCurrentPosition()
      .then(setOrigin)
      .catch((e: Error) => setLocationError(e.message))
      .finally(() => setLocating(false))
  }, [wantsLocation, origin, locating, locationError])

  const results = useMemo(() => {
    if (!places) return []
    // 還沒拿到位置前不套用距離條件，避免列表瞬間變空
    const effective = origin ? filter : { ...filter, radiusKm: undefined }
    return sortPlaces(filterPlaces(places, effective, origin), sort === 'distance' && !origin ? 'updated' : sort)
  }, [places, filter, sort, origin])

  const chips = activeChips(filter)
  const activeCount = countActive(filter)
  const tab: Tab | undefined =
    filter.notVisited || filter.statuses.length > 1 ? undefined : (filter.statuses[0] ?? 'all')
  const countBy = (s: PlaceStatus) => places?.filter((p) => p.user.statuses.includes(s)).length ?? 0

  const panel = (
    <FilterPanel
      places={places ?? []}
      tags={tags ?? []}
      value={filter}
      onChange={(f) => update(f)}
      locating={locating}
      locationError={locationError}
    />
  )

  return (
    <div>
      <div className="myfood-head">
        <div>
          <h1 className="page-title">我的美食</h1>
          <p className="page-subtitle">你收藏、想去和去過的每一間店。</p>
        </div>
        <Link to="/my/new">
          <Button type="primary" icon={<PlusOutlined />}>
            新增店家
          </Button>
        </Link>
      </div>

      <div className="myfood-tabs">
        <Segmented<Tab>
          value={tab as Tab}
          onChange={(v) => update({ ...filter, statuses: v === 'all' ? [] : [v], notVisited: false })}
          options={[
            { value: 'all', label: `全部 ${places?.length ?? 0}` },
            ...STATUS_ORDER.map((s) => ({ value: s, label: `${STATUS_META[s].label} ${countBy(s)}` })),
          ]}
        />
      </div>

      <div className="myfood-toolbar">
        <Input.Search
          allowClear
          placeholder="搜尋店名、地區、料理、Tag、備註"
          value={filter.keyword}
          onChange={(e) => update({ ...filter, keyword: e.target.value })}
          className="myfood-search"
        />
        <Badge count={activeCount} color="#386E80" size="small">
          <Button
            icon={<FilterOutlined />}
            type={panelOpen && isDesktop ? 'primary' : 'default'}
            onClick={() => setPanelOpen(!panelOpen)}
            aria-expanded={panelOpen}
          >
            篩選
          </Button>
        </Badge>
        <Select<SortKey>
          value={sort}
          onChange={(s) => update(filter, s)}
          options={SORT_OPTIONS}
          className="myfood-sort"
          aria-label="排序方式"
        />
      </div>

      {isDesktop && panelOpen && <div className="myfood-panel">{panel}</div>}

      {!isDesktop && (
        <Drawer
          title="篩選"
          placement="bottom"
          size="85vh"
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          footer={
            <div className="myfood-drawer-foot">
              <Button onClick={() => update({ ...EMPTY_FILTER, keyword: filter.keyword })} disabled={activeCount === 0}>
                清除條件
              </Button>
              <Button type="primary" onClick={() => setPanelOpen(false)}>
                顯示 {results.length} 間
              </Button>
            </div>
          }
        >
          {panel}
        </Drawer>
      )}

      {places && (
        <div className="myfood-summary">
          <span className="myfood-count">共 {results.length} 間</span>
          {chips.map((c) => (
            <Tag key={c.key} closable onClose={() => update(c.remove(filter))} className="myfood-chip">
              {c.label}
            </Tag>
          ))}
          {chips.length > 0 && (
            <Button type="link" size="small" onClick={() => update({ ...EMPTY_FILTER, keyword: filter.keyword })}>
              清除全部條件
            </Button>
          )}
        </div>
      )}

      {!places ? (
        <Spin />
      ) : results.length === 0 ? (
        <Empty
          description={places.length === 0 ? '還沒有任何店家，先新增第一間吧。' : '沒有符合條件的店家，試著放寬篩選條件。'}
        >
          {places.length === 0 ? (
            <Link to="/my/new">
              <Button type="primary" icon={<PlusOutlined />}>
                新增店家
              </Button>
            </Link>
          ) : (
            <Button onClick={() => update(EMPTY_FILTER)}>清除所有條件</Button>
          )}
        </Empty>
      ) : (
        <div className="myfood-grid">
          {results.map((p) => (
            <PlaceCard key={p.id} place={p} distanceKm={p.distanceKm} />
          ))}
        </div>
      )}
    </div>
  )
}
