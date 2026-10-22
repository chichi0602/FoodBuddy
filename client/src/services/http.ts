/** 登入過期或被登出時發出，AuthProvider 收到後切回登入頁 */
export const authEvents = new EventTarget()

export function notifyUnauthorized() {
  authEvents.dispatchEvent(new Event('unauthorized'))
}

export class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const OFFLINE_MESSAGE = '連不上 FoodBuddy 伺服器，請確認網路後再試。'

/** 呼叫後端 JSON API；錯誤時丟出可直接顯示的訊息 */
export async function requestJson<T>(
  url: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; fallback?: string } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      signal: init.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new HttpError(OFFLINE_MESSAGE, 0)
  }
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    if (res.status === 401 && !url.startsWith('/api/auth/')) notifyUnauthorized()
    const message =
      typeof data?.message === 'string'
        ? data.message
        : res.status === 401
          ? '請先登入。'
          : res.status >= 500
            ? OFFLINE_MESSAGE
            : (init.fallback ?? '發生錯誤，請稍後再試。')
    throw new HttpError(message, res.status)
  }
  return res.json() as Promise<T>
}
