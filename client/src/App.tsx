import { Route, Routes } from 'react-router-dom'
import AppLayout from './layout/AppLayout'
import HomePage from './pages/HomePage'
import MyFoodPage from './pages/MyFoodPage'
import PlaceFormPage from './pages/PlaceFormPage'
import PlaceDetailPage from './pages/PlaceDetailPage'
import ComingSoonPage from './pages/ComingSoonPage'
import AiSearchPage from './pages/AiSearchPage'
import MapPage from './pages/MapPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="my" element={<MyFoodPage />} />
        <Route path="my/new" element={<PlaceFormPage />} />
        <Route path="my/:id" element={<PlaceDetailPage />} />
        <Route path="my/:id/edit" element={<PlaceFormPage />} />
        <Route path="ai" element={<AiSearchPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="visits" element={<ComingSoonPage title="到訪紀錄" phase="Phase 7" />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<ComingSoonPage title="找不到這個頁面" />} />
      </Route>
    </Routes>
  )
}
