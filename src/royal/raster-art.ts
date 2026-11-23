/** Game-atlas decoding: lossless alpha crop, normalized optical sizes, local assets only. */
const sprites = new Map<string, string>()
const atlasEntries = [
  ['crown','book','shield','leaf'],
  ['rocket-h','rocket-v','propeller','tnt'],
  ['lightball','hammer','arrow','cannon'],
  ['shuffle','settings','heart','star'],
  ['coin','chest','castle','bell'],
]
const obstacleEntries = [['gift','toy','cuckoo','jelly'],['box','ice','stone','dynamite']]
export function rasterIcon(kind:string):string|undefined{
  return sprites.get(kind)??sprites.get(({rocket:'rocket-h',bird:'cuckoo','super-lightball':'lightball',map:'castle',kingdom:'castle'} as Record<string,string>)[kind]??kind)
}
function decodeAtlas(file:string,entries:string[][]):Promise<void>{
  return new Promise(resolve=>{
    const image=new Image();let settled=false
    const finish=()=>{if(!settled){settled=true;resolve()}}
    const timeout=setTimeout(finish,6000)
    image.onerror=()=>{clearTimeout(timeout);finish()}
    image.onload=()=>{
      try{
        const cols=entries[0]!.length,rows=entries.length,sw=image.naturalWidth/cols,sh=image.naturalHeight/rows
        const probe=document.createElement('canvas');probe.width=Math.ceil(sw);probe.height=Math.ceil(sh)
        const ctx=probe.getContext('2d',{willReadFrequently:true})!
        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
          ctx.clearRect(0,0,probe.width,probe.height);ctx.drawImage(image,c*sw,r*sh,sw,sh,0,0,probe.width,probe.height)
          const data=ctx.getImageData(0,0,probe.width,probe.height).data
          // Use the main connected silhouette so a neighbouring sprite's
          // shadow or a stray atlas pixel never changes an icon's optical size.
          let x0=probe.width,y0=probe.height,x1=0,y1=0,largest=0
          const components:{size:number;left:number;top:number;right:number;bottom:number}[]=[]
          const seen=new Uint8Array(probe.width*probe.height),queue=new Int32Array(seen.length)
          for(let p=0;p<seen.length;p++){
            if(seen[p]||data[p*4+3]!<=75)continue
            let head=0,tail=1,left=probe.width,top=probe.height,right=0,bottom=0
            queue[0]=p;seen[p]=1
            while(head<tail){
              const point=queue[head++]!,x=point%probe.width,y=Math.floor(point/probe.width)
              left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)
              for(const next of [x>0?point-1:-1,x<probe.width-1?point+1:-1,y>0?point-probe.width:-1,y<probe.height-1?point+probe.width:-1]){
                if(next>=0&&!seen[next]&&data[next*4+3]!>75){seen[next]=1;queue[tail++]=next}
              }
            }
            largest=Math.max(largest,tail);components.push({size:tail,left,top,right,bottom})
          }
          // Preserve substantial detached parts, e.g. both halves of a broken
          // heart or the cloche base, while excluding tiny atlas-edge specks.
          for(const part of components)if(part.size>=largest*.12){x0=Math.min(x0,part.left);y0=Math.min(y0,part.top);x1=Math.max(x1,part.right);y1=Math.max(y1,part.bottom)}
          if(x1<x0||y1<y0)continue
          x0=Math.max(0,x0-3);y0=Math.max(0,y0-3);x1=Math.min(probe.width-1,x1+3);y1=Math.min(probe.height-1,y1+3)
          const w=x1-x0+1,h=y1-y0+1,out=document.createElement('canvas');out.width=320;out.height=320
          const draw=out.getContext('2d')!,scale=286/Math.max(w,h)
          draw.imageSmoothingEnabled=true;draw.imageSmoothingQuality='high'
          draw.drawImage(probe,x0,y0,w,h,(320-w*scale)/2,(320-h*scale)/2,w*scale,h*scale)
          sprites.set(entries[r]![c]!,out.toDataURL('image/webp',.96))
        }
      }catch{/* Vector artwork remains available on restrictive browsers. */}
      clearTimeout(timeout);finish()
    }
    image.src=`${import.meta.env.BASE_URL}royal/${file}`
  })
}
export async function initRoyalArt():Promise<void>{
  await Promise.all([decodeAtlas('royal-sprites-v3.webp',atlasEntries),decodeAtlas('royal-obstacles-v3.webp',obstacleEntries)])
  const superBall=sprites.get('lightball');if(superBall)sprites.set('super-lightball',superBall)
  await Promise.all([
    decodeAtlas('blocks-v4.webp',[['crown','book'],['shield','leaf']]),
    decodeAtlas('powers-v4.webp',[['rocket-h','propeller'],['tnt','lightball']]),
    decodeAtlas('tools-v4.webp',[['hammer','arrow'],['cannon','shuffle']]),
    decodeAtlas('extras-v4.webp',[['map','home','paintbrush','bell'],['heart-broken','settings','check','cross']]),
    decodeAtlas('gifts-v4.webp',[['gift-full','gift-ribbon','gift-seal','gift-open']]),
    decodeAtlas('goals-v4.webp',[['toy','dynamite'],['cuckoo','jelly']]),
  ])
  const horizontal=sprites.get('rocket-h')
  if(horizontal)await new Promise<void>(resolve=>{const image=new Image();image.onerror=()=>resolve();image.onload=()=>{const c=document.createElement('canvas');c.width=c.height=320;const ctx=c.getContext('2d')!;ctx.translate(160,160);ctx.rotate(Math.PI/2);ctx.drawImage(image,-160,-160,320,320);sprites.set('rocket-v',c.toDataURL('image/webp',.96));resolve()};image.src=horizontal})
}
