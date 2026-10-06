import { defineConfig } from '@playwright/test'
import studio from './playwright.studio.config.ts'
export default defineConfig({...studio,testMatch:['hub-map.spec.ts','player-ledger.spec.ts','world-style.spec.ts'],grepInvert:/camera keeps 52px/})
