import type { Page } from '@playwright/test'
import type { PlayerState } from '../../src/player/model.ts'

export async function readPlayer(page: Page): Promise<PlayerState> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chroma-match-player-v1', 1)
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<PlayerState>((resolve, reject) => {
        const request = db.transaction('player', 'readonly').objectStore('player').get('current')
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
      })
    } finally { db.close() }
  })
}
