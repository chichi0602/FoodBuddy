import { useMemo } from 'react'
import { Alert, InputNumber, Segmented, Select, Switch, Tag } from 'antd'
import { CUISINES, MEAL_TIMES, PRICE_META, PRICE_ORDER, STATUS_META, STATUS_ORDER } from '../constants'
import type { MealTime, PlaceWithUser } from '../types'
import type { PlaceFilter } from '../utils/filterPlaces'
import './FilterPanel.css'

export const RADIUS_OPTIONS = [1, 3, 5, 10]

interface Props {
  places: PlaceWithUser[]
  tags: string[]
  value: PlaceFilter
  onChange: (next: PlaceFilter) => void
  locating: boolean
  locationError?: string
}

const uniq = (values: (string | undefined)[]) =>
  [...new Set(values.filter((v): v is string => !!v?.trim()))].sort((a, b) => a.localeCompare(b, 'zh-Hant'))

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

export default function FilterPanel({ places, tags, value: f, onChange, locating, locationError }: Props) {
  const set = (patch: Partial<PlaceFilter>) => onChange({ ...f, ...patch })

  const options = useMemo(() => {
    const inCountry = f.countries.length ? places.filter((p) => p.country && f.countries.includes(p.country)) : places
    const inCity = f.cities.length ? inCountry.filter((p) => p.city && f.cities.includes(p.city)) : inCountry
    return {
      countries: uniq(places.map((p) => p.country)),
      cities: uniq(inCountry.map((p) => p.city)),
      districts: uniq(inCity.map((p) => p.district)),
      // 預設料理在前，使用者自訂的料理接在後面
      cuisines: [...CUISINES, ...uniq(places.flatMap((p) => p.cuisines)).filter((c) => !CUISINES.includes(c))],
    }
  }, [places, f.countries, f.cities])

  const toSelectOptions = (list: string[]) => list.map((v) => ({ value: v, label: v }))

  return (
    <div className="filter-panel">
      <section className="filter-row">
        <h3 className="filter-label">地區</h3>
        <div className="filter-geo">
          <Select
            mode="multiple"
            allowClear
            placeholder="國家"
            value={f.countries}
            onChange={(countries) => set({ countries })}
            options={toSelectOptions(options.countries)}
            aria-label="國家"
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="城市"
            value={f.cities}
            onChange={(cities) => set({ cities })}
            options={toSelectOptions(options.cities)}
            aria-label="城市"
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="行政區"
            value={f.districts}
            onChange={(districts) => set({ districts })}
            options={toSelectOptions(options.districts)}
            aria-label="行政區"
          />
        </div>
      </section>

      <section className="filter-row">
        <h3 className="filter-label">附近</h3>
        <div className="filter-chips">
          <Switch
            checked={f.radiusKm != null}
            loading={locating}
            onChange={(on) => set({ radiusKm: on ? 3 : undefined })}
            aria-label="只顯示附近的店"
          />
          {f.radiusKm != null && (
            <Segmented<number>
              size="small"
              value={f.radiusKm}
              onChange={(radiusKm) => set({ radiusKm })}
              options={RADIUS_OPTIONS.map((km) => ({ value: km, label: `${km} 公里` }))}
            />
          )}
          {f.radiusKm == null && <span className="filter-hint">開啟後只顯示有經緯度、且在範圍內的店</span>}
        </div>
        {locationError && f.radiusKm != null && (
          <Alert className="filter-alert" type="warning" showIcon title={locationError} />
        )}
      </section>

      <section className="filter-row">
        <h3 className="filter-label">料理</h3>
        <div className="filter-chips">
          {options.cuisines.map((c) => (
            <Tag.CheckableTag key={c} checked={f.cuisines.includes(c)} onChange={() => set({ cuisines: toggle(f.cuisines, c) })}>
              {c}
            </Tag.CheckableTag>
          ))}
        </div>
      </section>

      <section className="filter-row">
        <h3 className="filter-label">用餐情境</h3>
        <div className="filter-chips">
          {(Object.keys(MEAL_TIMES) as MealTime[]).map((m) => (
            <Tag.CheckableTag
              key={m}
              checked={f.mealTimes.includes(m)}
              onChange={() => set({ mealTimes: toggle(f.mealTimes, m) })}
            >
              {MEAL_TIMES[m]}
            </Tag.CheckableTag>
          ))}
        </div>
      </section>

      <section className="filter-row">
        <h3 className="filter-label">價格</h3>
        <div className="filter-chips">
          {PRICE_ORDER.map((p) => (
            <Tag.CheckableTag
              key={p}
              checked={f.priceRanges.includes(p)}
              onChange={() => set({ priceRanges: toggle(f.priceRanges, p) })}
            >
              {PRICE_META[p].label}
            </Tag.CheckableTag>
          ))}
          <InputNumber
            size="small"
            min={0}
            step={100}
            placeholder="自訂預算"
            prefix="$"
            suffix="/ 人"
            value={f.budget}
            onChange={(v) => set({ budget: v ?? undefined })}
            className="filter-budget"
            aria-label="自訂每人預算"
          />
        </div>
      </section>

      <section className="filter-row">
        <h3 className="filter-label">我的狀態</h3>
        <div className="filter-chips">
          {STATUS_ORDER.map((s) => (
            <Tag.CheckableTag key={s} checked={f.statuses.includes(s)} onChange={() => set({ statuses: toggle(f.statuses, s) })}>
              {STATUS_META[s].icon} {STATUS_META[s].label}
            </Tag.CheckableTag>
          ))}
          <Tag.CheckableTag checked={f.notVisited} onChange={(notVisited) => set({ notVisited })}>
            未去過
          </Tag.CheckableTag>
        </div>
      </section>

      {tags.length > 0 && (
        <section className="filter-row">
          <h3 className="filter-label">Tag</h3>
          <div className="filter-chips">
            {tags.map((t) => (
              <Tag.CheckableTag key={t} checked={f.tags.includes(t)} onChange={() => set({ tags: toggle(f.tags, t) })}>
                #{t}
              </Tag.CheckableTag>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
