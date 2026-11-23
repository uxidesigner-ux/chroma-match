import './royal.css'
import './polish.css'
import { mountHome } from './home.ts'
import './fidelity.css'
import './tactile.css'
import './progression.css'
import './board-layout.css'
import { installPressFeedback } from './press.ts'
import { RoyalFeedback } from './feedback.ts'
import { initRoyalArt } from './art.ts'
import { registerRoyalPwa, applyRoyalUpdate } from './pwa.ts'
import { RoyalEngine } from './engine.ts'
import { RoyalRenderer, iconData } from './renderer.ts'
import { CAMPAIGN_MAX_COLS, CAMPAIGN_MAX_ROWS, getLevel, validateLevel } from './levels.ts'
import { MAX_LEVEL, isLevelId, nextLevelId, levelPageRange } from './progression.ts'
import { obstacleDamage } from './obstacle-damage.ts'
import { COLOUR_NAMES, GOAL_NAMES, DIFFICULTY_NAMES, cellPlayable, type LevelDefinition, type Tool, type GoalState, type Power, type ObstacleState } from './model.ts'
import { DEFAULT_PREFS, PREFS_KEY, PROGRESS_KEY, CUSTOM_KEY, normalizePreferences, normalizeProgress, rewardWin, recordLoss, startingPowers, hasCompleted, completedCount } from './preferences.ts'
import { mountWorkshop } from './workshop.ts'

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const picture=(kind:string,colour?:number)=>`<img src="${iconData(kind,colour)}" alt="" draggable="false"/>`
function read(key:string):unknown{try{return JSON.parse(localStorage.getItem(key)??'null')}catch{return null}}
let storageAvailable=true
function save(key:string,value:unknown):void{try{localStorage.setItem(key,JSON.stringify(value));storageAvailable=true}catch{storageAvailable=false}if($('storage-note'))$('storage-note').textContent=storageAvailable?'이 브라우저에 저장됩니다':'저장 공간을 사용할 수 없어 이번 세션만 유지됩니다'}
let prefs=normalizePreferences(read(PREFS_KEY)??read('chroma-royal:settings:v1'))
let progress=normalizeProgress(read(PROGRESS_KEY)??{completed:read('chroma-royal:progress:v1')})
let custom:LevelDefinition|null=null
const storedCustom=validateLevel(read(CUSTOM_KEY));if(storedCustom.level)custom=storedCustom.level
const app=$('app')
await initRoyalArt()
app.innerHTML=`
<div class="world" aria-hidden="true"></div><div id="home-mount"></div>
<main class="game-shell" aria-label="Chroma Royale 왕실 퍼즐">
 <header class="topbar"><button class="round-button" id="game-home" aria-label="홈으로">${picture('castle')}</button><button id="level-picker" class="level-pill"><small>CHROMA ROYALE</small><strong id="level-label">레벨 1</strong></button><button class="round-button" id="restart" aria-label="현재 레벨 다시 시작">↻</button></header>
 <div class="game-hud"><section class="hud-card objectives" aria-label="남은 목표"><h2>목표</h2><div id="goals" class="goal-grid"></div></section><div class="king-medallion"><div class="portrait"></div><div class="super-badge" id="super-badge">${picture('lightball')}<span id="super-count">ROYAL</span></div></div><section class="hud-card moves-card"><h2>이동 횟수</h2><strong id="moves">30</strong><span id="difficulty-label"></span></section></div>
 <div class="mission-caption"><div class="mission-title"><span id="mission-name"></span><span id="mission-kind"></span></div><div class="game-tip" id="game-tip">같은 색 3개를 맞춰 목표를 모으세요</div></div>
 <div class="stage"><canvas id="board" tabindex="0" role="application" aria-label="퍼즐 보드. 방향키로 이동, Shift와 방향키로 교환, Enter로 선택하거나 특수 블록을 발동하세요" aria-describedby="board-status"></canvas><div id="combo-banner" class="combo-banner" aria-live="polite"></div></div>
 <p class="sr-only" id="board-status" aria-live="polite"></p>
 <nav class="tools" aria-label="게임 도구">${(['hammer','arrow','cannon','shuffle'] as Tool[]).map((tool,i)=>`<button class="tool" data-tool="${tool}" aria-label="${['망치: 한 칸','화살: 가로줄','대포: 세로줄','광대 모자: 재배치'][i]}">${picture(tool)}<span class="tool-count">3</span><span class="tool-name">${['망치','화살','대포','광대 모자'][i]}</span></button>`).join('')}<button class="tool settings-tool" id="settings-open" aria-label="게임 설정">${picture('settings')}<span class="tool-name">설정</span></button></nav>
 <footer class="bottom-bar"><button id="editor-open">보드 만들기</button><button id="kingdom-open" aria-label="나의 왕국"><span id="star-balance">★ 0</span></button><button id="help-open" aria-label="게임 방법">게임 방법</button></footer>
</main>
<div id="toast" role="status"></div>
<dialog id="settings-dialog" class="royal-dialog"><header class="dialog-heading"><h2>나만의 게임 설정</h2><button class="close-button" data-close aria-label="설정 닫기">×</button></header><form id="settings-form" class="panel-body">
 <div class="field-grid"><label>시작 레벨<input id="setting-level" type="number" min="1" max="${MAX_LEVEL}" required/></label><label>이동 횟수 <small>0 = 레벨 기본값</small><input id="setting-moves" type="number" min="0" max="999" required/></label><label>배치 번호<input id="setting-seed" type="number" min="1" max="2147483647" required/></label><label>게임 속도<select id="setting-speed"><option value="0.7">여유롭게</option><option value="1">기본</option><option value="1.4">빠르게</option></select></label></div>
 <label class="switch-row"><span>재도전마다 새로운 블록 배치<small>끄면 같은 배치 번호로 다시 시작해요</small></span><input id="setting-randomRetry" type="checkbox" role="switch" switch/></label>
 <label class="switch-row"><span>무제한 이동</span><input id="setting-unlimitedMoves" type="checkbox" role="switch" switch/></label>
 <label class="switch-row"><span>무제한 도구</span><input id="setting-unlimitedTools" type="checkbox" role="switch" switch/></label>
 <label class="switch-row"><span>슈퍼 라이트볼 바로 사용<small>라이트볼 효과를 두 번 발동해요</small></span><input id="setting-forceSuper" type="checkbox" role="switch" switch/></label>
 <fieldset><legend>시작 부스터</legend><div class="booster-options" id="settings-boosters"></div></fieldset>
 <div class="preference-grid">${[['sound','효과음'],['haptics','진동'],['hints','힌트'],['calm','효과 줄이기']].map(([key,label])=>`<label><input id="setting-${key}" type="checkbox"/>${label}</label>`).join('')}</div>
 <p id="haptics-note" class="fine-print" role="status"></p><button id="feedback-test" class="blue-button" type="button">버튼 피드백 확인</button>
 <p id="storage-note" class="fine-print">이 브라우저에 저장됩니다</p><button class="green-button" type="submit">이 설정으로 시작하기</button><button class="text-button" id="settings-reset" type="button">기본 설정 채우기</button></form></dialog>
<dialog id="levels-dialog" class="royal-dialog"><header class="dialog-heading"><h2>레벨 선택</h2><button class="close-button" data-close aria-label="레벨 선택 닫기">×</button></header><div class="panel-body"><p class="dialog-lead">새로운 보드, 새로운 도전</p><form id="jump-form" class="jump-form"><label class="sr-only" for="level-jump">이동할 레벨</label><input id="level-jump" type="number" min="1" max="${MAX_LEVEL}" required/><button class="blue-button" type="submit">이동</button></form><button class="reference-button" id="reference-level"><strong>레벨 12297</strong><span>공유한 영상의 보드로 플레이</span><small>중간 장면을 바탕으로 재구성한 판입니다</small></button><div id="level-grid"></div><div class="pagination"><button class="blue-button" id="levels-prev">이전</button><span id="levels-page"></span><button class="blue-button" id="levels-next">다음</button></div><p class="fine-print">일반 판은 최대 ${CAMPAIGN_MAX_COLS}열 × ${CAMPAIGN_MAX_ROWS}행으로 구성해요. 33판부터는 다음 판을 계속 만들어 드려요. 영상 참고판과 직접 만든 보드는 원래 크기를 유지해요.</p></div></dialog>
<dialog id="result-dialog" class="royal-dialog result-dialog"><div class="result-frame"><aside class="result-super-badge" id="result-super-badge">${picture('super-lightball')}<strong id="result-super-count"></strong></aside><header class="dialog-heading"><svg class="result-ribbon" viewBox="0 0 400 126" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="result-blue" x2="1" y2=".3"><stop stop-color="#2279bd"/><stop offset=".6" stop-color="#1b65ae"/><stop offset="1" stop-color="#175294"/></linearGradient></defs><path d="M5 37 Q200 -9 395 37 L395 117 Q200 71 5 117Z" fill="url(#result-blue)" stroke="#06457a" stroke-width="13"/><path d="M5 37 Q200 -9 395 37 L395 117 Q200 71 5 117Z" fill="url(#result-blue)" stroke="#ee8501" stroke-width="8"/><path d="M5 35 Q200 -11 395 35 M5 113 Q200 67 395 113" fill="none" stroke="#ffe143" stroke-width="5"/><path d="M6 28 Q200 -17 394 28" fill="none" stroke="#65cef3" stroke-width="3"/></svg><h2 id="result-level">레벨 1</h2><button class="close-button" data-close aria-label="결과 닫기">×</button></header><div class="panel-body"><h3 class="result-message"><span class="result-heart">${picture('heart-broken')}</span><span id="result-title"></span></h3><div class="result-goals" id="result-goals"></div><p id="result-body"></p><div id="win-reward" class="win-reward">${picture('star')}<strong>+1</strong></div><div id="retry-boosters"><h3>부스터를 고르세요</h3><div class="booster-options" id="result-boosters"></div></div></div><div class="result-actions"><button class="green-button" id="result-primary">다시 시도하기</button><button class="blue-button" id="result-secondary">계속 플레이</button></div></div><div class="butler-strip"><span class="butler-bell">${picture('bell')}</span><div><strong>집사의 선물</strong><div class="butler-meter"><span id="butler-meter"></span><b id="butler-count">0/3</b></div></div></div></dialog>
<dialog id="kingdom-dialog" class="royal-dialog"><header class="dialog-heading"><h2>나의 왕실 정원</h2><button class="close-button" data-close aria-label="왕국 닫기">×</button></header><div class="panel-body"><div class="kingdom-view"><div class="kingdom-art"></div><span id="kingdom-stage"></span></div><div class="kingdom-balance"><span id="kingdom-stars"></span><span id="kingdom-coins"></span></div><p class="dialog-lead">퍼즐에서 모은 별로 정원을 꾸며보세요</p><div id="kingdom-tasks"></div></div></dialog>
<dialog id="help-dialog" class="royal-dialog"><header class="dialog-heading"><h2>왕실 퍼즐 안내서</h2><button class="close-button" data-close aria-label="안내 닫기">×</button></header><div class="panel-body"><p>이웃한 블록을 드래그하거나 차례로 눌러 교환하세요. <strong>이동 횟수 안에 왼쪽 위 목표를 모두 완료</strong>하면 승리해요.</p><div class="help-powers">${[['rocket-h','4개 일자','가로·세로 로켓'],['propeller','2×2 정사각형','목표로 날아가는 프로펠러'],['tnt','5개 L·T 모양','넓게 터지는 TNT'],['lightball','5개 일자','같은 색을 지우는 라이트볼']].map(([p,pattern,label])=>`<div>${picture(p!)}<span><b>${pattern}</b><small>${label}</small></span></div>`).join('')}</div><p>특수 블록은 한 번 눌러도 발동해요. 이웃한 특수 블록끼리 교환하면 <strong>10가지 조합 효과</strong>를 사용할 수 있어요.</p><p>장애물은 판자·보강재가 떨어지고 균열이 커질수록 제거에 가까워져요. 작은 타격 표식은 완전히 제거하기까지 남은 유효 타격 횟수예요. 장애물을 누르면 남은 횟수를 확인할 수 있어요. 선물상자는 포장을 벗겨 장난감을 꺼내요. 돌은 특수 블록으로 깨고, 뻐꾸기는 문이 열렸을 때 모아요. <strong>젤리는 위에서 매치해 퍼뜨려요.</strong></p><p>도구는 이동을 쓰지 않아요. 화살은 가로줄, 대포는 세로줄을 지웁니다. 움직이는 칸은 잠시 기다리고, 안정된 다른 열에서는 계속 매치할 수 있어요.</p><p class="install-guide"><strong>아이폰에 게임 추가하기</strong><br/>Safari에서 실행 주소를 열고 공유 버튼 → 홈 화면에 추가를 선택하세요. 한 번 실행한 뒤에는 인터넷 없이도 이 기기의 저장 기록으로 플레이할 수 있어요.</p><p class="fine-print">키보드: 방향키로 칸 이동 · Shift+방향키로 이웃 블록 교환 · Enter/Space로 선택·특수 블록 발동 · Escape로 취소<br/>설정·완료 기록·별·직접 만든 보드는 이 기기에 저장돼요. 진행 중인 판은 새로고침 시 다시 시작합니다.</p><button class="green-button" data-close>알겠어요!</button></div></dialog>
<dialog id="editor-dialog" class="royal-dialog workshop-dialog"></dialog>`

