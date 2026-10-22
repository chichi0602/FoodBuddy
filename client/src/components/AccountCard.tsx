import { useState, useSyncExternalStore } from 'react'
import { App, Button, Card, Input, Modal } from 'antd'
import { CloudSyncOutlined, DeleteOutlined, LogoutOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../auth/authContext'
import { db } from '../db/db'
import { HttpError } from '../services/http'
import { syncNow, syncStatusStore } from '../sync/syncEngine'
import './AccountCard.css'

/** 設定頁的帳號區塊：帳號資訊、同步狀態、登出、刪除帳號 */
export default function AccountCard() {
  const { state, pendingAfterSync, logout, deleteAccount } = useAuth()
  const { message, modal } = App.useApp()
  const sync = useSyncExternalStore(syncStatusStore.subscribe, syncStatusStore.getSnapshot)
  const pending = useLiveQuery(() => db.outbox.count(), []) ?? 0
  const [leaving, setLeaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  if (state.status !== 'ready') return null
  const { user, offline } = state
  const loginMethod = [user.hasPassword && 'Email 與密碼', user.logins.includes('Google') && 'Google'].filter(Boolean).join('、')

  const onLogout = async () => {
    setLeaving(true)
    const left = await pendingAfterSync()
    if (left > 0) {
      const ok = await modal.confirm({
        title: `還有 ${left} 筆修改沒有上傳`,
        content: '目前連不上伺服器。現在登出的話，這些修改會遺失。',
        okText: '仍要登出',
        okButtonProps: { danger: true },
        cancelText: '先不要',
      })
      if (!ok) {
        setLeaving(false)
        return
      }
    }
    await logout()
  }

  const onDelete = async () => {
    setDeleting(true)
    try {
      await deleteAccount()
      message.success('帳號與所有資料已刪除')
    } catch (e) {
      message.error(e instanceof HttpError ? e.message : '刪除帳號失敗，請稍後再試。')
      setDeleting(false)
    }
  }

  const syncText =
    sync.state === 'syncing'
      ? '同步中…'
      : sync.state === 'error'
        ? sync.error
        : offline
          ? '離線中，連上網路後會自動同步'
          : pending > 0
            ? `${pending} 筆修改等待上傳`
            : sync.lastSyncAt
              ? `已同步（${dayjs(sync.lastSyncAt).format('MM/DD HH:mm')}）`
              : '已同步'

  return (
    <Card title="帳號" className="settings-card">
      <div className="account">
        <div className="account-name">{user.displayName ?? user.email}</div>
        {user.displayName && <div className="account-email">{user.email}</div>}
        <div className="account-meta">登入方式：{loginMethod || 'Email'}</div>
        <div className={sync.state === 'error' ? 'account-sync account-sync--error' : 'account-sync'}>
          <CloudSyncOutlined /> {syncText}
        </div>
      </div>
      <div className="account-actions">
        <Button icon={<CloudSyncOutlined />} loading={sync.state === 'syncing'} onClick={() => void syncNow()}>
          立即同步
        </Button>
        <Button icon={<LogoutOutlined />} loading={leaving} onClick={onLogout}>
          登出
        </Button>
        <Button
          danger
          type="text"
          icon={<DeleteOutlined />}
          onClick={() => {
            setConfirmText('')
            setDeleteOpen(true)
          }}
        >
          刪除帳號
        </Button>
      </div>

      <Modal
        open={deleteOpen}
        title="刪除帳號"
        okText="永久刪除"
        okButtonProps={{ danger: true, disabled: confirmText !== '刪除' }}
        cancelText="取消"
        confirmLoading={deleting}
        onOk={onDelete}
        onCancel={() => setDeleteOpen(false)}
        destroyOnHidden
      >
        <p>帳號、收藏、到訪紀錄與照片都會從伺服器和這台裝置上永久刪除，無法復原。</p>
        <p>
          請輸入「<strong>刪除</strong>」確認：
        </p>
        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus />
      </Modal>
    </Card>
  )
}
