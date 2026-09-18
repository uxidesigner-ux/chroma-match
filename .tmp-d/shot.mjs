import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport:{width:Number(process.env.W||1200),height:Number(process.env.H||900)}, deviceScaleFactor:Number(process.env.DPR||2) })
p.on('pageerror', e=>console.log('PAGEERROR', e.message.slice(0,300)))
await p.goto(process.argv[2], { waitUntil:'domcontentloaded' })
await p.waitForFunction('window.__ready === true', undefined, { timeout: Number(process.env.TMO || 900000) })
if (process.env.DUMP) console.log(await p.evaluate('window.__dump ?? ""'))
if (process.argv[3]) await p.screenshot({ path: process.argv[3], fullPage:true })
await b.close()