const canvas=$<HTMLCanvasElement>('board'),feedback=new RoyalFeedback()
const disposePress=installPressFeedback(document.body,()=>feedback.button())
import.meta.hot?.dispose(()=>{disposePress();feedback.destroy()})
let home:ReturnType<typeof mountHome>|undefined
let engine:RoyalEngine,renderer:RoyalRenderer,activeLevel:LevelDefinition, selected:number|null=null, hintCell:number|null=null, cursor=0,armed:Tool|null=null
let attempt=0,simTime=0,lastTime=performance.now(),idleTime=0,resultDelay=-1,resultRecorded=false
let resultMode:'win'|'lose'|'restart'='restart',levelPage=Math.floor((prefs.level-1)/30)
let superEnabled=false
let toolCounts:Record<Tool,number>={hammer:3,arrow:3,cannon:3,shuffle:3},lastHud=''
let keyboardInput=false,nativeActive=true
let toastTimer:ReturnType<typeof setTimeout>|undefined
const dialogs=()=>[...document.querySelectorAll<HTMLDialogElement>('dialog')]
const modalOpen=()=>dialogs().some(d=>d.open)
function toast(message:string):void{clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400)}
function open(id:string):void{cancelPointer();feedback.pause();const d=$<HTMLDialogElement>(id);if(!d.open)d.showModal();feedback.unlock()}
function closeAll():void{dialogs().forEach(d=>{if(d.open)d.close()})}
function store():void{save(PREFS_KEY,prefs);save(PROGRESS_KEY,progress)}
function start(level?:LevelDefinition):void{
 feedback.reset();feedback.configure(prefs)
 home?.hide();document.querySelector<HTMLElement>('.game-shell')!.hidden=false;document.documentElement.dataset.view='game'
 closeAll();activeLevel=structuredClone(level??getLevel(prefs.level));if(prefs.moves>0)activeLevel.moves=prefs.moves
 const seed=(prefs.seed+activeLevel.seed+(prefs.randomRetry?attempt++*104729:0))>>>0
 superEnabled=prefs.forceSuper||(activeLevel.id>=292&&progress.superActive)
 engine=new RoyalEngine(activeLevel,{seed,unlimitedMoves:prefs.unlimitedMoves,startingBoosters:startingPowers(prefs,progress),superLightBall:superEnabled})
 renderer?.destroy();renderer=new RoyalRenderer(canvas);renderer.resize(activeLevel)
 cancelPointer();keyboardInput=false;selected=null;hintCell=null;cursor=activeLevel.mask.join('').indexOf('1');armed=null;toolCounts={hammer:3,arrow:3,cannon:3,shuffle:3};simTime=0;idleTime=0;resultDelay=-1;resultRecorded=false;lastHud=''
 document.documentElement.dataset.calm=String(prefs.calm);store();renderHud();renderer.draw(engine.state,simTime,selected,armed,prefs.calm)
}
function goalIcon(g:GoalState):string{return picture(g.kind==='colour'?'colour':g.kind,g.colour)}
function goalName(g:GoalState):string{return g.kind==='colour'?COLOUR_NAMES[g.colour??0]:GOAL_NAMES[g.kind]}
function renderHud():void{
 const s=engine.state,signature=JSON.stringify([s.moves,s.goals,s.status,s.locked.size,s.turn,armed,toolCounts,progress.stars,prefs.unlimitedTools])
 updateStatus()
 if(signature===lastHud)return;lastHud=signature
 $('level-label').textContent=activeLevel.provenance==='custom'?'나만의 보드':`레벨 ${activeLevel.id}`
 $('level-label').dataset.longLevel=String(String(activeLevel.id).length>8)
 $('goals').innerHTML=s.goals.map(g=>`<div class="goal ${g.remaining===0?'complete':''}" aria-label="${goalName(g)} ${g.remaining} 남음">${goalIcon(g)}<strong>${g.remaining||'✓'}</strong></div>`).join('')
 $('goals').classList.toggle('many',s.goals.length>4)
 $('moves').textContent=prefs.unlimitedMoves?'∞':String(s.moves)
 $('moves').parentElement!.classList.toggle('urgent',!prefs.unlimitedMoves&&s.moves<=5)
 $('difficulty-label').textContent=DIFFICULTY_NAMES[activeLevel.difficulty];$('difficulty-label').dataset.difficulty=activeLevel.difficulty
 $('mission-name').textContent=activeLevel.name
 $('mission-kind').textContent=activeLevel.provenance==='reference-reconstruction'?'영상 참고':activeLevel.provenance==='custom'?'직접 만든 판':''
 $('star-balance').textContent=`★ ${progress.stars}`
 $('super-count').textContent=superEnabled?'SUPER':activeLevel.id>=292?`${progress.lightWins}/10`:'ROYAL'
 $('super-badge').classList.toggle('active',superEnabled)
 canvas.setAttribute('aria-busy',String(s.locked.size>0));canvas.dataset.level=String(activeLevel.id);canvas.dataset.columns=String(activeLevel.cols);canvas.dataset.rows=String(activeLevel.rows);canvas.dataset.turn=String(s.turn);canvas.dataset.status=s.status
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')){const tool=b.dataset.tool as Tool;b.classList.toggle('selected',tool===armed);b.setAttribute('aria-pressed',String(tool===armed));b.querySelector('.tool-count')!.textContent=prefs.unlimitedTools?'∞':String(toolCounts[tool]);b.disabled=s.status!=='playing'||(!prefs.unlimitedTools&&toolCounts[tool]<=0)}
}
const obstacleNames:Record<ObstacleState['kind'],string>={box:'나무상자',gift:'선물상자',ice:'얼음',stone:'돌',cuckoo:'뻐꾸기',dynamite:'다이너마이트'}
function obstacleDescription(obstacle:ObstacleState):string{
 const d=obstacleDamage(obstacle), parts=[obstacleNames[obstacle.kind],`남은 타격 ${d.remainingHits}회`]
 if(obstacle.kind==='gift')parts.push(`장난감 ${d.contentCount}개`)
 if(obstacle.kind==='cuckoo')parts.push(obstacle.open===false?'문 닫힘, 지금은 타격할 수 없어요':'문 열림',`새 ${d.contentCount}마리`,`다음 새까지 ${d.shellHits}회`)
 if(obstacle.kind==='dynamite')parts.push(`폭발 ${d.contentCount}회 남음`,`다음 폭발까지 ${d.shellHits}회`,`${COLOUR_NAMES[obstacle.colour??0]} 색 인접 매치 또는 파워업·도구로 타격`)
 if(obstacle.kind==='stone')parts.push('파워업·도구로 타격')
 return parts.join(', ')
}
function updateStatus():void{
 const c=cursor,p=engine.state.pieces[c],o=engine.state.obstacles.find(obstacle=>obstacle.cells.includes(c))
 const text=`${Math.floor(c/activeLevel.cols)+1}행 ${c%activeLevel.cols+1}열. ${o?obstacleDescription(o):p?(p.power??COLOUR_NAMES[p.colour]):'빈 칸'}. ${engine.state.locked.has(c)?'이동 중. ':''}남은 이동 ${prefs.unlimitedMoves?'무제한':engine.state.moves}.`
 if($('board-status').textContent!==text)$('board-status').textContent=text
}
function arm(tool:Tool|null):void{armed=tool;selected=null;hintCell=null;idleTime=0;const labels:Record<Tool,string>={hammer:'망치를 사용할 칸을 골라주세요',arrow:'지울 가로줄을 골라주세요',cannon:'지울 세로줄을 골라주세요',shuffle:'블록을 새롭게 섞어요'};$('game-tip').textContent=tool?labels[tool]:'같은 색 3개를 맞춰 목표를 모으세요';lastHud='';renderHud()}
function accepted():void{selected=null;hintCell=null;idleTime=0;renderer.setPress(null);feedback.unlock()}
function useTool(tool:Tool,cell?:number):void{
 if(!prefs.unlimitedTools&&toolCounts[tool]<=0){toast('도구를 모두 사용했어요. 설정에서 무제한 도구를 켤 수 있어요.');return}
 if(engine.useTool(tool,cell)){if(!prefs.unlimitedTools)toolCounts[tool]--;accepted();arm(null)}else toast('움직임이 끝난 뒤 이 칸을 다시 선택해 주세요')
}
function choose(cell:number):void{
 if(modalOpen()||engine.state.status!=='playing'||!cellPlayable(activeLevel,cell))return
 cursor=cell;hintCell=null;idleTime=0;feedback.unlock()
 if(armed){useTool(armed,cell);return}
 if(engine.state.locked.has(cell)){toast('이 칸은 움직이고 있어요. 다른 열을 선택해 보세요.');return}
 const obstacle=engine.state.obstacles.find(o=>o.cells.includes(cell))
 if(obstacle){selected=null;feedback.select();$('game-tip').textContent=`${obstacleNames[obstacle.kind]}${obstacle.kind==='cuckoo'&&obstacle.open===false?' · 문 닫힘':''} · 남은 타격 ${obstacleDamage(obstacle).remainingHits}회`;updateStatus();return}
 if(selected!==null&&selected!==cell){const previous=selected;if(engine.swap(previous,cell)){accepted();return}if(Math.abs(previous%activeLevel.cols-cell%activeLevel.cols)+Math.abs(Math.floor(previous/activeLevel.cols)-Math.floor(cell/activeLevel.cols))===1){selected=null;return}}
 if(engine.state.pieces[cell]?.power&&engine.tap(cell)){accepted();return}
 selected=selected===cell?null:cell;feedback.select();updateStatus()
}
let pointer:{id:number;x:number;y:number;cell:number;committed:boolean}|null=null
function cancelPointer():void{
 if(pointer&&canvas.hasPointerCapture(pointer.id))canvas.releasePointerCapture(pointer.id)
 pointer=null;renderer?.setPress(null)
}
function swipeTo(clientX:number,clientY:number):void{
 if(!pointer||pointer.committed||armed||modalOpen()||home?.isVisible())return
 const dx=clientX-pointer.x,dy=clientY-pointer.y
 renderer.setPress(pointer.cell,dx,dy)
 if(Math.max(Math.abs(dx),Math.abs(dy))<Math.max(10,Math.min(18,renderer.cellSize*.25)))return
 pointer.committed=true;renderer.setPress(null)
 const horizontal=Math.abs(dx)>Math.abs(dy)
 const target=pointer.cell+(horizontal?Math.sign(dx):Math.sign(dy)*activeLevel.cols)
 const sameRow=!horizontal||Math.floor(target/activeLevel.cols)===Math.floor(pointer.cell/activeLevel.cols)
 if(sameRow&&cellPlayable(activeLevel,target)&&engine.swap(pointer.cell,target)){cursor=target;accepted();updateStatus()}
 else selected=null
}
canvas.addEventListener('pointerdown',e=>{
 if(pointer||!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0)||modalOpen()||home?.isVisible())return
 feedback.unlock();keyboardInput=false
 const cell=renderer.cellAt(e.clientX,e.clientY)
 if(cell!==null){pointer={id:e.pointerId,x:e.clientX,y:e.clientY,cell,committed:false};canvas.setPointerCapture(e.pointerId);if(engine.state.status==='playing'&&!engine.state.locked.has(cell)&&engine.state.pieces[cell])renderer.setPress(cell)}
})
canvas.addEventListener('pointermove',e=>{if(pointer?.id===e.pointerId)swipeTo(e.clientX,e.clientY)})
canvas.addEventListener('pointerup',e=>{
 if(pointer?.id!==e.pointerId)return
 swipeTo(e.clientX,e.clientY)
 const gesture=pointer;cancelPointer()
 if(!gesture.committed&&!modalOpen()&&!home?.isVisible())choose(gesture.cell)
})
canvas.addEventListener('pointercancel',e=>{if(pointer?.id===e.pointerId)cancelPointer()})
canvas.addEventListener('lostpointercapture',e=>{if(pointer?.id===e.pointerId){pointer=null;renderer.setPress(null)}})
canvas.addEventListener('keydown',e=>{
 if(modalOpen()||home?.isVisible())return
 keyboardInput=true
 const dirs:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-activeLevel.cols,ArrowDown:activeLevel.cols}
 if(e.key in dirs){
  e.preventDefault()
  const horizontal=e.key==='ArrowLeft'||e.key==='ArrowRight'
  if(e.shiftKey&&!armed){
   if(e.repeat||engine.state.status!=='playing')return
   const target=cursor+dirs[e.key]!
   const sameRow=!horizontal||Math.floor(target/activeLevel.cols)===Math.floor(cursor/activeLevel.cols)
   feedback.unlock()
   if(sameRow&&cellPlayable(activeLevel,target)&&engine.swap(cursor,target)){cursor=target;accepted()}
   else{selected=null;toast('지금은 이 방향으로 교환할 수 없어요')}
   updateStatus();return
  }
  let next=cursor
  for(let i=0;i<Math.max(activeLevel.cols,activeLevel.rows);i++){
   const candidate=next+dirs[e.key]!
   if(candidate<0||candidate>=activeLevel.cols*activeLevel.rows)break
   if(horizontal&&Math.floor(candidate/activeLevel.cols)!==Math.floor(next/activeLevel.cols))break
   next=candidate
   if(cellPlayable(activeLevel,next)){cursor=next;updateStatus();break}
  }
 }else if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(cursor)}
 else if(e.key==='Escape'){e.preventDefault();selected=null;arm(null)}
})
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))b.addEventListener('click',()=>{feedback.unlock();const tool=b.dataset.tool as Tool;if(tool==='shuffle')useTool(tool);else arm(armed===tool?null:tool)})
for(const b of document.querySelectorAll<HTMLElement>('[data-close]'))b.addEventListener('click',()=>b.closest('dialog')?.close())
$('help-open').onclick=()=>open('help-dialog')
function fillBoosters(container:string):void{
 $(container).innerHTML=(['rocket-h','tnt','lightball'] as Power[]).map((p,i)=>`<label class="booster-option"><input type="checkbox" value="${p}" ${prefs.boosters.includes(p)?'checked':''}/>${picture(p)}<span>${['로켓','TNT','라이트볼'][i]}</span><small class="booster-free" aria-label="자유롭게 사용">∞</small><b>✓</b></label>`).join('')
 for(const input of $(container).querySelectorAll<HTMLInputElement>('input'))input.onchange=()=>{prefs.boosters=[...$(container).querySelectorAll<HTMLInputElement>('input:checked')].map(i=>i.value as Power);save(PREFS_KEY,prefs)}
}
function fillSettings():void{
 for(const key of ['level','moves','seed','speed'] as const)$<HTMLInputElement>(`setting-${key}`).value=String(prefs[key])
 for(const key of ['randomRetry','unlimitedMoves','unlimitedTools','forceSuper','sound','haptics','hints','calm'] as const)$<HTMLInputElement>(`setting-${key}`).checked=prefs[key]
 fillBoosters('settings-boosters')
}
$('settings-open').onclick=()=>{fillSettings();open('settings-dialog')}
$('settings-reset').onclick=()=>{const old=prefs;prefs={...DEFAULT_PREFS,boosters:[]};fillSettings();prefs=old}
$('settings-form').onsubmit=e=>{e.preventDefault();const data:Record<string,unknown>={boosters:[...$('settings-boosters').querySelectorAll<HTMLInputElement>('input:checked')].map(i=>i.value)};for(const key of ['level','moves','seed','speed'])data[key]=Number($<HTMLInputElement>(`setting-${key}`).value);for(const key of ['randomRetry','unlimitedMoves','unlimitedTools','forceSuper','sound','haptics','hints','calm'])data[key]=$<HTMLInputElement>(`setting-${key}`).checked;const keepCustom=activeLevel.provenance==='custom'&&data.level===prefs.level;prefs=normalizePreferences(data);start(keepCustom?(custom??activeLevel):undefined)}
function drawLevels():void{
 const range=levelPageRange(levelPage);levelPage=range.page
 $('level-grid').innerHTML=Array.from({length:range.count},(_,i)=>{const id=range.first+i,l=getLevel(id),done=hasCompleted(progress,id);return `<button class="level-tile ${id===prefs.level?'current':''} ${done?'completed':''}" data-level="${id}" data-long-level="${String(id).length>8}" aria-label="레벨 ${id}"><span>${id}</span><small>${l.difficulty==='normal'?'':l.difficulty==='hard'?'♛':l.difficulty==='super-hard'?'♛♛':'♛♛♛'}</small>${done?'<b>★</b>':''}</button>`}).join('')
 $('levels-page').textContent=`${range.first}–${range.last}`;$<HTMLButtonElement>('levels-prev').disabled=range.page===0;$<HTMLButtonElement>('levels-next').disabled=range.page===range.lastPage
 for(const b of $('level-grid').querySelectorAll<HTMLButtonElement>('[data-level]'))b.onclick=()=>{prefs.level=Number(b.dataset.level);start()}
}
$('level-picker').onclick=()=>{levelPage=Math.floor((prefs.level-1)/30);$<HTMLInputElement>('level-jump').value=String(prefs.level);drawLevels();open('levels-dialog')}
$('levels-prev').onclick=()=>{levelPage=Math.max(0,levelPage-1);drawLevels()};$('levels-next').onclick=()=>{levelPage++;drawLevels()}
$('jump-form').onsubmit=e=>{e.preventDefault();prefs.level=normalizePreferences({level:Number($<HTMLInputElement>('level-jump').value)}).level;start()}
$('reference-level').onclick=()=>{prefs.level=12297;start()}
function result(mode:typeof resultMode):void{
 resultMode=mode;$('result-level').textContent=activeLevel.provenance==='custom'?'나만의 보드':`레벨 ${activeLevel.id}`
 $('result-level').dataset.longLevel=String(String(activeLevel.id).length>8)
 $('result-title').textContent=mode==='win'?'멋진 승리!':mode==='lose'?'레벨 실패!':'다시 도전할까요?'
 $('result-title').dataset.mode=mode
 $('result-goals').innerHTML=engine.state.goals.map(g=>`<div class="result-goal">${goalIcon(g)}<b class="${g.remaining===0?'yes':'no'}">${picture(g.remaining===0?'check':'cross')}</b></div>`).join('')
 $('result-dialog').dataset.mode=mode
 $('result-super-badge').hidden=activeLevel.id<292
 $('result-super-count').textContent=superEnabled?'SUPER':`${progress.lightWins}/10`
 $('result-body').textContent=mode==='win'?'모든 목표를 완료했어요!':mode==='lose'?'조금만 더! 새로운 조합으로 도전해 보세요.':'블록 배치와 도구가 새로 준비됩니다.'
 $('win-reward').hidden=mode!=='win';$('retry-boosters').hidden=mode==='win'
 $('result-primary').textContent=mode==='win'?(activeLevel.provenance==='custom'?'다시 플레이':'다음 레벨'):'다시 시도하기'
 $('result-secondary').textContent=mode==='restart'?'계속 플레이':'레벨 선택'
 $('butler-count').textContent=`${progress.streak}/3`;$('butler-meter').style.width=`${progress.streak/3*100}%`
 if(mode!=='win')fillBoosters('result-boosters');open('result-dialog')
}
$('restart').onclick=()=>result('restart')
$('result-primary').onclick=()=>{if(resultMode==='win'&&activeLevel.provenance!=='custom'){prefs.level=nextLevelId(activeLevel.id);start()}else{if(resultMode==='restart'&&engine.state.status==='playing'&&engine.state.turn>0&&activeLevel.provenance!=='custom'){progress=recordLoss(progress);store()}start(activeLevel.provenance==='custom'?(custom??activeLevel):undefined)}}
$('result-secondary').onclick=()=>{if(resultMode==='restart')$<HTMLDialogElement>('result-dialog').close();else{closeAll();$('level-picker').click()}}
const tasks=[['garden-1','정원 입구 열기',1],['garden-2','분수에 물 채우기',2],['garden-3','꽃길 가꾸기',2],['garden-4','왕실 깃발 달기',3],['garden-5','정원 조명 켜기',3],['garden-6','정원 축제 준비',4]] as const
function drawKingdom():void{
 $('kingdom-stage').textContent=`왕실의 정원 · ${progress.tasks.length}/6`;$('kingdom-stars').textContent=`★ ${progress.stars}`;$('kingdom-coins').textContent=`● ${progress.coins}`
 document.querySelector<HTMLElement>('.kingdom-view')!.dataset.stage=String(progress.tasks.length)
 $('kingdom-tasks').innerHTML=tasks.map(([id,name,cost],index)=>{const done=progress.tasks.includes(id),ready=index===progress.tasks.length;return `<button class="task-row ${done?'done':''}" data-task="${id}" ${done||!ready||progress.stars<cost?'disabled':''}><span>${done?'✓':index+1}</span><strong>${name}</strong><b>${done?'완료':`★ ${cost}`}</b></button>`}).join('')
 for(const b of $('kingdom-tasks').querySelectorAll<HTMLButtonElement>('[data-task]'))b.onclick=()=>{const task=tasks.find(t=>t[0]===b.dataset.task);if(!task||progress.tasks.includes(task[0])||progress.stars<task[2])return;progress.stars-=task[2];progress.tasks.push(task[0]);if(progress.tasks.length===6)progress.coins+=500;store();feedback.reward();drawKingdom();lastHud='';renderHud();toast(progress.tasks.length===6?'왕실 정원 완성! 코인 500개를 받았어요.':'정원이 한층 아름다워졌어요!')}
}
$('kingdom-open').onclick=()=>{drawKingdom();open('kingdom-dialog')}
const workshop=mountWorkshop($<HTMLDialogElement>('editor-dialog'),{getCurrent:()=>activeLevel,getSaved:()=>custom,onSave:level=>{custom=structuredClone(level);save(CUSTOM_KEY,custom);toast('나만의 보드를 저장했어요')},onPlay:level=>{custom=structuredClone(level);save(CUSTOM_KEY,custom);start(level)},notify:toast})
$('editor-open').onclick=()=>{cancelPointer();feedback.pause();workshop.open()}
function describeFeedback():void{
 $('haptics-note').textContent=feedback.hapticsMode==='native'?'아이폰 햅틱이 연결됐어요. 버튼·블록·폭발의 손맛을 느껴보세요.':feedback.hapticsMode==='vibration'?'진동을 지원하는 기기에서는 버튼·블록·폭발에 맞춰 짧게 울려요.':'이 브라우저는 게임 진동을 지원하지 않아요. 화면 반동과 효과음은 사용할 수 있어요.'
 $<HTMLInputElement>('setting-haptics').disabled=!feedback.hapticsAvailable
 $<HTMLInputElement>('setting-haptics').setAttribute('aria-describedby','haptics-note')
}
for(const key of ['sound','haptics','calm'] as const)$<HTMLInputElement>(`setting-${key}`).addEventListener('change',e=>{
 prefs[key]=(e.target as HTMLInputElement).checked;feedback.configure(prefs);document.documentElement.dataset.calm=String(prefs.calm);store()
})
$('feedback-test').onclick=()=>toast(feedback.hapticsAvailable?'버튼의 반동·소리·진동을 확인해 보세요.':'이 기기에서는 버튼 반동과 효과음을 확인할 수 있어요.')
describeFeedback()

