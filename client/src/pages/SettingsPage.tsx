import { useState } from 'react'
import { App, Button, Card, Empty, Input, Modal, Popconfirm, Spin } from 'antd'
import { DeleteOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { tagRepository } from '../db/tagRepository'
import { dismissedRepository } from '../db/dismissedRepository'
import './SettingsPage.css'

export default function SettingsPage() {
  const { message } = App.useApp()
  const tags = useLiveQuery(() => tagRepository.listWithCount(), [])
  const dismissed = useLiveQuery(() => dismissedRepository.list(), [])
  const [editing, setEditing] = useState<string>()
  const [newName, setNewName] = useState('')

  const existing = tags?.find((t) => t.name === newName.trim() && t.name !== editing)

  const saveRename = async () => {
    if (!editing) return
    const target = newName.trim()
    await tagRepository.rename(editing, target)
    message.success(existing ? `已將 #${editing} 合併到 #${target}` : `已改名為 #${target}`)
    setEditing(undefined)
  }

  return (
    <div className="settings">
      <h1 className="page-title">設定</h1>
      <p className="page-subtitle">管理你的 Tag 與不想再看到的推薦。</p>

      <Card title="Tag 管理" className="settings-card">
        {!tags ? (
          <Spin />
        ) : tags.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="還沒有 Tag。編輯店家時可以加上 Tag，例如：約會、適合聚餐。" />
        ) : (
          <ul className="settings-tags">
            {tags.map((t) => (
              <li key={t.name} className="settings-tag">
                <Link to={`/my?tag=${encodeURIComponent(t.name)}`} className="settings-tag-name">
                  #{t.name}
                </Link>
                <span className="settings-tag-count">{t.count} 間店</span>
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  aria-label={`重新命名 ${t.name}`}
                  onClick={() => {
                    setEditing(t.name)
                    setNewName(t.name)
                  }}
                />
                <Popconfirm
                  title={`刪除 #${t.name}？`}
                  description={t.count > 0 ? `會從 ${t.count} 間店移除這個 Tag，店家本身不會被刪除。` : undefined}
                  okText="刪除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={async () => {
                    await tagRepository.remove(t.name)
                    message.success(`已刪除 #${t.name}`)
                  }}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label={`刪除 ${t.name}`} />
                </Popconfirm>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="不感興趣的店" className="settings-card">
        {!dismissed ? (
          <Spin />
        ) : dismissed.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="在 AI 推薦卡片按「沒興趣」的店會列在這裡，之後的推薦都會排除它們。"
          />
        ) : (
          <ul className="settings-tags">
            {dismissed.map((d) => (
              <li key={d.id} className="settings-tag">
                <span className="settings-tag-name">{d.name}</span>
                <span className="settings-tag-count">{dayjs(d.dismissedAt).format('YYYY/MM/DD')}</span>
                <Button
                  type="text"
                  icon={<UndoOutlined />}
                  aria-label={`恢復推薦 ${d.name}`}
                  onClick={async () => {
                    await dismissedRepository.remove(d.id)
                    message.success(`之後會再推薦「${d.name}」`)
                  }}
                >
                  恢復
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        title={`重新命名 #${editing ?? ''}`}
        open={!!editing}
        okText={existing ? '合併' : '儲存'}
        cancelText="取消"
        okButtonProps={{ disabled: !newName.trim() || newName.trim() === editing }}
        onOk={saveRename}
        onCancel={() => setEditing(undefined)}
        destroyOnHidden
      >
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} onPressEnter={saveRename} maxLength={30} autoFocus />
        {existing && <p className="settings-merge-hint">#{existing.name} 已經存在，儲存後兩個 Tag 會合併成一個。</p>}
      </Modal>
    </div>
  )
}
