import type { MealTime, PlaceStatus, PriceRange } from './types'

export const STATUS_META: Record<PlaceStatus, { label: string; icon: string; color: string }> = {
  wantToGo: { label: '想去', icon: '📌', color: '#82BFD3' },
  favorite: { label: '收藏', icon: '❤️', color: '#386E80' },
  visited: { label: '已去過', icon: '✅', color: '#244A57' },
  revisit: { label: '想再訪', icon: '🔁', color: '#5A9BB0' },
  notRecommended: { label: '不推薦', icon: '🚫', color: '#8D8D8F' },
}

export const STATUS_ORDER: PlaceStatus[] = ['wantToGo', 'favorite', 'visited', 'revisit', 'notRecommended']

export const CUISINES = [
  '日式', '韓式', '台式', '中式', '西式', '義式', '燒肉', '火鍋',
  '拉麵', '牛排', '咖啡', '甜點', '飲料', '小吃',
]

export const PLACE_TYPES = ['餐廳', '小吃攤', '咖啡廳', '甜點店', '飲料店', '酒吧', '早餐店', '夜市攤位']

export const PRICE_META: Record<PriceRange, { label: string; min: number; max: number }> = {
  under200: { label: '$200 以下', min: 0, max: 200 },
  '200to500': { label: '$200～500', min: 200, max: 500 },
  '500to1000': { label: '$500～1000', min: 500, max: 1000 },
  over1000: { label: '$1000 以上', min: 1000, max: Number.POSITIVE_INFINITY },
}

export const PRICE_ORDER: PriceRange[] = ['under200', '200to500', '500to1000', 'over1000']

export const MEAL_TIMES: Record<MealTime, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  teatime: '下午茶',
  dinner: '晚餐',
  lateNight: '宵夜',
}
