/** One tangible, original prop family. Character/editor controls are frozen. */
export type GameIcon = 'shop'|'map'|'character'|'gear'|'help'|'missions'|'ranks'|'infinity'|'play'|'hammer'|'rocket'|'bomb'|'bow'|'compass'|'focus'|'plus'|'minus'|'arrow'|'exit'|'coin'|'star'|'check'|'lock'|'close'|'sound'|'pause'|'shuffle'|'edit'|'sun'
const available=new Map<GameIcon,Promise<boolean>>()
const fallback:Record<GameIcon,string>={shop:'🎁',map:'🗺',character:'👤',gear:'⚙',help:'?',missions:'✓',ranks:'🏆',infinity:'∞',play:'▶',bow:'🏹',hammer:'🔨',rocket:'🚀',bomb:'💣',compass:'🧭',focus:'◎',plus:'+',minus:'−',arrow:'←',exit:'↗',coin:'●',star:'★',check:'✓',lock:'🔒',close:'×',sound:'♪',pause:'Ⅱ',shuffle:'⇄',edit:'✎',sun:'☀'}
export function icon(name: GameIcon): HTMLSpanElement {
  const node=document.createElement('span')
  node.className='game-icon'; node.setAttribute('aria-hidden','true'); decorate(node,name)
  return node
}
function decorate(node: HTMLElement, name: GameIcon): void {
  if(node.dataset.gameIcon===name)return
  node.dataset.gameIcon=name; node.classList.add('game-icon')
  const url=`${import.meta.env.BASE_URL}ui-icons/${name}-v1.webp`
  node.style.setProperty('--game-icon',`url("${url}")`)
  node.textContent=fallback[name]
  if(!available.has(name)) available.set(name,new Promise(resolve=>{
    const image=new Image();image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src=url
  }))
  void available.get(name)!.then(ok=>{if(!ok)node.classList.add('icon-fallback')})
}
export function installGameIcons(): void {
  const glyphs: Record<string,GameIcon>={back:'arrow',exit:'exit',gear:'gear',help:'help',ranks:'ranks',today:'missions',shop:'shop',figure:'character',edit:'edit',pause:'pause',shuffle:'shuffle'}
  const ids:Record<string,GameIcon>={'board-scroll-up':'arrow','board-scroll-down':'arrow','profile-close':'close'}
  const scan=(root:ParentNode)=>{
    const nodes=[...(root instanceof HTMLElement?[root]:[]),...root.querySelectorAll<HTMLElement>('.hud-ico,.item-art,.coin,.daily-gift,.victory-star,.world-completion-mark,.rotate-icon,.world-nav-mark,.world-infinity,.world-play-mark,.world-wallet-add,[data-camera],.sheet-close,#board-scroll-up,#board-scroll-down,#profile-close')]
    for(const node of nodes){
      if(node.closest('#anime-studio,.lobby-stage'))continue
      if(ids[node.id]||node.matches('.sheet-close')){
        if(!node.querySelector('[data-game-icon]'))node.replaceChildren(icon(ids[node.id]??'close'))
        continue
      }
      if(node.matches('[data-camera]')){
        const name=({world:'compass',focus:'focus',in:'plus',out:'minus'} as const)[node.dataset.camera as 'world'|'focus'|'in'|'out']
        if(name&&!node.querySelector('[data-game-icon]'))node.replaceChildren(icon(name))
        continue
      }
      const glyph=[...node.classList].find(c=>c.startsWith('hud-ico-'))?.slice(8)
      const item=[...node.classList].find(c=>/^item-(hammer|rocket|bomb|bow|shuffle)$/.test(c))?.slice(5) as GameIcon|undefined
      const name=item||(glyph&&glyphs[glyph])||ids[node.id]||(node.matches('.coin')?'coin':node.matches('.daily-gift')?'shop':node.matches('.victory-star,.world-completion-mark')?'star':node.matches('.rotate-icon')?'shuffle':node.matches('.world-infinity')?'infinity':node.matches('.world-play-mark')?'play':node.matches('.world-wallet-add')?'plus':node.matches('.world-nav-mark')?'map':undefined)
      if(name)decorate(node,name)
    }
  }
  scan(document)
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement)scan(node)}).observe(document.body,{childList:true,subtree:true})
}