new ResizeObserver(()=>{if(renderer)renderer.resize(activeLevel)}).observe(canvas)
window.addEventListener('resize',()=>{if(renderer)renderer.resize(activeLevel)})
document.addEventListener('visibilitychange',()=>{cancelPointer();feedback.pause();lastTime=performance.now()})
window.addEventListener('pagehide',()=>feedback.pause())
window.addEventListener('chroma-native-active',e=>{
 const active=(e as CustomEvent<unknown>).detail;if(typeof active!=='boolean')return
 nativeActive=active;cancelPointer();feedback.pause();lastTime=performance.now()
})
function frame(now:number):void{
 const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now
 if(engine&&nativeActive&&!modalOpen()&&!home?.isVisible()&&!document.hidden){const step=dt*prefs.speed;engine.update(step);simTime=engine.time;const events=engine.drainEvents();renderer.pushEvents(events)
  feedback.update(events,simTime)
  if(engine.state.status!=='playing'&&!resultRecorded){resultRecorded=true;resultDelay=.65;if(engine.state.status==='won'){const wasCompleted=hasCompleted(progress,activeLevel.id);if(activeLevel.provenance!=='custom')progress=rewardWin(progress,activeLevel.id);$('win-reward').innerHTML=picture('star')+`<strong>${activeLevel.provenance==='custom'||wasCompleted?'완료':'+1'}</strong>`;}else{if(activeLevel.provenance!=='custom')progress=recordLoss(progress)}store()}
  if(resultDelay>=0){resultDelay-=step;if(resultDelay<0)result(engine.state.status==='won'?'win':'lose')}
  idleTime+=dt;if(prefs.hints&&idleTime>9&&engine.state.status==='playing'&&engine.state.locked.size===0&&selected===null){const hint=engine.hint();if(hint){hintCell=hint[0];$('game-tip').textContent='반짝이는 블록 주변을 살펴보세요'}idleTime=0}
  const maxCombo=Math.max(0,...events.map(e=>e.combo??0));if(maxCombo>=2){$('combo-banner').textContent=maxCombo>=4?'환상적인 콤보!':`멋져요! ×${maxCombo}`;$('combo-banner').classList.remove('show');void $('combo-banner').offsetWidth;$('combo-banner').classList.add('show')}
  renderHud();renderer.draw(engine.state,simTime,selected??(keyboardInput&&document.activeElement===canvas?cursor:hintCell),armed,prefs.calm||matchMedia('(prefers-reduced-motion: reduce)').matches)
 }
 requestAnimationFrame(frame)
}
start()
function showHome():void{cancelPointer();feedback.pause();closeAll();document.querySelector<HTMLElement>('.game-shell')!.hidden=true;home?.show();document.documentElement.dataset.view='home'}
function resumeGame():void{feedback.unlock();if(engine.state.status!=='playing'){start(activeLevel.provenance==='custom'?(custom??activeLevel):undefined);return}home?.hide();document.querySelector<HTMLElement>('.game-shell')!.hidden=false;document.documentElement.dataset.view='game';renderer.resize(activeLevel);lastTime=performance.now()}
home=mountHome($('home-mount'),{
 getState:()=>({level:activeLevel.provenance==='custom'?prefs.level:activeLevel.id,...(activeLevel.provenance==='custom'?{customBoardName:activeLevel.name}:{}),stars:progress.stars,coins:progress.coins,completed:completedCount(progress),streak:progress.streak,tasks:progress.tasks.length,superActive:superEnabled,lightWins:progress.lightWins}),
 onPlay:resumeGame,onLevels:()=>{$('level-picker').click()},onKingdom:()=>{drawKingdom();open('kingdom-dialog')},onSettings:()=>{fillSettings();open('settings-dialog')},onEditor:()=>{cancelPointer();feedback.pause();workshop.open()},onHelp:()=>open('help-dialog'),
})
$('game-home').onclick=showHome
const route=new URL(location.href).searchParams
if(route.get('play')==='1'){
 home.hide()
 const requested=Number(route.get('level'));if(isLevelId(requested)){prefs.level=requested;start()}
}else{
 showHome()
 try{if(!sessionStorage.getItem('chroma-royale:entered:v3')){home.showSplash();sessionStorage.setItem('chroma-royale:entered:v3','1')}}catch{home.showSplash()}
}
for(const dialog of dialogs())dialog.addEventListener('close',()=>home?.refresh())
window.addEventListener('royal-update-ready',()=>{
 const button=document.createElement('button');button.className='update-button';button.textContent='새 버전 적용';button.onclick=()=>{void applyRoyalUpdate()};document.body.append(button)
})
void registerRoyalPwa()
requestAnimationFrame(frame)
// Keep a tiny read-only inspection surface in development, never a mutation API.
if(import.meta.env.DEV)Object.defineProperty(window,'__royalSnapshot',{get:()=>({level:activeLevel.id,cols:activeLevel.cols,rows:activeLevel.rows,goals:structuredClone(engine.state.goals),obstacles:structuredClone(engine.state.obstacles),moves:engine.state.moves,status:engine.state.status,turn:engine.state.turn,locked:[...engine.state.locked],hint:engine.hint(),pieces:structuredClone(engine.state.pieces),time:engine.time}),configurable:true})
