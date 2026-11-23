import './home.css'
import { iconData } from './art.ts'
import { MAX_LEVEL, normalizeLevelId } from './progression.ts'

export interface HomeState {
  level: number; stars: number; coins: number; completed: number; streak: number;
  tasks: number; superActive: boolean; lightWins: number;
  customBoardName?: string;
}
export interface HomeCallbacks {
  getState: () => HomeState;
  onPlay: () => void; onLevels: () => void; onKingdom: () => void;
  onSettings: () => void; onEditor: () => void; onHelp: () => void;
}
export interface HomeController {
  show: () => void; hide: () => void; refresh: () => void; isVisible: () => boolean;
  showSplash: () => void;
}
const base = import.meta.env.BASE_URL
const localArtwork = (name: string): string => `${base}royal/${name}`
const sceneFallback = localArtwork('castle-courtyard.webp')
const homeArt = localArtwork('home-castle-v4.webp')
const entryArt = localArtwork('entry-garden-v4.webp')
const sceneDeadlineMs = 1800

async function within<T>(pending: Promise<T>, milliseconds: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), milliseconds) })
  try { return await Promise.race([pending.catch(() => null), deadline]) }
  finally { clearTimeout(timer) }
}

/** Most lobby icons share the same prepared raster assets as the board. */
function homeIcon(kind: 'coin' | 'heart' | 'castle' | 'map' | 'bell' | 'chest' | 'home'): string {
  return iconData(kind)
}

const image = (src: string, className = ''): string => `<img src="${src}" class="${className}" alt="" draggable="false"/>`
const logo = (): string => `<div class="royale-wordmark" role="img" aria-label="Chroma Royale"><span>CHROMA</span><strong>ROYALE</strong><i aria-hidden="true"></i></div>`

