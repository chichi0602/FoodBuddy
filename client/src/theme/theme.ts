import type { ThemeConfig } from 'antd'

/** 使用者提供的配色 */
export const palette = {
  skyLight: '#A6DAEC',
  sky: '#82BFD3',
  teal: '#386E80',
  charcoal: '#636166',
  gray: '#8D8D8F',
  /** 衍生色：深 teal（標題、Header）與頁面背景 */
  tealDeep: '#244A57',
  mist: '#F3F8FA',
  white: '#FFFFFF',
} as const

export const fontSans = "'Huninn', 'jf-openhuninn', 'Microsoft JhengHei', 'PingFang TC', sans-serif"

export const theme: ThemeConfig = {
  token: {
    colorPrimary: palette.teal,
    colorInfo: palette.sky,
    colorLink: palette.teal,
    colorText: palette.charcoal,
    colorTextSecondary: palette.gray,
    colorTextHeading: palette.tealDeep,
    colorBorder: '#D5E3E8',
    colorBorderSecondary: '#E4EEF1',
    colorBgLayout: palette.mist,
    fontFamily: fontSans,
    borderRadius: 12,
    borderRadiusLG: 20,
  },
  components: {
    Layout: {
      headerBg: palette.tealDeep,
      siderBg: palette.white,
      bodyBg: palette.mist,
    },
    Menu: {
      itemSelectedBg: '#E3F3F9',
      itemSelectedColor: palette.teal,
    },
    Tag: {
      defaultBg: '#EAF6FA',
    },
    Rate: {
      starColor: palette.teal,
    },
  },
}
