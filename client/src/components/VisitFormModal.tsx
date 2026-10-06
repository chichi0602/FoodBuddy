import { useEffect, useState } from 'react'
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Radio, Rate, Select, Upload } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { visitRepository, type VisitInput } from '../db/visitRepository'
import type { PlaceWithUser, VisitRecord } from '../types'
import { compressImage } from '../utils/image'
import './VisitFormModal.css'

type Revisit = 'yes' | 'unsure' | 'no'

interface FormValues {
  placeId: string
  visitedAt: Dayjs
  rating?: number
  dishes: string[]
  spending?: number
  companions?: string
  review?: string
  revisit: Revisit
}

interface Props {
  open: boolean
  onClose: () => void
  /** 指定店家（從詳細頁新增）；沒有時顯示店家下拉 */
  placeId?: string
  /** 編輯既有到訪 */
  visit?: VisitRecord
  /** 店家選項（沒有指定店家時使用） */
  places?: PlaceWithUser[]
}

const toRevisit = (v?: boolean): Revisit => (v === true ? 'yes' : v === false ? 'no' : 'unsure')

export default function VisitFormModal({ open, onClose, placeId, visit, places }: Props) {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [photos, setPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (visit) {
      form.setFieldsValue({
        placeId: visit.placeId,
        visitedAt: dayjs(visit.visitedAt),
        rating: visit.rating,
        dishes: visit.dishes,
        spending: visit.spending,
        companions: visit.companions,
        review: visit.review,
        revisit: toRevisit(visit.wouldRevisit),
      })
      setPhotos(visit.photos)
    } else {
      form.resetFields()
      form.setFieldsValue({ placeId, visitedAt: dayjs(), dishes: [], revisit: 'unsure' })
      setPhotos([])
    }
  }, [open, visit, placeId, form])

  const onFinish = async (v: FormValues) => {
    setSaving(true)
    const input: VisitInput = {
      placeId: v.placeId,
      visitedAt: v.visitedAt.format('YYYY-MM-DD'),
      rating: v.rating || undefined,
      dishes: v.dishes ?? [],
      spending: v.spending ?? undefined,
      companions: v.companions?.trim() || undefined,
      photos,
      review: v.review?.trim() || undefined,
      wouldRevisit: v.revisit === 'yes' ? true : v.revisit === 'no' ? false : undefined,
    }
    try {
      if (visit) await visitRepository.update(visit.id, input)
      else await visitRepository.create(input)
      message.success(visit ? '已更新到訪紀錄' : '已新增到訪紀錄')
      onClose()
      // 「不會再去」時詢問要不要標為不推薦，讓 AI 之後避開
      if (input.wouldRevisit === false) {
        modal.confirm({
          title: '要把這間店標為「不推薦」嗎？',
          content: '標記後，AI 推薦時會避開這間店與類似的料理。',
          okText: '標為不推薦',
          cancelText: '先不要',
          onOk: () => visitRepository.markNotRecommended(input.placeId),
        })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={visit ? '編輯到訪紀錄' : '新增到訪紀錄'}
      open={open}
      onCancel={onClose}
      okText={visit ? '儲存變更' : '新增'}
      cancelText="取消"
      confirmLoading={saving}
      onOk={() => form.submit()}
      destroyOnHidden
      width={560}
    >
      <Form<FormValues> form={form} layout="vertical" onFinish={onFinish} requiredMark="optional">
        {!placeId && (
          <Form.Item name="placeId" label="店家" rules={[{ required: true, message: '請選擇店家' }]}>
            <Select
              showSearch
              placeholder="選擇我的美食中的店家"
              optionFilterProp="label"
              options={places?.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
        )}
        {placeId && <Form.Item name="placeId" hidden><Input /></Form.Item>}
        <div className="visit-form-row">
          <Form.Item name="visitedAt" label="到訪日期" rules={[{ required: true, message: '請選擇日期' }]}>
            <DatePicker allowClear={false} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="rating" label="這次的評分">
            <Rate allowHalf />
          </Form.Item>
        </div>
        <Form.Item name="dishes" label="吃了什麼">
          <Select mode="tags" placeholder="輸入後按 Enter" open={false} suffixIcon={null} />
        </Form.Item>
        <div className="visit-form-row">
          <Form.Item name="spending" label="消費金額（新台幣）">
            <InputNumber min={0} step={50} prefix="$" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="companions" label="同行人">
            <Input placeholder="例如：家人、同事小王" maxLength={100} />
          </Form.Item>
        </div>
        <Form.Item name="review" label="心得">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="好吃嗎？下次想點什麼？" />
        </Form.Item>
        <Form.Item name="revisit" label="願意再來嗎？">
          <Radio.Group
            optionType="button"
            options={[
              { value: 'yes', label: '🔁 願意再訪' },
              { value: 'unsure', label: '還不確定' },
              { value: 'no', label: '🚫 不會再去' },
            ]}
          />
        </Form.Item>
        <div className="visit-form-photos">
          {photos.map((src, i) => (
            <div key={i} className="visit-form-thumb">
              <img src={src} alt={`照片 ${i + 1}`} />
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                aria-label="移除照片"
                onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
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
                setPhotos((prev) => [...prev, data])
              } catch {
                message.error(`${file.name} 不是可讀取的圖片`)
              }
              return false
            }}
          >
            <button type="button" className="visit-form-add-photo">
              <PlusOutlined />
              <span>加入照片</span>
            </button>
          </Upload>
        </div>
      </Form>
    </Modal>
  )
}
