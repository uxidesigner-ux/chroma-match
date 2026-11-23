import './royal.css'
import { Game, type GameHooks } from './game/game.ts'
import { makeGeom } from './game/types.ts'
import type { RoyalOptions } from './game/royal.ts'
import { ALL_ITEMS, type Item } from './game/items.ts'
import { Renderer } from './render/renderer.ts'
import { Effects } from './render/particles.ts'
import { setSkin, skinById } from './render/skins/index.ts'
import { styleFor } from './render/theme.ts'
import { attachInput } from './input.ts'
import { Sfx } from './audio.ts'
import { setLanguage } from './i18n/index.ts'
import { DEFAULT_SETTINGS, normalizeSettings, type RoyalSettings } from './royal-settings.ts'

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const input = (id: string) => el<HTMLInputElement>(`setting-${id}`)
const SETTINGS_KEY = 'chroma-royal:settings:v1'
const PROGRESS_KEY = 'chroma-royal:progress:v1'
let storageAvailable = true
function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); storageAvailable = true }
  catch { storageAvailable = false }
  el('save-state').textContent = storageAvailable ? '기기에 저장됨' : '저장 불가 · 이번 세션만 유지'
}
let settings: RoyalSettings = normalizeSettings(read(SETTINGS_KEY))
const rawProgress = read(PROGRESS_KEY)
const completed = new Set<number>(Array.isArray(rawProgress) ? rawProgress.filter((v): v is number => Number.isInteger(v) && v >= 1 && v <= 999) : [])
const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog')]
const canvas = el<HTMLCanvasElement>('board')
const sfx = new Sfx()
sfx.enabled = settings.sound
setSkin(skinById('royal')!, false)
setLanguage('ko')
let armed: Item | null = null
let resultPending: ReturnType<typeof setTimeout> | undefined
let waitingResult: boolean | null = null
let bannerTimer: ReturnType<typeof setTimeout> | undefined
let lastFrame = performance.now(), time = 0, lastHud = ''
const effects = new Effects(() => settings.calm || matchMedia('(prefers-reduced-motion: reduce)').matches)
const hooks: Partial<GameHooks> = {
  onClear(cells, kind, combo, points) {
    const colour = styleFor(Math.max(0, kind)).base
    for (const cell of cells) { const p = renderer.centreOf(cell); effects.burst(p.x, p.y, colour, 7) }
    const p = renderer.centreOf(cells[Math.floor(cells.length / 2)] ?? 0)
    effects.float(p.x, p.y, `+${points}`, '#fff5aa', 1)
    sfx.clear(combo)
    if (combo >= 2) banner(combo >= 4 ? 'ROYAL COMBO!' : `멋져요! ×${combo}`)
  },
  onPowerCreated(cell) { const p = renderer.centreOf(cell); effects.impact(p.x, p.y, '#ffdf65', renderer.cellSize); effects.burst(p.x,p.y,'#ffed9d',20); sfx.power() },
  onStrike(blasts) {
    renderer.hit(.65); sfx.strike(.65)
    for (const blast of blasts) { const p = renderer.centreOf(blast.cell); effects.impact(p.x,p.y,'#fff0b3',renderer.cellSize); effects.burst(p.x,p.y,'#ffd76a',15) }
  },
  onFusion() { banner('ROYAL FUSION!'); renderer.hit(1); sfx.power() },
  onSwapAccepted() { sfx.swap() }, onInvalidSwap() { sfx.reject() }, onShuffle() { banner('새로운 기회!'); sfx.shuffle() },
  onItemUsed(item, cell) { const p=renderer.centreOf(cell); effects.impact(p.x,p.y,'#fff3c2',renderer.cellSize); sfx.power(); if(item !== 'shuffle') setArmed(null) },
  onFever() { banner('왕의 피버!'); sfx.levelUp() },
  onLevelComplete() {
    completed.add(game.level); write(PROGRESS_KEY,[...completed]); el('completed-count').textContent=`${completed.size} 완료`
    sfx.levelUp(); setArmed(null)
    resultPending=setTimeout(()=>{waitingResult=true},850)
  },
  onGameOver() { sfx.gameOver(); setArmed(null); resultPending=setTimeout(()=>{waitingResult=false},500) },
}
const game = new Game(hooks, settings.seed, makeGeom(9, 9, 4))
const renderer = new Renderer(canvas, game.geom)
const resetInput = attachInput(canvas,game,renderer,()=>sfx.unlock(),cell=>{
  if(!armed) return false
  const item=armed
  if(settings.unlimitedTools) game.items[item]=3
  const used=game.useItem(item,cell)
  if(used) setArmed(null)
  return true
})
new ResizeObserver(()=>renderer.resize()).observe(canvas)
window.addEventListener('resize',()=>renderer.resize())
function royalOptions(): RoyalOptions {
  return { level:settings.level,difficulty:settings.difficulty,shape:settings.shape,
    ...(settings.autoDensity ? {} : {obstacleDensity:settings.obstacleDensity}),
    ...(settings.moves ? {moves:settings.moves}:{}),seed:(settings.seed + settings.level*7919)>>>0 }
}
function applyPreferences(): void {
  sfx.enabled=settings.sound; document.documentElement.dataset.calm=String(settings.calm)
  el('sound').textContent=settings.sound ? '♪ 소리 켜짐':'♪ 소리 꺼짐'
  el('sound').setAttribute('aria-pressed',String(settings.sound))
  el('sound').setAttribute('aria-label',settings.sound?'소리 끄기':'소리 켜기')
}
function start(): void {
  clearTimeout(resultPending); waitingResult=null; clearTimeout(bannerTimer)
  dialogs.forEach(d=>{if(d.open)d.close()})
  game.startRoyal(royalOptions()); resetInput(); setArmed(null); effects.update(10)
  el('combo-banner').classList.remove('show'); el('combo-banner').textContent=''
  if(settings.unlimitedMoves) game.moves=9999
  lastHud=''; applyPreferences(); write(SETTINGS_KEY,settings)
  el('completed-count').textContent=`${completed.size} 완료`
  renderer.resize(); renderHud(); renderer.draw(game,effects,time)
}
function setArmed(item: Item|null): void {
  armed=item; renderer.aimItem=item; renderer.aimCell=null; game.selected=null; game.cancelPress()
  for(const button of document.querySelectorAll<HTMLElement>('[data-tool]')) {
    const active=button.dataset.tool===item; button.classList.toggle('selected',active); button.setAttribute('aria-pressed',String(active))
  }
  const labels:Record<Item,string>={hammer:'망치로 없앨 블록을 눌러주세요',rocket:'로켓으로 지울 가로줄을 골라주세요',bow:'활로 지울 세로줄을 골라주세요',bomb:'폭탄을 터뜨릴 위치를 골라주세요',shuffle:'새로운 보석 배치를 준비해요'}
  el('game-tip').textContent=item?labels[item]:'같은 보석 3개를 맞춰 보세요!'
}
function banner(message:string): void {
  clearTimeout(bannerTimer); const b=el('combo-banner'); b.textContent=message; b.classList.remove('show')
  void b.offsetWidth; b.classList.add('show'); bannerTimer=setTimeout(()=>b.classList.remove('show'),1400)
}
function renderHud():void {
  const signature=[game.level,game.moves,game.progress,game.need,game.royalRemaining,game.feverCharge,game.feverTurns,game.status,game.busy,...ALL_ITEMS.map(i=>game.items[i])].join(':')
  if(signature===lastHud)return; lastHud=signature
  el('level-label').textContent=`레벨 ${game.level}`
  el('difficulty-label').textContent=({easy:'편안한 산책',normal:'왕실의 정원',hard:'왕의 도전'} as const)[settings.difficulty]
  const remaining=Math.max(0,game.need-game.progress)
  el('goal-count').textContent=remaining ? remaining.toLocaleString('ko-KR'):'✓'
  el('obstacle-count').textContent=game.royalRemaining?String(game.royalRemaining):'✓'
  el('moves').textContent=settings.unlimitedMoves?'∞':String(game.moves)
  document.querySelector('.moves-card')!.classList.toggle('urgent',!settings.unlimitedMoves&&game.moves<=5)
  el('moves-caption').textContent=settings.unlimitedMoves?'자유롭게 즐겨요':game.moves<=5?'조금만 더 힘내요!':'천천히 생각해요'
  el('score').textContent=game.score.toLocaleString('ko-KR')
  const totalObstacles=game.royal?.obstacles.length??0
  const scoreRatio=Math.min(1,game.progress/game.need)
  const progress=totalObstacles?(scoreRatio+(totalObstacles-game.royalRemaining)/totalObstacles)/2:scoreRatio
  el('progress-fill').style.width=`${progress*100}%`
  el('fever-fill').style.width=`${Math.min(100,game.feverCharge)}%`
  const ready=game.feverCharge>=100&&!game.busy
  el('fever').classList.toggle('ready',ready)
  el('fever').setAttribute('aria-label',`왕의 피버 ${game.feverCharge}%. ${ready?'눌러서 활성화':'매치하여 충전'}`)
  el('fever-label').textContent=game.feverTurns>0?'FEVER TIME!':ready?'눌러서 피버!':'ROYAL POWER'
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')){
    const item=button.dataset.tool as Item
    button.querySelector('.tool-count')!.textContent=settings.unlimitedTools?'∞':String(game.items[item]??0)
    button.disabled=game.busy||!settings.unlimitedTools&&!(game.items[item]??0)
  }
  canvas.setAttribute('aria-busy',String(game.busy)); canvas.inert=game.status!=='playing'
}
function openDialog(id:string):void { dialogs.forEach(d=>{if(d.open)d.close()});setArmed(null);el<HTMLDialogElement>(id).showModal() }
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-close]'))button.addEventListener('click',()=>button.closest('dialog')!.close())
el('result-dialog').addEventListener('cancel',e=>{if(game.status!=='playing')e.preventDefault()})
for(const dialog of dialogs)dialog.addEventListener('close',()=>{if(game.status!=='playing'&&!dialogs.some(d=>d.open))waitingResult=game.status==='levelComplete'})
for(const dialog of dialogs)dialog.addEventListener('click',e=>{if(e.target!==dialog||dialog.id==='result-dialog'&&game.status!=='playing')return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()})
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))button.addEventListener('click',()=>{
  sfx.unlock();if(game.busy||dialogs.some(d=>d.open))return
  const item=button.dataset.tool as Item
  if(item==='shuffle'){if(settings.unlimitedTools)game.items.shuffle=3;game.useItem('shuffle',0);setArmed(null)}else setArmed(armed===item?null:item)
})
el('fever').addEventListener('click',()=>{sfx.unlock();game.activateFever()})
el('sound').addEventListener('click',()=>{settings.sound=!settings.sound;applyPreferences();sfx.unlock();write(SETTINGS_KEY,settings)})
el('restart').addEventListener('click',()=>{showConfirmRestart()})
function showConfirmRestart():void {
  el('result-icon').textContent='↻';el('result-kicker').textContent='FRESH START';el('result-title').textContent='다시 도전할까요?'
  el('result-body').textContent='같은 배치로 처음부터 시작해요. 현재 진행은 사라져요.'
  el('result-stars').hidden=true;el('result-primary').textContent='다시 시작하기';el('result-primary').onclick=start
  el('result-retry').textContent='계속 플레이';el('result-retry').onclick=()=>el<HTMLDialogElement>('result-dialog').close()
  openDialog('result-dialog')
}
function showResult(won:boolean):void {
  el('result-icon').textContent=won?'♛':'♜';el('result-kicker').textContent=won?'ROYAL VICTORY!':'ONE MORE TRY'
  el('result-title').textContent=won?'멋진 승리예요!':'한 번 더 도전해요!'
  el('result-body').textContent=won?`레벨 ${game.level} 완료 · ${game.score.toLocaleString('ko-KR')}점\n새로운 정원이 기다리고 있어요.`:`${game.score.toLocaleString('ko-KR')}점 · 남은 장애물 ${game.royalRemaining}개\n설정에서 이동 횟수를 늘려도 좋아요.`
  el('result-stars').hidden=!won
  el('result-primary').textContent=won?'다음 레벨':'다시 도전하기'
  el('result-primary').onclick=()=>{if(won)settings.level=Math.min(999,settings.level+1);start()}
  el('result-retry').textContent=won?'같은 레벨 다시하기':'이동 10회 추가'
  el('result-retry').onclick=()=>{if(won)start();else {game.moves+=10;game.status='playing';canvas.inert=false;el<HTMLDialogElement>('result-dialog').close();lastHud=''}}
  openDialog('result-dialog')
}
function fillSettings(value:RoyalSettings):void {
  input('level').value=String(value.level);input('difficulty').value=value.difficulty
  const radio=document.querySelector<HTMLInputElement>(`input[name=shape][value=${value.shape}]`);if(radio)radio.checked=true
  input('density').value=String(Math.round(value.obstacleDensity*100));input('auto-density').checked=value.autoDensity
  input('moves').value=String(value.moves);input('seed').value=String(value.seed)
  input('unlimited').checked=value.unlimitedMoves;input('tools').checked=value.unlimitedTools;input('calm').checked=value.calm;paintDensity()
}
function paintDensity():void {el('density-value').textContent=input('auto-density').checked?'레벨별 자동':`${input('density').value}%`;input('density').disabled=input('auto-density').checked}
function openSettings():void {fillSettings(settings);openDialog('settings-dialog')}
for(const id of ['settings-open','workshop-open','result-settings'])el(id).addEventListener('click',openSettings)
input('density').addEventListener('input',paintDensity);input('auto-density').addEventListener('change',paintDensity)
el('settings-reset').addEventListener('click',()=>fillSettings(DEFAULT_SETTINGS))
el('settings-form').addEventListener('submit',e=>{
  e.preventDefault()
  settings=normalizeSettings({level:Number(input('level').value),difficulty:input('difficulty').value,shape:document.querySelector<HTMLInputElement>('input[name=shape]:checked')!.value,
    obstacleDensity:Number(input('density').value)/100,autoDensity:input('auto-density').checked,moves:Number(input('moves').value),seed:Number(input('seed').value),
    unlimitedMoves:input('unlimited').checked,unlimitedTools:input('tools').checked,calm:input('calm').checked,sound:settings.sound})
  start()
})
function openLevels():void {
  const grid=el('level-grid');grid.replaceChildren()
  for(let level=1;level<=60;level++){
    const button=document.createElement('button');button.textContent=String(level);button.classList.toggle('complete',completed.has(level));button.classList.toggle('current',settings.level===level)
    button.setAttribute('aria-label',`레벨 ${level}${completed.has(level)?', 완료':''}`)
    button.addEventListener('click',()=>{settings.level=level;start()});grid.append(button)
  }openDialog('levels-dialog')
}
for(const id of ['levels-open','level-picker'])el(id).addEventListener('click',openLevels)
el('custom-level').addEventListener('click',openSettings);el('help-open').addEventListener('click',()=>openDialog('help-dialog'))
function frame(now:number):void {
  const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now
  if(!document.hidden&&!dialogs.some(d=>d.open)){
    if(waitingResult!==null){const won=waitingResult;waitingResult=null;showResult(won);requestAnimationFrame(frame);return}
    time+=dt
    if(settings.unlimitedMoves&&game.status==='playing')game.moves=9999
    if(settings.unlimitedTools)for(const item of ALL_ITEMS)game.items[item]=3
    game.update(dt);effects.update(dt);renderer.settle(dt);renderer.draw(game,effects,time);renderHud()
  }
  requestAnimationFrame(frame)
}
start();requestAnimationFrame(frame)
// This private entry deliberately imports no account, analytics, ranking or payment modules.
// A previous published build's worker must not serve stale legacy screens here.
if('serviceWorker' in navigator)void navigator.serviceWorker.getRegistrations().then(registrations=>{
  for(const registration of registrations)if(new URL(registration.scope).pathname===new URL(import.meta.env.BASE_URL,location.href).pathname)void registration.unregister()
}).catch(()=>{})
