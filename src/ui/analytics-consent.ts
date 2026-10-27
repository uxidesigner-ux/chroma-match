import {analytics} from '../analytics/client.ts'
import {language, onLanguageChange} from '../i18n/index.ts'
import {ModalLayer} from './modal.ts'
import type {Screens} from './screens.ts'
const copy = () => ({
  ko: {title: '플레이 통계 수집', body: '게임 개선을 위해 Google Analytics의 방문·플레이 통계와 분석용 쿠키를 허용할까요? 계정 아이디·이메일·캐릭터 정보는 보내지 않아요. 설정에서 언제든 바꿀 수 있어요.', yes: '허용', no: '허용 안 함', row: '이용 통계', detail: 'Google Analytics · 선택 사항', blocked: '브라우저의 추적 방지 설정을 따르고 있어요.', session: '이 선택은 이번 방문에만 적용돼요.', privacy: 'Google 개인정보처리방침'},
  en: {title: 'Gameplay analytics', body: 'Allow Google Analytics and analytics cookies to measure visits and gameplay? We do not send account IDs, emails or character details. You can change this in Settings.', yes: 'Allow', no: 'Decline', row: 'Usage analytics', detail: 'Google Analytics · Optional', blocked: 'Your browser privacy preference is respected.', session: 'This choice applies to this visit only.', privacy: 'Google Privacy Policy'},
  ja: {title: 'プレイ統計', body: 'ゲーム改善のため、Google Analyticsによる訪問・プレイ統計と分析用Cookieを許可しますか？アカウントID・メール・キャラクター情報は送信しません。設定で変更できます。', yes: '許可', no: '許可しない', row: '利用統計', detail: 'Google Analytics · 任意', blocked: 'ブラウザーの追跡防止設定に従っています。', session: 'この設定は今回の訪問のみ有効です。', privacy: 'Google プライバシーポリシー'},
  'zh-Hans': {title: '游戏统计', body: '是否允许 Google Analytics 和分析 Cookie 统计访问与游戏行为？我们不发送账号ID、邮箱或角色信息。可随时在设置中修改。', yes: '允许', no: '不允许', row: '使用统计', detail: 'Google Analytics · 可选', blocked: '遵循浏览器的隐私偏好。', session: '此选择仅适用于本次访问。', privacy: 'Google 隐私政策'},
})[language()]
export class AnalyticsConsent {
  private root = document.createElement('div')
  private panel = document.createElement('section')
  private title = document.createElement('h2')
  private body = document.createElement('p')
  private accept = document.createElement('button')
  private decline = document.createElement('button')
  private privacy = document.createElement('a')
  private row = document.createElement('button')
  private name = document.createElement('strong')
  private detail = document.createElement('span')
  private opened = false
  private booted = false
  private pending = false
  private modal: ModalLayer
  constructor(private screens: Screens) {
    this.root.id = 'analytics-consent'; this.root.className = 'overlay'; this.root.hidden = true
    this.panel.className = 'card analytics-panel'; this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true')
    this.title.id = 'analytics-title'; this.body.id = 'analytics-description'
    this.panel.setAttribute('aria-labelledby', this.title.id); this.panel.setAttribute('aria-describedby', this.body.id)
    const actions = document.createElement('div'); actions.className = 'analytics-actions'
    this.accept.id = 'analytics-allow'; this.decline.id = 'analytics-decline'
    for (const button of [this.decline, this.accept]) { button.type = 'button'; button.className = 'btn btn-ghost' }
    this.accept.addEventListener('click', () => this.choose(true)); this.decline.addEventListener('click', () => this.choose(false))
    this.privacy.href = 'https://policies.google.com/privacy'; this.privacy.target = '_blank'; this.privacy.rel = 'noopener noreferrer'
    actions.append(this.decline, this.accept); this.panel.append(this.title, this.body, actions, this.privacy); this.root.append(this.panel)
    document.body.append(this.root); this.modal = new ModalLayer(this.root, this.panel, () => this.choose(false))
    this.row.id = 'set-analytics'; this.row.type = 'button'; this.row.className = 'set-row'; this.row.setAttribute('role', 'switch')
    const text = document.createElement('span'); text.className = 'set-row-text'; this.name.className = 'set-row-name'; this.detail.className = 'set-row-sub'
    const switcher = document.createElement('span'); switcher.className = 'set-switch'; switcher.setAttribute('aria-hidden', 'true')
    text.append(this.name, this.detail); this.row.append(text, switcher)
    document.getElementById('set-haptics')!.parentElement!.append(this.row)
    this.row.addEventListener('click', () => analytics.choose(analytics.consent !== 'granted'))
    analytics.onChange(() => this.paint()); onLanguageChange(() => this.paint())
    screens.onChange(() => this.maybeShow())
    const observer = new MutationObserver(() => this.maybeShow())
    observer.observe(document.querySelector('.app')!, {attributes: true, attributeFilter: ['inert']})
    observer.observe(document.getElementById('splash')!, {attributes: true, attributeFilter: ['hidden']})
    this.paint()
  }
  ready(): void { this.booted = true; this.maybeShow() }
  private choose(grant: boolean): void {
    analytics.choose(grant); this.opened = false; this.modal.close(); this.root.hidden = true
  }
  private paint(): void {
    const c = copy(); this.title.textContent = c.title; this.body.textContent = c.body; this.accept.textContent = c.yes; this.decline.textContent = c.no; this.privacy.textContent = c.privacy
    this.name.textContent = c.row; this.detail.textContent = !analytics.available ? c.blocked : !analytics.retained ? c.session : c.detail
    this.row.classList.toggle('is-on', analytics.allowed); this.row.setAttribute('aria-checked', String(analytics.allowed)); this.row.disabled = !analytics.available
    if (analytics.consent !== null && this.opened) { this.opened = false; this.modal.close(); this.root.hidden = true }
    this.maybeShow()
  }
  private maybeShow(): void {
    if (!this.booted || this.pending) return
    // Splash completion queues the welcome panel in a microtask. Let that panel
    // take ownership first instead of opening a competing modal underneath it.
    this.pending = true
    requestAnimationFrame(() => {
      this.pending = false
      if (this.opened || !analytics.available || analytics.consent !== null || this.screens.active === 'game') return
      if (document.querySelector<HTMLElement>('.app')!.inert || !document.getElementById('splash')!.hidden) return
      this.opened = true; this.modal.open(this.decline)
    })
  }
}
