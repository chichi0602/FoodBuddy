/** 店家個人狀態（同一間店可多選，例如 已去過 + 想再訪） */
export type PlaceStatus = 'wantToGo' | 'favorite' | 'visited' | 'revisit' | 'notRecommended'

/** 價格區間（每人） */
export type PriceRange = 'under200' | '200to500' | '500to1000' | 'over1000'

export type MealTime = 'breakfast' | 'lunch' | 'teatime' | 'dinner' | 'lateNight'

/** 店家 / 美食景點 */
export interface Place {
  id: string
  name: string
  address?: string
  country?: string
  city?: string
  district?: string
  googleMapsUrl?: string
  lat?: number
  lng?: number
  cuisines: string[]
  placeType?: string
  priceRange?: PriceRange
  openingHours?: string
  phone?: string
  recommendedDishes: string[]
  images: string[]
  links: string[]
  tags: string[]
  /** 資料來源：手動新增或 AI 搜尋加入 */
  source: 'manual' | 'ai'
  createdAt: number
  updatedAt: number
}

/** 使用者與店家的關聯（以 placeId 為主鍵） */
export interface UserPlace {
  placeId: string
  statuses: PlaceStatus[]
  rating?: number
  note?: string
  updatedAt: number
}

/** 到訪紀錄 */
export interface VisitRecord {
  id: string
  placeId: string
  visitedAt: string
  rating?: number
  dishes: string[]
  spending?: number
  companions?: string
  photos: string[]
  review?: string
  wouldRevisit?: boolean
  createdAt: number
}

export interface Tag {
  name: string
  createdAt: number
}

export interface AISearchHistory {
  id: string
  query: string
  createdAt: number
}

/** 列表顯示用：店家 + 個人資料 */
export interface PlaceWithUser extends Place {
  user: UserPlace
}
