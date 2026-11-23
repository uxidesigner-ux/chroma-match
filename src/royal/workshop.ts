import { createBlankLevel, deriveGoals, validateLevel } from './levels.ts'
import { iconData } from './renderer.ts'
import { cellPlayable, GOAL_NAMES, type Colour, type LevelDefinition, type ObstacleKind, type Power } from './model.ts'
interface WorkshopOptions { getCurrent:()=>LevelDefinition; getSaved:()=>LevelDefinition|null; onSave:(level:LevelDefinition)=>void; onPlay:(level:LevelDefinition)=>void; notify:(message:string)=>void }
export function mountWorkshop(dialog:HTMLDialogElement,options:WorkshopOptions):{open:()=>void}{
 let draft:LevelDefinition,brush='playable',painted=false,serial=1
 const el=<T extends HTMLElement=HTMLElement>(id:string)=>dialog.querySelector<T>(`#${id}`)!
 dialog.innerHTML=`<header class="dialog-heading"><h2>나만의 보드 만들기</h2><button class="close-button" id="editor-close" aria-label="편집기 닫기">×</button></header><div class="panel-body workshop-body"><p class="dialog-lead">모양을 그리고, 기믹을 놓고, 바로 플레이하세요</p><div class="editor-toolbar"><button class="blue-button" id="editor-current">현재 판 가져오기</button><button class="blue-button" id="editor-saved">저장한 판</button><button class="blue-button" id="editor-blank">빈 보드</button></div><div class="field-grid editor-fields"><label>보드 이름<input id="editor-name" maxlength="60"/></label><label>이동 횟수<input id="editor-moves" type="number" min="1" max="200"/></label><label>가로 칸<input id="editor-cols" type="number" min="5" max="12"/></label><label>세로 칸<input id="editor-rows" type="number" min="5" max="12"/></label></div><p class="fine-print">가로·세로 값을 바꾼 후 ‘빈 보드’를 누르면 새 크기로 시작합니다.</p><div class="editor-workspace"><div><div id="editor-grid" role="grid" aria-label="보드 편집 격자"></div><p id="editor-feedback" role="status"></p></div><aside><div class="brush-list" id="brush-list"></div><label class="durability-label">장애물 내구도<input id="editor-hp" type="number" min="1" max="8" value="2"/></label></aside></div><div class="editor-goals"><h3>목표</h3><p class="fine-print">기믹 수량에 맞춰 자동으로 계산합니다. 색 블록 수집 목표는 수량을 바꿀 수 있어요.</p><div id="editor-goals"></div><button id="editor-colour-goal" class="text-button">왕관 수집 목표 추가</button></div><p id="editor-errors" class="form-errors" role="alert"></p><div class="editor-actions"><button class="green-button" id="editor-play">이 보드로 플레이</button><button class="blue-button" id="editor-save">보드 저장</button></div><details class="json-tools"><summary>JSON 가져오기 · 내보내기</summary><textarea id="editor-json" rows="7" spellcheck="false" aria-label="레벨 JSON"></textarea><div class="editor-toolbar"><button class="blue-button" id="editor-import">JSON 적용</button><button class="blue-button" id="editor-export">파일로 저장</button><label class="blue-button file-button">파일 열기<input id="editor-file" type="file" accept=".json,application/json"/></label></div></details></div>`
 const brushNames:[string,string,string][]=[['playable','보드 칸','colour'],['void','빈 공간','erase'],['erase','내용 지우기','erase'],['jelly','젤리 바닥','jelly'],['box','상자','box'],['gift','선물상자','toy'],['ice','얼음','ice'],['stone','돌','stone'],['cuckoo','뻐꾸기 둥지','cuckoo'],['dynamite','다이너마이트','dynamite'],['colour-0','왕관','colour'],['colour-1','책','colour'],['colour-2','방패','colour'],['colour-3','잎','colour'],['rocket-h','가로 로켓','rocket-h'],['rocket-v','세로 로켓','rocket-v'],['propeller','프로펠러','propeller'],['tnt','TNT','tnt'],['lightball','라이트볼','lightball']]
 el('brush-list').innerHTML=brushNames.map(([value,label,icon])=>`<button class="brush" data-brush="${value}" title="${label}" aria-label="${label}"><img src="${iconData(icon,value.startsWith('colour-')?Number(value.slice(-1)):0)}" alt=""/><span>${label}</span></button>`).join('')
 for(const b of dialog.querySelectorAll<HTMLButtonElement>('[data-brush]'))b.onclick=()=>{brush=b.dataset.brush!;painted=false;drawBrushes()}
 function drawBrushes():void{for(const b of dialog.querySelectorAll<HTMLButtonElement>('[data-brush]')){b.classList.toggle('selected',b.dataset.brush===brush);b.setAttribute('aria-pressed',String(b.dataset.brush===brush))}}
 function load(level:LevelDefinition):void{draft=structuredClone(level);draft.provenance='custom';el<HTMLInputElement>('editor-name').value=draft.name;el<HTMLInputElement>('editor-moves').value=String(draft.moves);el<HTMLInputElement>('editor-cols').value=String(draft.cols);el<HTMLInputElement>('editor-rows').value=String(draft.rows);el('editor-errors').textContent='';draw();drawBrushes()}
 function draw():void{
  const grid=el('editor-grid');grid.style.gridTemplateColumns=`repeat(${draft.cols},1fr)`
  grid.innerHTML=Array.from({length:draft.cols*draft.rows},(_,cell)=>{const exists=cellPlayable(draft,cell),obstacle=draft.obstacles.find(o=>o.cells.includes(cell)),piece=draft.pieces?.find(p=>p.cell===cell);const kind=obstacle?.kind??piece?.power??(piece?'colour':null);return `<button class="editor-cell ${exists?'':'void'} ${draft.jelly.includes(cell)?'jelly':''}" data-cell="${cell}" role="gridcell" aria-label="${Math.floor(cell/draft.cols)+1}행 ${cell%draft.cols+1}열 ${exists?(kind??'보드 칸'):'빈 공간'}">${kind?`<img src="${iconData(kind,piece?.colour)}" alt=""/>`:''}${obstacle?`<small>${obstacle.hp}</small>`:''}</button>`}).join('')
  for(const b of grid.querySelectorAll<HTMLButtonElement>('[data-cell]')){b.onpointerdown=e=>{e.preventDefault();painted=true;paint(Number(b.dataset.cell))};b.onpointerenter=e=>{if(painted&&e.buttons===1)paint(Number(b.dataset.cell))};b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();paint(Number(b.dataset.cell))}}}
  el('editor-goals').innerHTML=draft.goals.map((g,i)=>`<label><img src="${iconData(g.kind==='colour'?'colour':g.kind,g.colour)}" alt=""/><span>${GOAL_NAMES[g.kind]}</span><input type="number" min="1" max="999" value="${g.count}" data-goal="${i}" ${g.kind==='colour'?'':'readonly'} aria-label="${GOAL_NAMES[g.kind]} 목표 수량"/>${g.kind==='colour'?`<button type="button" data-remove-goal="${i}" aria-label="색 수집 목표 삭제">×</button>`:''}</label>`).join('')
  for(const button of el('editor-goals').querySelectorAll<HTMLButtonElement>('[data-remove-goal]'))button.onclick=()=>{draft.goals.splice(Number(button.dataset.removeGoal),1);if(!draft.goals.length)draft.goals=deriveGoals(draft);draw()}
  for(const input of el('editor-goals').querySelectorAll<HTMLInputElement>('[data-goal]'))input.onchange=()=>{const goal=draft.goals[Number(input.dataset.goal)];if(goal&&goal.kind==='colour')goal.count=Math.max(1,Math.min(999,Math.round(Number(input.value)||1)));syncJson()}
  syncJson()
 }
 function syncMeta():void{draft.name=el<HTMLInputElement>('editor-name').value.trim()||'나만의 보드';draft.moves=Math.max(1,Math.min(200,Math.round(Number(el<HTMLInputElement>('editor-moves').value)||30)))}
 function syncJson():void{syncMeta();el<HTMLTextAreaElement>('editor-json').value=JSON.stringify(draft,null,2)}
 function autoGoals():void{const colours=draft.goals.filter(g=>g.kind==='colour');const base=deriveGoals(draft).filter(g=>g.kind!=='colour');draft.goals=base.length?[...base,...colours]:colours.length?colours:[{kind:'colour',colour:0,count:20}]}
 function paint(cell:number):void{
  if(cell<0||cell>=draft.cols*draft.rows)return
  const col=cell%draft.cols,row=Math.floor(cell/draft.cols)
  const setMask=(c:number,on:boolean)=>{const r=Math.floor(c/draft.cols),x=c%draft.cols;draft.mask[r]=draft.mask[r]!.slice(0,x)+(on?'1':'0')+draft.mask[r]!.slice(x+1)}
  const remove=(cells:number[])=>{draft.obstacles=draft.obstacles.filter(o=>!o.cells.some(c=>cells.includes(c)));draft.pieces=(draft.pieces??[]).filter(p=>!cells.includes(p.cell))}
  if(brush==='void'){remove([cell]);draft.jelly=draft.jelly.filter(c=>c!==cell);setMask(cell,false)}
  else if(brush==='playable'){setMask(cell,true)}
  else if(!cellPlayable(draft,cell)){el('editor-feedback').textContent='먼저 보드 칸을 만들어 주세요';return}
  else if(brush==='erase'){remove([cell]);draft.jelly=draft.jelly.filter(c=>c!==cell)}
  else if(brush==='jelly'){if(!draft.jelly.includes(cell))draft.jelly.push(cell)}
  else if(['box','gift','ice','stone','cuckoo','dynamite'].includes(brush)){
   const kind=brush as ObstacleKind,w=kind==='cuckoo'||kind==='dynamite'?2:1,h=kind==='gift'||kind==='cuckoo'||kind==='dynamite'?2:1
   if(col+w>draft.cols||row+h>draft.rows){el('editor-feedback').textContent=`이 기믹은 ${w}×${h}칸 공간이 필요해요`;return}
   const cells:number[]=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)cells.push((row+y)*draft.cols+col+x)
   if(cells.some(c=>!cellPlayable(draft,c))){el('editor-feedback').textContent='기믹이 빈 공간과 겹쳐요';return}
   remove(cells);const hp=kind==='gift'?4:kind==='stone'?3:kind==='cuckoo'||kind==='dynamite'?1:Math.max(1,Math.min(8,Math.round(Number(el<HTMLInputElement>('editor-hp').value)||2)))
   while(draft.obstacles.some(o=>o.id===`custom-${serial}`))serial++
   draft.obstacles.push({id:`custom-${serial++}`,kind,cells,hp,...(kind==='cuckoo'?{stock:2,open:true}:kind==='dynamite'?{stock:4,colour:0 as Colour}:kind==='gift'?{stock:1}:{})})
  }else{remove([cell]);const colour=(brush.startsWith('colour-')?Number(brush.slice(-1)):0) as Colour;if(colour>=draft.colours)draft.colours=4;draft.pieces??=[];draft.pieces.push({cell,colour,...(!brush.startsWith('colour-')?{power:brush as Power}:{})})}
  el('editor-feedback').textContent='보드가 변경되었습니다';autoGoals();draw()
 }
 dialog.addEventListener('pointerup',()=>{painted=false});dialog.addEventListener('pointercancel',()=>{painted=false})
 el('editor-close').onclick=()=>dialog.close()
 el('editor-current').onclick=()=>load(options.getCurrent())
 el('editor-saved').onclick=()=>{const saved=options.getSaved();if(saved)load(saved);else options.notify('아직 저장한 보드가 없어요')}
 el('editor-blank').onclick=()=>{const cols=Number(el<HTMLInputElement>('editor-cols').value)||9,rows=Number(el<HTMLInputElement>('editor-rows').value)||9;load(createBlankLevel(Math.max(5,Math.min(12,cols)),Math.max(5,Math.min(12,rows))))}
 el('editor-colour-goal').onclick=()=>{if(!draft.goals.some(g=>g.kind==='colour'))draft.goals.push({kind:'colour',colour:0,count:20});draw()}
 for(const id of ['editor-name','editor-moves'])el(id).onchange=()=>syncJson()
 function valid():LevelDefinition|null{syncMeta();const checked=validateLevel(draft);el('editor-errors').textContent=checked.errors.join('\n');return checked.level??null}
 el('editor-save').onclick=()=>{const level=valid();if(level)options.onSave(level)}
 el('editor-play').onclick=()=>{const level=valid();if(level){dialog.close();options.onPlay(level)}}
 function importText(text:string):void{try{const parsed:unknown=JSON.parse(text),checked=validateLevel(parsed);if(checked.level){load({...checked.level,provenance:'custom'});options.notify('레벨을 불러왔어요')}else el('editor-errors').textContent=checked.errors.join('\n')}catch{el('editor-errors').textContent='올바른 JSON 파일인지 확인해 주세요.'}}
 el('editor-import').onclick=()=>importText(el<HTMLTextAreaElement>('editor-json').value)
 el<HTMLInputElement>('editor-file').onchange=async e=>{const input=e.target as HTMLInputElement,file=input.files?.[0];if(!file)return;if(file.size>200000){el('editor-errors').textContent='200KB 이하의 레벨 파일을 선택해 주세요';return}importText(await file.text());input.value=''}
 el('editor-export').onclick=()=>{const level=valid();if(!level)return;const blob=new Blob([JSON.stringify(level,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`chroma-level-${level.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return {open:()=>{load(options.getSaved()??options.getCurrent());dialog.showModal()}}
}