/** A separate home layer: game state stays owned by app.ts and pauses while this layer is visible. */
export function mountHome(container: HTMLElement, callbacks: HomeCallbacks): HomeController {
  container.classList.add('royale-home-host')
  const shell = document.createElement('section')
  shell.className = 'royale-home'
  shell.setAttribute('aria-label', '나의 왕국 홈')
  shell.style.setProperty('--home-scene', `url("${sceneFallback}")`)
  shell.innerHTML = `
    <div class="home-scene" aria-hidden="true"></div>
    <div class="home-atmosphere" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <header class="home-resource-bar">
      <button class="home-profile" data-home-action="kingdom" aria-label="내 왕국과 보상 보기">${image(localArtwork('king-portrait-v4.webp'))}</button>
      <button class="home-resource coin-resource" data-home-action="kingdom" aria-label="보유 코인 보기">${image(homeIcon('coin'))}<strong data-home-value="coins">0</strong><span class="resource-plus" aria-hidden="true">+</span></button>
      <div class="home-resource heart-resource" aria-label="무제한 하트">${image(homeIcon('heart'))}<strong>∞</strong><small>무제한</small></div>
      <button class="home-resource star-resource" data-home-action="kingdom" aria-label="별로 정원 꾸미기">${image(iconData('star'))}<strong data-home-value="stars">0</strong></button>
      <button class="home-setting-button" data-home-action="settings" aria-label="홈에서 게임 설정">${image(iconData('settings'))}</button>
    </header>
    <div class="home-content">
      <div class="home-side-actions home-left-actions">
        <button class="home-event home-event-blue" data-home-action="levels" aria-label="레벨 지도 열기"><span class="event-disc">${image(homeIcon('map'))}</span><strong>레벨 지도</strong><small data-home-value="completed">0개 완료</small></button>
        <button class="home-event home-event-purple" data-home-action="help" aria-label="특수 블록과 조합 안내"><span class="event-disc">${image(iconData('lightball'))}</span><strong>마법의 조합</strong><small>10가지 조합</small></button>
      </div>
      <div class="home-side-actions home-right-actions">
        <button class="home-event home-event-gold" data-home-action="kingdom" aria-label="집사의 선물과 왕국 진행 보기"><span class="event-disc">${image(homeIcon('bell'))}</span><strong>집사의 선물</strong><small data-home-value="streak">0/3</small></button>
        <button class="home-event home-event-green" data-home-action="editor" aria-label="나만의 보드 만들기"><span class="event-disc">${image(iconData('paintbrush'))}</span><strong>나만의 보드</strong><small>직접 만들기</small></button>
      </div>
    </div>
    <div class="home-bottom-content">
      <button class="home-play-button" data-home-action="play" id="home-play"><span class="play-button-trim"></span><span class="play-button-content"><strong data-home-value="level">레벨 1</strong></span><span class="play-button-glint"></span></button>
      <button class="home-task-banner" data-home-action="kingdom" aria-label="왕실 정원 작업 보기"><span class="task-icon">${image(homeIcon('chest'))}</span><span class="task-copy"><strong>왕실 정원</strong><small class="sr-only">별을 모아 정원을 완성하세요</small></span><span class="home-task-progress"><b data-home-value="tasks">0/6</b><i><i data-home-fill="tasks"></i></i></span></button>
    </div>
    <nav class="home-bottom-nav" aria-label="왕국 메뉴">
      <button class="home-level-link" data-home-action="levels" aria-label="다른 레벨 선택">${image(iconData('book'))}<span>레벨</span></button>
      <button data-home-action="kingdom">${image(iconData('star'))}<span>왕국</span></button>
      <button class="active" data-home-action="home" aria-current="page">${image(homeIcon('home'))}<span>홈</span></button>
      <button data-home-action="editor">${image(iconData('paintbrush'))}<span>만들기</span></button>
      <button data-home-action="settings">${image(iconData('settings'))}<span>설정</span></button>
    </nav>
  `
  const splash = document.createElement('section')
  splash.className = 'royale-entry'
  splash.hidden = true
  splash.setAttribute('aria-label', 'Chroma Royale 시작 화면')
  splash.style.setProperty('--entry-scene', `url("${sceneFallback}")`)
  splash.innerHTML = `<div class="entry-background" aria-hidden="true"></div><div class="entry-top">${logo()}</div><div class="entry-bottom"><button class="home-play-button entry-start" id="home-enter"><span class="play-button-trim"></span><span class="play-button-content"><strong>왕국으로 들어가기</strong></span><span class="play-button-glint"></span></button><p class="entry-message" role="status" aria-live="polite">나만의 속도로, 나만의 왕국에서</p></div>`
  container.replaceChildren(shell, splash)
  let requestedView: 'home' | 'entry' | 'hidden' = 'home'
  let homeSceneReady = false
  let focusPlayOnReveal = false

  function setPreparing(preparing: boolean): void {
    splash.querySelector<HTMLButtonElement>('#home-enter')!.setAttribute('aria-busy', String(preparing))
    splash.querySelector<HTMLElement>('#home-enter strong')!.textContent = preparing ? '정원 준비 중…' : '왕국으로 들어가기'
    splash.querySelector<HTMLElement>('.entry-message')!.textContent = preparing ? '왕실 정원의 배경을 불러오고 있어요.' : '나만의 속도로, 나만의 왕국에서'
  }

  function revealHome(): void {
    if (requestedView !== 'home') return
    setPreparing(false)
    shell.hidden = false
    splash.hidden = true
    if (focusPlayOnReveal) {
      shell.querySelector<HTMLButtonElement>('#home-play')!.focus({ preventScroll: true })
      focusPlayOnReveal = false
    }
  }

  const actionMap: Record<string, () => void> = {
    play: callbacks.onPlay, levels: callbacks.onLevels, kingdom: callbacks.onKingdom,
    settings: callbacks.onSettings, editor: callbacks.onEditor, help: callbacks.onHelp,
    home: () => { shell.querySelector<HTMLButtonElement>('#home-play')?.focus({ preventScroll: true }) },
  }
  for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-home-action]')) {
    button.addEventListener('click', () => actionMap[button.dataset.homeAction ?? '']?.())
  }
  splash.querySelector<HTMLButtonElement>('#home-enter')!.addEventListener('click', () => {
    focusPlayOnReveal = true
    show()
  })
  // Keep the decoded bitmap in the DOM. Swapping a hidden CSS background caused
  // Chrome to decode it again on first reveal, briefly painting an empty lobby.
  const decodedImage = async (src: string): Promise<HTMLImageElement> => {
    const asset = new Image()
    asset.alt = ''
    asset.draggable = false
    asset.decoding = 'sync'
    asset.className = 'royale-scene-art'
    asset.src = src
    await asset.decode()
    return asset
  }
  const prepareScene = async (src: string, target: HTMLElement, selector: string, property: string): Promise<void> => {
    const scene = target.querySelector<HTMLElement>(selector)!
    let primaryShown = false
    const display = (asset: HTMLImageElement): void => {
      scene.replaceChildren(asset)
      scene.classList.add('has-scene-art')
      target.style.setProperty(property, `url("${asset.src}")`)
    }
    const primary = decodedImage(src)
    void primary.then(asset => { primaryShown = true; display(asset) }).catch(() => {})
    if (await within(primary, sceneDeadlineMs)) return
    const fallback = decodedImage(sceneFallback)
    void fallback.then(asset => { if (!primaryShown) display(asset) }).catch(() => {})
    // A slow request must not hold navigation indefinitely. Both promises keep
    // upgrading their decoded artwork later without changing the requested view.
    await within(Promise.any([primary, fallback]), sceneDeadlineMs)
  }
  void prepareScene(homeArt, shell, '.home-scene', '--home-scene').then(() => {
    homeSceneReady = true
    revealHome()
  })
  void prepareScene(entryArt, splash, '.entry-background', '--entry-scene')
  const wordmark = new Image()
  wordmark.alt = ''
  wordmark.draggable = false
  wordmark.className = 'royale-wordmark-art'
  wordmark.onload = async () => {
    try { await wordmark.decode() } catch { return }
    const brand = splash.querySelector<HTMLElement>('.royale-wordmark')!
    brand.replaceChildren(wordmark)
    brand.classList.add('has-art')
  }
  wordmark.src = localArtwork('wordmark-v4.webp')

  function refresh(): void {
    const state = callbacks.getState()
    const integer = (value: number, min = 0, max = 99999999): number => Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : min
    const levels = normalizeLevelId(state.level), tasks = integer(state.tasks, 0, 6), streak = integer(state.streak, 0, 3)
    const values: Record<string, string> = {
      level: state.customBoardName ? '나만의 보드' : `레벨 ${levels}`, coins: integer(state.coins).toLocaleString('ko-KR'), stars: integer(state.stars).toLocaleString('ko-KR'),
      completed: `${integer(state.completed, 0, MAX_LEVEL).toLocaleString('ko-KR')}개 완료`, tasks: `${tasks}/6`, streak: `${streak}/3`,
    }
    for (const node of shell.querySelectorAll<HTMLElement>('[data-home-value]')) node.textContent = values[node.dataset.homeValue ?? ''] ?? ''
    shell.querySelector<HTMLElement>('[data-home-value="level"]')!.dataset.longLevel = String(String(levels).length > 8)
    shell.querySelector<HTMLElement>('[data-home-fill="tasks"]')!.style.width = `${tasks / 6 * 100}%`
    shell.querySelector<HTMLButtonElement>('#home-play')!.setAttribute('aria-label', state.customBoardName ? `${state.customBoardName} 이어하기` : `레벨 ${levels} 플레이`)
    shell.querySelector<HTMLButtonElement>('.coin-resource')!.setAttribute('aria-label', `보유 코인 ${values.coins}개, 왕국 보기`)
    shell.querySelector<HTMLButtonElement>('.star-resource')!.setAttribute('aria-label', `보유 별 ${values.stars}개, 정원 꾸미기`)
    const taskCopy = shell.querySelector<HTMLElement>('.home-task-banner small')!
    taskCopy.textContent = tasks === 6 ? '왕실 정원을 모두 완성했어요!' : '별을 모아 정원을 완성하세요'
    const magicLabel = shell.querySelector<HTMLElement>('.home-event-purple small')!
    magicLabel.textContent = state.superActive ? '슈퍼 라이트볼 활성' : levels >= 292 ? `슈퍼 충전 ${integer(state.lightWins, 0, 10)}/10` : '10가지 조합'
    shell.classList.toggle('home-super-active', state.superActive)
  }
  function show(): void {
    refresh()
    requestedView = 'home'
    container.hidden = false
    if (homeSceneReady) revealHome()
    else { setPreparing(true); shell.hidden = true; splash.hidden = false }
  }
  function hide(): void { requestedView = 'hidden'; focusPlayOnReveal = false; setPreparing(false); container.hidden = true }
  refresh()
  return {
    show, hide, refresh, isVisible: () => !container.hidden,
    showSplash: () => { refresh(); requestedView = 'entry'; setPreparing(false); container.hidden = false; shell.hidden = true; splash.hidden = false },
  }
}
