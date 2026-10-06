import { defineConfig } from '@playwright/test'
import studio from './playwright.studio.config.ts'
export default defineConfig({...studio,testMatch:['hub-map.spec.ts','player-ledger.spec.ts','world-style.spec.ts','profile-rank.spec.ts','casual-ui.spec.ts','terrain.spec.ts','new-tools.spec.ts'],grepInvert:/camera keeps 52px/})
