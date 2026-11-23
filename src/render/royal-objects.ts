import type { Gem } from '../game/types.ts'
type Ctx = CanvasRenderingContext2D

function plate(ctx: Ctx, x: number, y: number, w: number, h: number, radius: number, top: string, bottom: string, edge: string): void {
  const fill = ctx.createLinearGradient(x, y, x + w * .25, y + h)
  fill.addColorStop(0, top); fill.addColorStop(1, bottom)
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius)
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.2, w * .035); ctx.stroke()
}

/** Paint stationary blockers at the actual hit-test cell, including their damage state. */
export function drawRoyalObstacle(ctx: Ctx, gem: Gem, size: number): void {
  const s = size * .96, r = s / 2
  const type = (gem as Gem & { obstacle?: 'ribbon' | 'crate' | 'ice' }).obstacle ?? 'ribbon'
  const hp = gem.durability ?? 1
  ctx.save()
  ctx.shadowColor = '#26366480'; ctx.shadowBlur = s * .05; ctx.shadowOffsetY = s * .06
  if (type === 'ice') {
    plate(ctx, -r, -r, s, s, s * .12, '#d5faff', '#45a5e8', '#efffff')
    ctx.shadowColor = 'transparent'
    ctx.globalAlpha *= .7
    ctx.fillStyle = '#ffffff'; ctx.beginPath()
    ctx.moveTo(-r * .86, -r * .65); ctx.lineTo(r * .7, -r * .86); ctx.lineTo(-r * .65, r * .65); ctx.closePath(); ctx.fill()
    ctx.globalAlpha /= .7
    ctx.strokeStyle = '#d9ffff'; ctx.lineWidth = s * .055; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(-r * .68, -r * .38); ctx.lineTo(-r * .1, -r * .05)
    ctx.lineTo(r * .52, -r * .25); ctx.moveTo(-r * .1, -r * .05); ctx.lineTo(r * .1, r * .7); ctx.stroke()
    if (hp === 1) {
      ctx.strokeStyle = '#367baf'; ctx.lineWidth = s * .025
      ctx.beginPath(); ctx.moveTo(-r, r * .55); ctx.lineTo(-r * .1, -r * .05); ctx.lineTo(r * .4, -r); ctx.stroke()
    }
  } else if (type === 'crate') {
    plate(ctx, -r, -r, s, s, s * .1, '#ecac56', '#ae501b', '#ffe297')
    ctx.shadowColor = 'transparent'
    for (let i = -1; i <= 1; i++) {
      ctx.strokeStyle = '#803d1e'; ctx.lineWidth = s * .035
      ctx.beginPath(); ctx.moveTo(-r * .8, i * s * .24); ctx.lineTo(r * .8, i * s * .24); ctx.stroke()
      ctx.strokeStyle = '#f8c173'; ctx.lineWidth = s * .02
      ctx.beginPath(); ctx.moveTo(-r * .7, i * s * .24 + s * .045); ctx.lineTo(r * .7, i * s * .24 + s * .045); ctx.stroke()
    }
    if (hp >= 2) {
      ctx.save(); ctx.rotate(-Math.PI / 4)
      plate(ctx, -s * .085, -s * .57, s * .17, s * 1.14, s * .03, '#ffe297', '#d7943b', '#8c4a20')
      ctx.restore()
    }
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      ctx.fillStyle = '#74421e'; ctx.beginPath(); ctx.arc(a * r * .72, b * r * .72, s * .04, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(a * r * .72, b * r * .72 - s * .01, s * .025, 0, Math.PI * 2); ctx.fill()
    }
  } else {
    plate(ctx, -r, -r, s, s, s * .13, '#d91c57', '#8d0030', '#f8ba60')
    ctx.shadowColor = 'transparent'
    // Inset velvet panel and a silk ribbon catch opposite edges of the light.
    plate(ctx, -r * .84, -r * .83, s * .84, s * .82, s * .08, '#b50c49', '#87002e', '#ec3e71')
    plate(ctx, -s * .075, -r, s * .15, s, s * .02, '#fff285', '#ef9a1b', '#ffe58c')
    if (hp > 1) plate(ctx, -r, -s * .06, s, s * .12, s * .02, '#ffe78c', '#eaa329', '#ffdc6e')
    ctx.save(); ctx.translate(0, -s * .03)
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1)
      const silk = ctx.createLinearGradient(0, -s * .13, 0, s * .14)
      silk.addColorStop(0, '#8ceaff'); silk.addColorStop(.5, '#31b7e7'); silk.addColorStop(1, '#0878b5')
      ctx.fillStyle = silk; ctx.strokeStyle = '#14659d'; ctx.lineWidth = s * .035
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-s * .4, -s * .33, -s * .47, s * .21, -s * .10, s * .13); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.restore()
    }
    plate(ctx, -s * .065, -s * .08, s * .13, s * .20, s * .04, '#9bf0ff', '#168aca', '#11679e')
    ctx.restore()
  }
  if (gem.flash > 0) {
    ctx.globalAlpha *= Math.min(.7, gem.flash * 2)
    ctx.fillStyle = '#fff6c6'; ctx.beginPath(); ctx.roundRect(-r, -r, s, s, s * .12); ctx.fill()
  }
  // Explicit layers complement visual damage, including for players who cannot separate colours.
  for (let n = 0; n < hp; n++) {
    ctx.fillStyle = '#603314'; ctx.beginPath(); ctx.arc((n - (hp - 1) / 2) * s * .15, r * .76, s * .052, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff1a0'; ctx.beginPath(); ctx.arc((n - (hp - 1) / 2) * s * .15, r * .76 - s * .012, s * .035, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

/** Power pieces have their own silhouette; a rocket never disappears inside a green leaf. */
export function drawRoyalPower(ctx: Ctx, gem: Gem, r: number, time: number): void {
  ctx.save()
  ctx.shadowColor = '#25345f99'; ctx.shadowBlur = r * .16; ctx.shadowOffsetY = r * .15
  if (gem.power === 'rowClear' || gem.power === 'colClear') {
    if (gem.power === 'rowClear') ctx.rotate(-Math.PI / 2)
    plate(ctx, -r * .37, -r * .51, r * .74, r * 1.24, r * .2, '#fff8c7', '#f6be28', '#a46711')
    ctx.fillStyle = '#f33743'; ctx.strokeStyle = '#a9192c'; ctx.lineWidth = r * .08
    ctx.beginPath(); ctx.moveTo(-r * .4, -r * .45); ctx.quadraticCurveTo(-r * .35, -r * .93, 0, -r * 1.03); ctx.quadraticCurveTo(r * .35, -r * .93, r * .4, -r * .45); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#e82140'
    ctx.beginPath(); ctx.moveTo(-r * .3, r * .33); ctx.lineTo(-r * .72, r * .84); ctx.lineTo(-r * .31, r * .69); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(r * .3, r * .33); ctx.lineTo(r * .72, r * .84); ctx.lineTo(r * .31, r * .69); ctx.closePath(); ctx.fill()
    plate(ctx, -r * .36, -r * .12, r * .72, r * .27, r * .04, '#66dfff', '#1197e5', '#0572b9')
  } else if (gem.power === 'bomb') {
    plate(ctx, -r * .68, -r * .57, r * 1.36, r * 1.37, r * .27, '#f55347', '#a70b23', '#661328')
    for (const y of [-.48, .57]) plate(ctx, -r * .76, r * y, r * 1.52, r * .24, r * .09, '#fff69c', '#d99823', '#86500e')
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff1a6'; ctx.font = `900 ${r * .65}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TNT', 0, r * .15)
    ctx.strokeStyle = '#483b31'; ctx.lineWidth = r * .12; ctx.beginPath(); ctx.moveTo(0, -r * .6); ctx.quadraticCurveTo(-r * .15, -r * 1.07, r * .24, -r * .91); ctx.stroke()
    ctx.fillStyle = '#fff2a8'; ctx.beginPath(); ctx.arc(r * .24, -r * .91, r * .14, 0, Math.PI * 2); ctx.fill()
  } else {
    const sphere = ctx.createRadialGradient(-r * .3, -r * .4, r * .04, 0, 0, r)
    sphere.addColorStop(0, '#fffde6'); sphere.addColorStop(.23, '#ff75c5'); sphere.addColorStop(.60, '#b92cf6'); sphere.addColorStop(1, '#6025b2')
    ctx.fillStyle = sphere; ctx.beginPath(); ctx.arc(0, 0, r * .86, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#ffe16b'; ctx.lineWidth = r * .14; ctx.beginPath(); ctx.ellipse(0, 0, r * .94, r * .38, -.5, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#fff3a2'; ctx.beginPath()
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, q = r * (i % 2 ? .22 : .48); if (!i) ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q); else ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q) }
    ctx.closePath(); ctx.fill()
    ctx.globalAlpha *= .55 + Math.sin(time * 4) * .15
    ctx.strokeStyle = '#fff4cb'; ctx.lineWidth = r * .055; ctx.beginPath(); ctx.arc(0, 0, r * 1.04, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.restore()
}
