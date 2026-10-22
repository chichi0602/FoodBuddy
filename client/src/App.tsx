import { Fragment } from 'react'
import { Button, Result, Spin } from 'antd'
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from './auth/authContext'
import LegacyImportPrompt from './auth/LegacyImportPrompt'
import AppLayout from './layout/AppLayout'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import MyFoodPage from './pages/MyFoodPage'
import PlaceFormPage from './pages/PlaceFormPage'
import PlaceDetailPage from './pages/PlaceDetailPage'
import ComingSoonPage from './pages/ComingSoonPage'
import AiSearchPage from './pages/AiSearchPage'
import MapPage from './pages/MapPage'
import VisitsPage from './pages/VisitsPage'
import SettingsPage from './pages/SettingsPage'

/** 沒登入時導到登入頁，登入後回到原本要去的頁面 */
function ToLogin() {
  const { pathname, search } = useLocation()
  const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`
  return <Navigate to={`/login${next}`} replace />
}

function AfterLogin() {
  const [params] = useSearchParams()
  const next = params.get('next')
  // 只接受站內路徑，避免被導到其他網站
  return <Navigate to={next?.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />
}

export default function App() {
  const { state, retry } = useAuth()

  if (state.status === 'loading') {
    return (
      <div className="app-loading">
        <Spin size="large" />
        {state.message && <p>{state.message}</p>}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <Result
        status="warning"
        title={state.message}
        extra={
          <Button type="primary" onClick={retry}>
            重試
          </Button>
        }
      />
    )
  }

  if (state.status === 'anonymous') {
    return (
      <Routes>
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<ToLogin />} />
      </Routes>
    )
  }

  // 換帳號時整個畫面重新掛上，不會殘留上一個帳號的狀態
  return (
    <Fragment key={state.user.id}>
      <LegacyImportPrompt userId={state.user.id} />
      <Routes>
        <Route path="login" element={<AfterLogin />} />
        <Route path="register" element={<AfterLogin />} />
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="my" element={<MyFoodPage />} />
          <Route path="my/new" element={<PlaceFormPage />} />
          <Route path="my/:id" element={<PlaceDetailPage />} />
          <Route path="my/:id/edit" element={<PlaceFormPage />} />
          <Route path="ai" element={<AiSearchPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="visits" element={<VisitsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<ComingSoonPage title="找不到這個頁面" />} />
        </Route>
      </Routes>
    </Fragment>
  )
}
