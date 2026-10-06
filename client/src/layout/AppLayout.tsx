import type { ReactNode } from 'react'
import { Grid, Layout, Menu } from 'antd'
import {
  CalendarOutlined,
  CompassOutlined,
  HeartOutlined,
  HomeOutlined,
  SettingOutlined,
  StarOutlined,
} from '@ant-design/icons'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import './AppLayout.css'

const { Header, Sider, Content } = Layout

interface NavItem {
  key: string
  icon: ReactNode
  label: string
  /** 手機底部分頁列的短標籤 */
  mobileLabel?: string
  mobile: boolean
}

const NAV: NavItem[] = [
  { key: '/', icon: <HomeOutlined />, label: '首頁', mobile: true },
  { key: '/ai', icon: <StarOutlined />, label: 'AI 找美食', mobile: true },
  { key: '/my', icon: <HeartOutlined />, label: '我的美食', mobile: true },
  { key: '/map', icon: <CompassOutlined />, label: '地圖', mobile: true },
  // 手機的「到訪」用短標籤；設定改由標題列右側齒輪進入，底部分頁列維持五格
  { key: '/visits', icon: <CalendarOutlined />, label: '到訪與統計', mobileLabel: '到訪', mobile: true },
  { key: '/settings', icon: <SettingOutlined />, label: '設定', mobile: false },
]

function activeKey(pathname: string) {
  if (pathname === '/') return '/'
  return NAV.find((n) => n.key !== '/' && pathname.startsWith(n.key))?.key ?? ''
}

export default function AppLayout() {
  const screens = Grid.useBreakpoint()
  const isDesktop = !!screens.md
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const selected = activeKey(pathname)

  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <Link to="/" className="app-brand">
          FoodBuddy<span className="app-brand-sub">美食夥伴</span>
        </Link>
        {!isDesktop && (
          <Link
            to="/settings"
            className={selected === '/settings' ? 'app-header-settings app-header-settings--active' : 'app-header-settings'}
            aria-label="設定"
          >
            <SettingOutlined />
          </Link>
        )}
      </Header>
      <Layout>
        {isDesktop && (
          <Sider width={208} className="app-sider">
            <Menu
              mode="inline"
              selectedKeys={[selected]}
              items={NAV.map(({ key, icon, label }) => ({ key, icon, label }))}
              onClick={({ key }) => navigate(key)}
            />
          </Sider>
        )}
        <Content className={isDesktop ? 'app-content' : 'app-content app-content--mobile'}>
          <Outlet />
        </Content>
      </Layout>
      {!isDesktop && (
        <nav className="app-tabbar" aria-label="主要導覽">
          {NAV.filter((n) => n.mobile).map((n) => (
            <Link
              key={n.key}
              to={n.key}
              className={selected === n.key ? 'app-tab app-tab--active' : 'app-tab'}
              aria-current={selected === n.key ? 'page' : undefined}
            >
              <span className="app-tab-icon">{n.icon}</span>
              <span>{n.mobileLabel ?? n.label}</span>
            </Link>
          ))}
        </nav>
      )}
    </Layout>
  )
}
