/** Decorative 2.5D surface motion. Native HTML remains the only input surface. */
const vertex = `attribute vec2 position; varying vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`
const fragment = `precision mediump float;
varying vec2 uv; uniform sampler2D art; uniform float time; uniform float forest; uniform float wide; uniform vec4 scene;
float spot(vec2 p,vec2 c,vec2 radius){return 1.-smoothstep(.55,1.,length((p-c)/radius));}
void main(){
  vec2 p=(vec2(uv.x,1.-uv.y)-scene.xy)/scene.zw;
  vec4 base=texture2D(art,p);
  float water=smoothstep(.04,.15,min(base.g-base.r,base.b-base.r))*smoothstep(-.02,.05,base.b-base.g*.9);
  // Portals/crystals are solid landmarks, not moving water.
  float solid=forest*spot(p,vec2(.59,.10),vec2(.16,.13));
  solid+=(1.-forest)*(1.-wide)*spot(p,vec2(.22,.49),vec2(.17,.13));
  solid+=(1.-forest)*wide*spot(p,vec2(.19,.53),vec2(.18,.19));
  water*=1.-clamp(solid,0.,1.);
  float falls=forest*(spot(p,vec2(.245,.30),vec2(.022,.034))+spot(p,vec2(.315,.27),vec2(.024,.04))+
    spot(p,vec2(.765,.19),vec2(.023,.04))+spot(p,vec2(.784,.267),vec2(.022,.04))+
    spot(p,vec2(.509,.52),vec2(.025,.042))+spot(p,vec2(.57,.632),vec2(.025,.035)));
  falls+=(1.-forest)*(1.-wide)*(spot(p,vec2(.27,.31),vec2(.028,.045))+spot(p,vec2(.71,.71),vec2(.04,.04)));
  falls+=(1.-forest)*wide*(spot(p,vec2(.165,.27),vec2(.018,.05))+spot(p,vec2(.765,.79),vec2(.028,.05)));
  float leaves=smoothstep(.02,.10,base.g-max(base.r,base.b))* (1.-smoothstep(.45,.7,base.g));
  // Gently move canopy texture; stone paths, cliffs, route and HUD stay fixed.
  float wind=sin(time*.75+p.y*18.)*sin(p.x*39.+time*.23);
  vec2 offset=vec2(wind*.0012*leaves,0.);
  offset+=water*vec2(sin(p.y*420.+time*1.2)*.00065,cos(p.x*260.+time)*.0004);
  offset.y+=clamp(falls,0.,1.)*sin(p.y*700.-time*7.)*.0016;
  vec4 colour=texture2D(art,clamp(p+offset,vec2(.001),vec2(.999)));
  float glint=sin(p.x*380.+p.y*190.-time*1.6)*.016*water;
  glint+=sin(p.y*500.-time*8.)*.035*clamp(falls,0.,1.);
  gl_FragColor=vec4(colour.rgb+glint,1.);
}`

export class MapLife {
  private canvas = document.createElement('canvas')
  private fauna = document.createElement('div')
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private texture: WebGLTexture | null = null
  private frame = 0
  private lastFrame = 0
  private elapsed = 0
  private ready = false
  private lost = false
  private reduced = matchMedia('(prefers-reduced-motion: reduce)')
  private viewport: HTMLElement

