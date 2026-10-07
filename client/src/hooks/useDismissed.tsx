import { App, Button } from 'antd'
import { useLiveQuery } from 'dexie-react-hooks'
import { dismissedRepository } from '../db/dismissedRepository'
import type { Recommendation } from '../types'

/**
 * 「沒興趣」清單：回傳目前的 id 集合，以及按「沒興趣」的動作（訊息附復原）。
 * 畫面依 id 集合過濾，所以寫入或復原後卡片會自動消失或回來。
 */
export function useDismissed() {
  const { message } = App.useApp()
  const ids = useLiveQuery(() => dismissedRepository.ids(), []) ?? []
  const idSet = new Set(ids)

  const dismiss = async (r: Recommendation) => {
    await dismissedRepository.add(r.id, r.name)
    const key = `dismiss-${r.id}`
    message.open({
      key,
      type: 'info',
      duration: 5,
      content: (
        <span>
          之後不會再推薦「{r.name}」。
          <Button
            type="link"
            size="small"
            onClick={async () => {
              await dismissedRepository.remove(r.id)
              message.destroy(key)
            }}
          >
            復原
          </Button>
        </span>
      ),
    })
  }

  return { ids, isDismissed: (id: string) => idSet.has(id), dismiss }
}
