import { useMemo, useState } from 'react'
import { Button, Empty, Input, Segmented, Spin } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router-dom'
import { placeRepository } from '../db/placeRepository'
import { STATUS_META, STATUS_ORDER } from '../constants'
import PlaceCard from '../components/PlaceCard'
import type { PlaceStatus } from '../types'
import './MyFoodPage.css'

type Tab = 'all' | PlaceStatus

export default function MyFoodPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('status') as Tab | null) ?? 'all'
  const [keyword, setKeyword] = useState('')
  const places = useLiveQuery(() => placeRepository.list(), [])

  const filtered = useMemo(() => {
    if (!places) return []
    const kw = keyword.trim().toLowerCase()
    return places.filter((p) => {
      if (tab !== 'all' && !p.user.statuses.includes(tab)) return false
      if (!kw) return true
      return [p.name, p.address, p.city, p.district, ...p.cuisines, ...p.tags, ...p.recommendedDishes]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(kw))
    })
  }, [places, tab, keyword])

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

      <div className="myfood-toolbar">
        <Segmented<Tab>
          value={tab}
          onChange={(v) => setParams(v === 'all' ? {} : { status: v })}
          options={[
            { value: 'all', label: `全部 ${places?.length ?? 0}` },
            ...STATUS_ORDER.map((s) => ({
              value: s,
              label: `${STATUS_META[s].label} ${places?.filter((p) => p.user.statuses.includes(s)).length ?? 0}`,
            })),
          ]}
        />
        <Input.Search
          allowClear
          placeholder="搜尋店名、地區、料理、Tag"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="myfood-search"
        />
      </div>

      {!places ? (
        <Spin />
      ) : filtered.length === 0 ? (
        <Empty
          description={places.length === 0 ? '還沒有任何店家，先新增第一間吧。' : '沒有符合條件的店家，換個條件試試。'}
        >
          {places.length === 0 && (
            <Link to="/my/new">
              <Button type="primary" icon={<PlusOutlined />}>
                新增店家
              </Button>
            </Link>
          )}
        </Empty>
      ) : (
        <div className="myfood-grid">
          {filtered.map((p) => (
            <PlaceCard key={p.id} place={p} />
          ))}
        </div>
      )}
    </div>
  )
}
