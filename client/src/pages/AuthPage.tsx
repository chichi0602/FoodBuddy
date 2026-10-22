import { useEffect, useState } from 'react'
import { Alert, Button, Divider, Form, Input } from 'antd'
import { GoogleOutlined, LockOutlined, MailOutlined, SmileOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { authApi } from '../services/authApi'
import { HttpError } from '../services/http'
import './AuthPage.css'

const GOOGLE_ERRORS: Record<string, string> = {
  google: 'Google 登入沒有完成，請再試一次。',
  'google-email': 'Google 帳號沒有提供 Email，無法登入。',
  locked: '這個帳號暫時被鎖定，請 15 分鐘後再試。',
}

interface FormValues {
  email: string
  password: string
  confirm?: string
  displayName?: string
}

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { enter } = useAuth()
  const [params] = useSearchParams()
  const [google, setGoogle] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(GOOGLE_ERRORS[params.get('error') ?? ''])
  const isRegister = mode === 'register'
  const next = params.get('next')
  const withNext = (path: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path)

  useEffect(() => {
    authApi
      .providers()
      .then((p) => setGoogle(p.google))
      .catch(() => setGoogle(false))
  }, [])

  const submit = async (v: FormValues) => {
    setSubmitting(true)
    setError(undefined)
    try {
      const user = isRegister
        ? await authApi.register(v.email.trim(), v.password, v.displayName?.trim() ?? '')
        : await authApi.login(v.email.trim(), v.password)
      await enter(user)
    } catch (e) {
      setError(e instanceof HttpError ? e.message : '發生錯誤，請稍後再試。')
      setSubmitting(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          FoodBuddy<span className="auth-brand-sub">美食夥伴</span>
        </div>
        <p className="auth-tagline">收藏喜歡的店，讓 AI 幫你找下一間。</p>

        <h1 className="auth-title">{isRegister ? '建立帳號' : '登入'}</h1>

        {error && <Alert type="error" showIcon title={error} className="auth-alert" />}

        <Form<FormValues> layout="vertical" requiredMark={false} onFinish={submit} disabled={submitting}>
          {isRegister && (
            <Form.Item name="displayName" label="暱稱（選填）">
              <Input prefix={<SmileOutlined />} maxLength={30} autoComplete="nickname" placeholder="想怎麼稱呼你" />
            </Form.Item>
          )}
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: '請輸入 Email' },
              { type: 'email', message: 'Email 格式不正確' },
            ]}
          >
            <Input prefix={<MailOutlined />} autoComplete="email" inputMode="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密碼"
            rules={[
              { required: true, message: '請輸入密碼' },
              ...(isRegister ? [{ min: 8, message: '密碼至少要 8 個字元' }] : []),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete={isRegister ? 'new-password' : 'current-password'} />
          </Form.Item>
          {isRegister && (
            <Form.Item
              name="confirm"
              label="再輸入一次密碼"
              dependencies={['password']}
              rules={[
                { required: true, message: '請再輸入一次密碼' },
                ({ getFieldValue }) => ({
                  validator: (_, value) =>
                    !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error('兩次輸入的密碼不一樣')),
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
            {isRegister ? '註冊並開始使用' : '登入'}
          </Button>
        </Form>

        {google && (
          <>
            <Divider plain className="auth-divider">
              或
            </Divider>
            <Button block size="large" icon={<GoogleOutlined />} href="/api/auth/google" disabled={submitting}>
              用 Google 登入
            </Button>
          </>
        )}

        <p className="auth-switch">
          {isRegister ? (
            <>
              已經有帳號了？<Link to={withNext('/login')}>登入</Link>
            </>
          ) : (
            <>
              還沒有帳號？<Link to={withNext('/register')}>免費註冊</Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
