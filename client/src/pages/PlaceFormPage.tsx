import { useEffect, useState } from 'react'
import { App, Button, Card, Checkbox, Col, Form, Input, InputNumber, Rate, Row, Select, Space, Spin, Upload } from 'antd'
import { AimOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { placeRepository, type PlaceInput } from '../db/placeRepository'
import { CUISINES, MEAL_TIMES, PLACE_TYPES, PRICE_META, PRICE_ORDER, STATUS_META, STATUS_ORDER } from '../constants'
import type { MealTime, PlaceStatus, PriceRange } from '../types'
import { compressImage } from '../utils/image'
import { parseLatLngFromMapsUrl } from '../utils/geo'
import { geocodePlace } from '../services/geoApi'
import './PlaceFormPage.css'

interface FormValues {
  name: string
  address?: string
  country?: string
  city?: string
  district?: string
  googleMapsUrl?: string
  lat?: number
  lng?: number
  cuisines: string[]
  mealTimes: MealTime[]
  placeType?: string
  priceRange?: PriceRange
  openingHours?: string
  phone?: string
  recommendedDishes: string[]
  links: string[]
  tags: string[]
  statuses: PlaceStatus[]
  rating?: number
  note?: string
}

const DEFAULTS: Partial<FormValues> = {
  country: '台灣',
  cuisines: [],
  mealTimes: [],
  recommendedDishes: [],
  links: [],
  tags: [],
  statuses: ['wantToGo'],
}

export default function PlaceFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const knownTags = useLiveQuery(() => db.tags.toArray(), [])

  useEffect(() => {
    if (!id) return
    placeRepository.get(id).then((p) => {
      if (!p) {
        message.error('找不到這間店')
        navigate('/my', { replace: true })
        return
      }
      form.setFieldsValue({ ...p, statuses: p.user.statuses, rating: p.user.rating, note: p.user.note })
      setImages(p.images)
      setLoading(false)
    })
  }, [id, form, message, navigate])

  const [geocoding, setGeocoding] = useState(false)
  const findLocation = async () => {
    const v = form.getFieldsValue(['name', 'address', 'city', 'district', 'country']) as Partial<FormValues>
    if (!v.address?.trim() && !(v.name?.trim() && (v.city || v.district))) {
      message.info('請先填地址，或填店名＋城市／地區。')
      return
    }
    setGeocoding(true)
    try {
      const hit = await geocodePlace({
        name: v.name?.trim() ?? '',
        address: v.address,
        city: v.city,
        district: v.district,
        country: v.country,
      })
      if (!hit) {
        message.warning('地圖資料裡找不到這個地址或店家，可以改貼 Google Maps 網址。')
        return
      }
      form.setFieldsValue({ lat: hit.lat, lng: hit.lng })
      message.success(
        hit.matchedBy === 'address'
          ? `已依地址找到座標：${hit.displayName}`
          : `已依店名找到座標，請確認是否正確：${hit.displayName}`,
        6,
      )
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setGeocoding(false)
    }
  }

  const onMapsUrlBlur = () => {
    const url = form.getFieldValue('googleMapsUrl') as string | undefined
    if (!url || form.getFieldValue('lat') != null) return
    const pos = parseLatLngFromMapsUrl(url)
    if (pos) {
      form.setFieldsValue(pos)
      message.success('已從 Google Maps 網址帶入經緯度')
    }
  }

  const onFinish = async (v: FormValues) => {
    setSaving(true)
    const input: PlaceInput = {
      name: v.name.trim(),
      address: v.address,
      country: v.country,
      city: v.city,
      district: v.district,
      googleMapsUrl: v.googleMapsUrl,
      lat: v.lat ?? undefined,
      lng: v.lng ?? undefined,
      cuisines: v.cuisines ?? [],
      mealTimes: v.mealTimes ?? [],
      placeType: v.placeType,
      priceRange: v.priceRange,
      openingHours: v.openingHours,
      phone: v.phone,
      recommendedDishes: v.recommendedDishes ?? [],
      images,
      links: v.links ?? [],
      tags: v.tags ?? [],
      source: 'manual',
    }
    const user = { statuses: v.statuses ?? [], rating: v.rating, note: v.note }
    try {
      if (id) {
        await placeRepository.update(id, input, user)
        message.success('已儲存變更')
        navigate(`/my/${id}`)
      } else {
        const newId = await placeRepository.create(input, user)
        message.success('已新增店家')
        navigate(`/my/${newId}`)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spin />

  return (
    <div className="place-form">
      <h1 className="page-title">{isEdit ? '編輯店家' : '新增店家'}</h1>
      <p className="page-subtitle">只有店名是必填，其他資料之後都可以再補。</p>

      <Form<FormValues> form={form} layout="vertical" initialValues={DEFAULTS} onFinish={onFinish} requiredMark="optional">
        <Card title="基本資料" className="place-form-card">
          <Form.Item name="name" label="店家名稱" rules={[{ required: true, whitespace: true, message: '請輸入店家名稱' }]}>
            <Input placeholder="例如：左營 XX 食堂" maxLength={100} />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="cuisines" label="食物類型">
                <Select mode="tags" placeholder="選擇或輸入，例如：日式" options={CUISINES.map((c) => ({ value: c }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="placeType" label="店家類型">
                <Select allowClear placeholder="例如：餐廳" options={PLACE_TYPES.map((t) => ({ value: t }))} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="mealTimes" label="適合時段（可複選）">
                <Checkbox.Group
                  options={(Object.keys(MEAL_TIMES) as MealTime[]).map((m) => ({ value: m, label: MEAL_TIMES[m] }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="priceRange" label="價格區間（每人）">
                <Select
                  allowClear
                  placeholder="選擇價格區間"
                  options={PRICE_ORDER.map((p) => ({ value: p, label: PRICE_META[p].label }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="openingHours" label="營業時間">
                <Input placeholder="例如：11:00–14:00、17:00–21:00，週一公休" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="電話">
                <Input placeholder="例如：07-1234567" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="recommendedDishes" label="推薦餐點">
                <Select mode="tags" placeholder="輸入後按 Enter" open={false} suffixIcon={null} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card title="位置" className="place-form-card">
          <Form.Item name="address" label="地址">
            <Input placeholder="例如：高雄市左營區博愛二路 100 號" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={8}>
              <Form.Item name="country" label="國家">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="city" label="城市">
                <Input placeholder="高雄市" />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="district" label="地區">
                <Input placeholder="左營區" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="googleMapsUrl"
            label="Google Maps 位置"
            extra="貼上完整的 Google Maps 網址，會自動帶入經緯度（短網址無法解析）。"
          >
            <Input placeholder="https://www.google.com/maps/place/...@22.66,120.30,17z" onBlur={onMapsUrlBlur} />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={12}>
              <Form.Item name="lat" label="緯度">
                <InputNumber min={-90} max={90} step={0.000001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="lng" label="經度">
                <InputNumber min={-180} max={180} step={0.000001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <div className="place-form-geocode">
            <Button icon={<AimOutlined />} loading={geocoding} onClick={findLocation}>
              用地址找座標
            </Button>
            <span className="place-form-hint">用地址（或店名＋地區）在地圖資料中找座標，找到後請確認位置是否正確。</span>
          </div>
        </Card>

        <Card title="圖片與連結" className="place-form-card">
          <div className="place-form-images">
            {images.map((src, i) => (
              <div key={i} className="place-form-thumb">
                <img src={src} alt={`圖片 ${i + 1}`} />
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label="移除圖片"
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                />
              </div>
            ))}
            <Upload
              accept="image/*"
              multiple
              showUploadList={false}
              beforeUpload={async (file) => {
                try {
                  const data = await compressImage(file)
                  setImages((prev) => [...prev, data])
                } catch {
                  message.error(`${file.name} 不是可讀取的圖片`)
                }
                return false
              }}
            >
              <button type="button" className="place-form-add-image">
                <PlusOutlined />
                <span>加入圖片</span>
              </button>
            </Upload>
          </div>
          <Form.Item name="links" label="網路連結" style={{ marginTop: 16 }}>
            <Select mode="tags" placeholder="貼上網址後按 Enter" open={false} suffixIcon={null} />
          </Form.Item>
        </Card>

        <Card title="我的紀錄" className="place-form-card">
          <Form.Item name="statuses" label="狀態（可複選）">
            <Checkbox.Group
              options={STATUS_ORDER.map((s) => ({ value: s, label: `${STATUS_META[s].icon} ${STATUS_META[s].label}` }))}
            />
          </Form.Item>
          <Form.Item name="rating" label="個人評分">
            <Rate allowHalf />
          </Form.Item>
          <Form.Item name="tags" label="Tag">
            <Select
              mode="tags"
              placeholder="例如：約會、適合聚餐、排隊名店"
              options={knownTags?.map((t) => ({ value: t.name }))}
            />
          </Form.Item>
          <Form.Item name="note" label="個人備註">
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="想記下的任何事" />
          </Form.Item>
        </Card>

        <Space className="place-form-actions">
          <Button onClick={() => navigate(-1)}>取消</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {isEdit ? '儲存變更' : '新增店家'}
          </Button>
        </Space>
      </Form>
    </div>
  )
}
