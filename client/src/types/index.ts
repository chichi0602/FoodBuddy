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
  /** 適合的用餐時段 */
  mealTimes: MealTime[]
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
  /** 從 AI 推薦加入時保存的分析 */
  aiSummary?: AiSummary
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

/** AI 解析出的搜尋條件（對應後端 SearchConditions） */
export interface SearchConditions {
  summary: string
  country: string | null
  city: string | null
  district: string | null
  landmark: string | null
  cuisines: string[]
  mealTime: MealTime | null
  people: number | null
  budgetPerPerson: number | null
  keywords: string[]
}

/** AI 推薦的店家：基本資料來自 OpenStreetMap，分析來自 AI（對應後端 Recommendation） */
export interface Recommendation {
  /** OpenStreetMap id，例如 node/123 */
  id: string
  name: string
  city: string | null
  district: string | null
  address: string | null
  lat: number
  lng: number
  distanceMeters: number
  openingHours: string | null
  phone: string | null
  website: string | null
  placeType: string | null
  cuisines: string[]
  priceRange: PriceRange | null
  estimatedPricePerPerson: number | null
  reputation: string | null
  recommendedDishes: string[]
  reason: string
  pros: string[]
  cons: string[]
  suitableFor: string | null
  /** 符合使用者口味時的依據；有值的放「根據你的口味推薦」 */
  preferenceReason: string | null
  matchScore: number
  /** Recommendation Score 0～100，推薦依此排序 */
  score: number
  scoreBreakdown: ScoreItem[]
}

/** 推薦分數的一項 */
export interface ScoreItem {
  key: string
  label: string
  points: number
  max: number
  note: string
}

/** 使用者按過「沒興趣」的店（以 OpenStreetMap id 記錄） */
export interface DismissedPlace {
  id: string
  name: string
  dismissedAt: number
}

export interface AiSummary {
  reason: string
  pros: string[]
  cons: string[]
  reputation?: string
  suitableFor?: string
  query: string
  savedAt: number
}

/** 推薦的搜尋範圍 */
export interface SearchArea {
  lat: number
  lng: number
  label: string
  radiusMeters: number
}

export interface RecommendResult {
  recommendations: Recommendation[]
  /** AI 從收藏中挑出、符合這次需求的店 */
  saved: SavedPick[]
  mock: boolean
  area: SearchArea | null
  candidateCount: number
  message: string | null
}

/** 從收藏計算的口味摘要，送給 AI 參考 */
export interface TasteProfile {
  topCuisines: { name: string; count: number }[]
  preferredPriceRanges: PriceRange[]
  highRated: string[]
  dislikedCuisines: string[]
  dislikedNames: string[]
  /** 最常去的地區（城市＋行政區） */
  topDistricts: string[]
  /** 到訪紀錄總數 */
  visitCount: number
  totalSaved: number
}

/** 送給後端的收藏（精簡欄位） */
export interface SavedPlaceInput {
  id: string
  name: string
  lat: number | null
  lng: number | null
  city: string | null
  district: string | null
  cuisines: string[]
  statuses: PlaceStatus[]
  rating: number | null
  priceRange: PriceRange | null
}

export interface SavedPick {
  placeId: string
  reason: string
  matchScore: number
}

/** AI 口味分析結果（對應後端 TasteInsight） */
export interface TasteInsight {
  summary: string
  highlights: string[]
  suggestions: string[]
}