  constructor(private image: HTMLImageElement, private plane: HTMLElement, private screen: HTMLElement) {
    this.canvas.className = 'map-life-surface'
    this.canvas.setAttribute('aria-hidden','true')
    this.fauna.className = 'map-life-fauna'
    this.fauna.setAttribute('aria-hidden','true')
    this.viewport = plane.parentElement!
    this.viewport.insertBefore(this.canvas, plane)
    plane.append(this.fauna)
    for (const [kind,x,y,duration] of [['bird',.23,.31,29],['bird',.74,.61,37],['butterfly',.36,.46,17],['butterfly',.64,.71,23]] as const) {
      const flight = document.createElement('span'), sprite = document.createElement('img')
      flight.className = `map-life-flight map-life-${kind}`
      flight.style.left = `${x*100}%`; flight.style.top = `${y*100}%`
      flight.style.setProperty('--flight-duration',`${duration}s`)
      flight.style.setProperty('--flight-delay',`${-duration*.37}s`)
      sprite.src = `${import.meta.env.BASE_URL}map-life-${kind}-v1.png`
      sprite.alt = ''; sprite.draggable = false
      sprite.addEventListener('error', () => { flight.hidden = true })
      flight.append(sprite); this.fauna.append(flight)
    }
    image.addEventListener('load', () => { this.ready = false; this.upload(); this.sync() })
    image.addEventListener('error', () => { this.ready = false; this.sync() })
    new MutationObserver(() => { this.ready = false; this.sync() }).observe(image, {attributes:true,attributeFilter:['src']})
    this.reduced.addEventListener('change', () => this.sync())
    document.addEventListener('visibilitychange', () => this.sync())
    // Hidden hub tabs and open modal sheets must not keep a GPU loop running.
    new MutationObserver(() => this.sync()).observe(screen, {attributes:true, attributeFilter:['hidden','data-map-view']})
    new MutationObserver(() => this.sync()).observe(document.querySelector('.app')!, {attributes:true,attributeFilter:['inert']})
    new MutationObserver(() => this.sync()).observe(this.viewport, {attributes:true,attributeFilter:['data-dragging']})
    new ResizeObserver(() => this.sync()).observe(this.viewport)
    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.lost = true; this.ready = false; this.gl = null; this.program = null; this.texture = null; this.sync()
    })
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.upload(); this.sync() })
    this.upload(); this.sync()
  }

  private initialise(): boolean {
    const gl = this.canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'})
    if (!gl || gl.isContextLost()) return false
    const shaders: WebGLShader[] = []
    for (const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const) {
      const shader = gl.createShader(type)
      if (!shader) { shaders.forEach(s=>gl.deleteShader(s)); return false }
      gl.shaderSource(shader,source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) { gl.deleteShader(shader); shaders.forEach(s=>gl.deleteShader(s)); return false }
      shaders.push(shader)
    }
    const program = gl.createProgram()
    if (!program) { shaders.forEach(s=>gl.deleteShader(s)); return false }
    shaders.forEach(s=>gl.attachShader(program,s)); gl.linkProgram(program)
    shaders.forEach(s=>gl.deleteShader(s))
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) { gl.deleteProgram(program); return false }
    gl.useProgram(program)
    const buffer = gl.createBuffer()
    if (!buffer) { gl.deleteProgram(program); return false }
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer)
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
    const attribute = gl.getAttribLocation(program,'position')
    gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0)
    this.texture = gl.createTexture()
    if (!this.texture) { gl.deleteBuffer(buffer); gl.deleteProgram(program); return false }
    gl.bindTexture(gl.TEXTURE_2D,this.texture)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
    this.gl = gl; this.program = program
    return true
  }

  private upload(): void {
    if (this.lost || !this.image.complete || !this.image.naturalWidth || this.reduced.matches) return
    if (!this.gl && !this.initialise()) return
    const gl = this.gl!
    try {
      gl.bindTexture(gl.TEXTURE_2D,this.texture)
      if (Math.max(this.image.naturalWidth,this.image.naturalHeight)>gl.getParameter(gl.MAX_TEXTURE_SIZE)) { this.ready = false; return }
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.image)
      this.ready = gl.getError() === gl.NO_ERROR
    } catch { this.ready = false }
  }

  private sync(): void {
    if (!this.ready && !this.reduced.matches) this.upload()
    const running = this.ready && !this.reduced.matches && !document.hidden && !this.screen.hidden && !document.querySelector<HTMLElement>('.app')!.inert && this.viewport.dataset.dragging !== 'true'
    this.canvas.hidden = !running
    this.fauna.hidden = this.reduced.matches || document.hidden || this.screen.hidden || document.querySelector<HTMLElement>('.app')!.inert
    this.plane.dataset.life = running ? 'running' : 'paused'
    cancelAnimationFrame(this.frame); this.frame = 0; this.lastFrame = 0
    if (running) this.draw(performance.now())
  }

  private draw(time: number): void {
    this.frame = requestAnimationFrame(next => this.draw(next))
    if (this.lastFrame && time-this.lastFrame < 1000/30) return
    if (this.lastFrame) this.elapsed += Math.min((time-this.lastFrame)/1000,.1)
    this.lastFrame = time
    const gl = this.gl!, program = this.program!
    // Render only the visible crop at display density, not a reduced full map.
    const view = this.viewport.getBoundingClientRect(), scene = this.plane.getBoundingClientRect()
    if (!view.width || !view.height) return
    const density = Math.min(devicePixelRatio || 1,3,Math.sqrt(3_200_000/(view.width*view.height)))
    const width = Math.max(1,Math.round(view.width*density)), height = Math.max(1,Math.round(view.height*density))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height
      gl.viewport(0,0,width,height)
    }
    gl.uniform4f(gl.getUniformLocation(program,'scene'),(scene.left-view.left)/view.width,(scene.top-view.top)/view.height,scene.width/view.width,scene.height/view.height)
    gl.uniform1f(gl.getUniformLocation(program,'time'),this.elapsed)
    // All regional scenes share the terrace composition, unlike the overview.
    gl.uniform1f(gl.getUniformLocation(program,'forest'),/chroma-(forest|volcano|prism|relay)-/.test(this.image.src) ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(program,'wide'),this.image.src.includes('wide') ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES,0,6)
  }
}
