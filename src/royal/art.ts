import { rasterIcon } from './raster-art.ts'
export { initRoyalArt } from './raster-art.ts'
/** Original vector artwork shared by the board and the controls. No remote fonts or sprites. */
const defs = `<defs>
<linearGradient id="gold" x1="0" y1="0" x2=".35" y2="1"><stop stop-color="#ffffb8"/><stop offset=".22" stop-color="#fff34b"/><stop offset=".57" stop-color="#ffcd12"/><stop offset="1" stop-color="#ed8d00"/></linearGradient>
<linearGradient id="red" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="#ff6769"/><stop offset=".32" stop-color="#f21e36"/><stop offset="1" stop-color="#af0028"/></linearGradient>
<linearGradient id="blue" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#60e6ff"/><stop offset=".38" stop-color="#16a5ff"/><stop offset="1" stop-color="#0640cd"/></linearGradient>
<linearGradient id="green" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#c6ff42"/><stop offset=".3" stop-color="#61ec08"/><stop offset=".68" stop-color="#21c90a"/><stop offset="1" stop-color="#00872a"/></linearGradient>
<linearGradient id="violet" x1="0" y1="0" x2=".6" y2="1"><stop stop-color="#d694ff"/><stop offset=".3" stop-color="#a84ff0"/><stop offset="1" stop-color="#511b9b"/></linearGradient>
<linearGradient id="wood" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#ffd38a"/><stop offset=".46" stop-color="#e7a14a"/><stop offset="1" stop-color="#aa501a"/></linearGradient>
<linearGradient id="ice" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".36" stop-color="#b8f8ff"/><stop offset=".6" stop-color="#63c9ff"/><stop offset="1" stop-color="#4094e3"/></linearGradient>
<linearGradient id="stone" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#e2dceb"/><stop offset=".4" stop-color="#b2afc5"/><stop offset="1" stop-color="#656b8f"/></linearGradient>
<linearGradient id="rainbow" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff382a"/><stop offset=".25" stop-color="#ffb900"/><stop offset=".48" stop-color="#89de00"/><stop offset=".68" stop-color="#16af78"/><stop offset="1" stop-color="#1747df"/></linearGradient>
<radialGradient id="ball" cx=".35" cy=".25" r=".8"><stop stop-color="#ee7eff"/><stop offset=".5" stop-color="#bd1885"/><stop offset="1" stop-color="#510d81"/></radialGradient>
<filter id="shadow" x="-30%" y="-25%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="1.5" flood-color="#10234e" flood-opacity=".45"/></filter>
</defs>`

const crown = `<path d="M20 32 Q12 18 20 17 Q27 16 36 33 L44 15 Q50 5 56 15 L64 33 Q77 12 83 18 Q90 23 80 40 L76 71 Q75 82 50 83 Q25 82 24 71Z" fill="url(#gold)" stroke="#d28c06" stroke-width="2.6"/>
<path d="M25 65 Q50 74 76 65 L75 75 Q51 83 25 75Z" fill="#ffbe0c"/>
<path d="M29 72 Q50 78 71 72" fill="none" stroke="#fff276" stroke-width="2"/>
<path d="M22 24 L27 50 M48 17 L44 43" stroke="#ffffc0" stroke-linecap="round" stroke-width="5" opacity=".8"/>`
const book = `<path d="M23 24 Q23 14 34 13 L68 13 Q78 13 79 22 L80 77 Q79 85 69 86 L32 86 Q21 85 20 75Z" fill="#9b071b" stroke="#8e0922" stroke-width="2"/>
<path d="M28 16 L68 16 Q73 16 74 22 L30 24Z" fill="#ffefbd"/>
<path d="M25 24 Q49 20 76 24 L77 75 Q76 81 69 82 L31 82 Q24 82 24 75Z" fill="url(#red)" stroke="#ff344b" stroke-width="2"/>
<path d="M28 28 Q49 24 71 28" stroke="#ff9b91" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M29 31 L28 69" stroke="#ff756b" stroke-width="2.5" opacity=".8"/>
<path d="M69 33 L69 73" stroke="#c00024" stroke-width="2" opacity=".6"/>`
const shield = `<path d="M16 25 Q17 12 30 12 L70 12 Q83 12 84 25 L83 48 Q81 73 50 88 Q20 73 17 48Z" fill="url(#blue)" stroke="#174fc7" stroke-width="2.6"/>
<path d="M25 25 Q50 18 75 25 L74 48 Q71 66 50 78 Q29 66 26 48Z" fill="#0a70e8" stroke="#5acbff" stroke-width="3"/>
<path d="M50 24 L71 28 L70 47 Q68 62 50 74Z" fill="#0454d1"/>
<path d="M24 24 Q29 20 37 21" stroke="#b7f1ff" stroke-width="4" stroke-linecap="round" fill="none"/>
<path d="M21 30 L22 44" stroke="#68dcff" stroke-width="2.8" stroke-linecap="round"/>`
const leaf = `<path d="M50 13 Q67 20 80 36 Q97 62 76 74 Q65 79 58 67 Q59 81 51 85 Q42 82 43 69 Q30 82 19 71 Q6 56 24 36 Q36 23 50 13Z" fill="url(#green)" stroke="#169431" stroke-width="2.2"/>
<path d="M50 29 Q41 42 43 68 M52 41 Q65 48 70 65" fill="none" stroke="#19a731" stroke-width="2.8" stroke-linecap="round" opacity=".58"/>
<path d="M39 27 Q23 39 23 50" fill="none" stroke="#c4ff70" stroke-width="5" stroke-linecap="round" opacity=".7"/>`
const rocket = `<path d="M19 25 Q14 27 14 50 Q14 73 20 75 L33 70 L33 30Z" fill="url(#red)" stroke="#af0728" stroke-width="2"/>
<path d="M69 27 Q78 25 85 43 Q89 50 84 59 Q78 75 70 73Z" fill="url(#red)" stroke="#9c0926" stroke-width="2"/>
<rect x="29" y="26" width="43" height="48" rx="13" fill="url(#blue)" stroke="#073f9a" stroke-width="2"/>
<path d="M33 29 Q40 23 43 30 L43 72 Q39 78 33 71Z M65 28 Q72 24 75 31 L75 69 Q71 76 65 72Z" fill="url(#gold)" stroke="#bc7a05" stroke-width="1.5"/>
<path d="M45 37 L62 30 L62 48 L45 57Z" fill="#9ae7ff" opacity=".6"/>
<path d="M45 66 L62 56" stroke="#0a55c6" stroke-width="2"/>`
const propeller = `<circle cx="50" cy="59" r="24" fill="url(#gold)" stroke="#aa6610" stroke-width="2"/><path d="M28 59 Q50 75 72 59 L67 77 Q50 87 33 77Z" fill="#22397d" stroke="#ecaa20" stroke-width="3"/>
<g stroke="#9b0835" stroke-width="2"><path d="M47 41 Q19 7 13 20 Q8 35 33 49Z" fill="url(#red)"/><path d="M54 41 Q77 7 86 20 Q91 33 67 49Z" fill="url(#red)"/><path d="M46 48 Q18 56 21 70 Q31 80 51 57Z" fill="url(#red)"/><path d="M54 48 Q82 57 79 71 Q67 79 49 56Z" fill="url(#red)"/></g>
<path d="M21 22 L35 38 M78 22 L64 38" stroke="#ffb0b0" stroke-width="3" stroke-linecap="round"/>
<circle cx="50" cy="45" r="11" fill="url(#gold)" stroke="#9a5805" stroke-width="2"/><circle cx="48" cy="43" r="5" fill="#ff3846"/>`
const tnt = `<g stroke="#990c21" stroke-width="2"><rect x="24" y="24" width="18" height="56" rx="8" fill="url(#red)"/><rect x="41" y="17" width="19" height="64" rx="9" fill="url(#red)"/><rect x="59" y="25" width="18" height="54" rx="8" fill="url(#red)"/></g>
<path d="M22 32 Q50 45 78 32 L81 43 Q50 57 19 43Z M20 69 Q50 83 80 69 L78 81 Q50 94 22 81Z" fill="url(#gold)" stroke="#b77b08" stroke-width="2"/>
<path d="M20 44 Q50 55 80 44 L78 70 Q50 82 22 70Z" fill="url(#gold)" stroke="#bd7d07" stroke-width="2"/>
<text x="50" y="69" font-size="22" font-weight="900" text-anchor="middle" fill="#6f3512" font-family="Arial,sans-serif">TNT</text><path d="M50 17 Q42 6 56 6" stroke="#704523" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M55 6 L61 3" stroke="#ffdd31" stroke-width="3"/>`
const ball = `<circle cx="50" cy="51" r="36" fill="url(#ball)" stroke="#693077" stroke-width="2"/>
<ellipse cx="50" cy="42" rx="35" ry="14" fill="none" stroke="url(#gold)" stroke-width="7"/>
<path d="M21 69 Q50 82 79 69" fill="none" stroke="#ffc519" stroke-width="6"/>
<g stroke="#a0730b" stroke-width="1.8"><circle cx="49" cy="19" r="7" fill="#80e927"/><circle cx="29" cy="29" r="6" fill="#ff446b"/><circle cx="68" cy="29" r="6" fill="#22d7ff"/><circle cx="43" cy="37" r="6" fill="#37d9fa"/><circle cx="59" cy="36" r="6" fill="#a7ee19"/><circle cx="24" cy="56" r="6" fill="#9be52a"/><circle cx="43" cy="62" r="7" fill="#fb4874"/><circle cx="67" cy="59" r="7" fill="#44dcff"/><circle cx="54" cy="82" r="5" fill="#25a5fa"/></g>
<path d="M27 19 Q36 12 44 13" stroke="#ffb7fa" stroke-width="3.5" opacity=".6" fill="none" stroke-linecap="round"/>`
const box = `<rect x="14" y="15" width="72" height="72" rx="10" fill="url(#wood)" stroke="#8d431a" stroke-width="3"/>
<path d="M19 37 H81 M19 61 H81" stroke="#9b4f20" stroke-width="3"/><path d="M22 22 L77 78 M77 22 L22 78" stroke="#924319" stroke-width="13"/>
<path d="M23 23 L77 77 M77 23 L23 77" stroke="#ffcd75" stroke-width="9"/><path d="M25 24 L77 76" stroke="#ffe49a" stroke-width="2"/>
<g fill="#96541e"><circle cx="25" cy="25" r="2.5"/><circle cx="75" cy="25" r="2.5"/><circle cx="25" cy="75" r="2.5"/><circle cx="75" cy="75" r="2.5"/></g>`
const gift = `<rect x="17" y="12" width="66" height="78" rx="11" fill="url(#red)" stroke="#8e0b3c" stroke-width="3"/><rect x="23" y="18" width="54" height="65" rx="6" fill="#ba0645" stroke="#f24d77" stroke-width="2"/><path d="M44 14 H56 V88 H44Z" fill="url(#gold)"/>
<path d="M48 46 Q14 30 20 53 Q24 64 45 55 L37 72 L49 67 L53 54 Q76 65 81 51 Q85 30 54 46 L65 71 L53 65Z" fill="url(#blue)" stroke="#1263ad" stroke-width="2"/><rect x="44" y="43" width="13" height="18" rx="4" fill="url(#blue)" stroke="#0b7aa4" stroke-width="1.5"/>`
const toy = `<circle cx="29" cy="21" r="11" fill="url(#wood)" stroke="#b65c18" stroke-width="2"/><circle cx="70" cy="21" r="11" fill="url(#wood)" stroke="#b65c18" stroke-width="2"/>
<ellipse cx="50" cy="64" rx="25" ry="29" fill="url(#wood)" stroke="#a9501b" stroke-width="2"/>
<ellipse cx="24" cy="59" rx="12" ry="19" transform="rotate(24 24 59)" fill="url(#wood)" stroke="#ad5919" stroke-width="2"/><ellipse cx="77" cy="59" rx="12" ry="19" transform="rotate(-24 77 59)" fill="url(#wood)" stroke="#ad5919" stroke-width="2"/>
<circle cx="50" cy="33" r="24" fill="url(#wood)" stroke="#b6651e" stroke-width="2"/>
<ellipse cx="50" cy="66" rx="15" ry="19" fill="#ffe0a1"/><ellipse cx="50" cy="41" rx="14" ry="10" fill="#ffe5ae"/>
<ellipse cx="50" cy="36" rx="6" ry="4" fill="#4a2a27"/><circle cx="39" cy="28" r="3" fill="#38252a"/><circle cx="61" cy="28" r="3" fill="#38252a"/><circle cx="38" cy="27" r="1" fill="white"/><circle cx="60" cy="27" r="1" fill="white"/>
<path d="M50 40 V45 M45 44 Q50 48 55 44" stroke="#9c542b" fill="none" stroke-width="2"/><path d="M47 52 L32 47 L33 60 L48 56 L65 61 L67 47 L53 52Z" fill="url(#red)" stroke="#ac0928" stroke-width="1.5"/>
<ellipse cx="31" cy="84" rx="15" ry="11" fill="url(#wood)" stroke="#a94d19" stroke-width="2"/><ellipse cx="68" cy="84" rx="15" ry="11" fill="url(#wood)" stroke="#a94d19" stroke-width="2"/>`
const bird = `<ellipse cx="50" cy="57" rx="30" ry="34" fill="url(#violet)" stroke="#6330a7" stroke-width="2"/>
<path d="M25 45 Q8 52 16 76 Q22 81 29 64 M75 45 Q92 53 85 76 Q79 82 71 65" fill="url(#violet)" stroke="#6f2eb7" stroke-width="2"/>
<path d="M32 30 Q30 15 41 20 Q50 7 57 21 Q72 15 69 31Z" fill="url(#violet)"/><ellipse cx="50" cy="69" rx="19" ry="23" fill="#fff1c0"/>
<ellipse cx="39" cy="39" rx="5" ry="7" fill="white"/><ellipse cx="61" cy="39" rx="5" ry="7" fill="white"/><ellipse cx="41" cy="40" rx="2.5" ry="4.5" fill="#302e55"/><ellipse cx="59" cy="40" rx="2.5" ry="4.5" fill="#302e55"/>
<path d="M44 49 Q50 43 56 49 L50 57Z" fill="url(#gold)" stroke="#c27a0b" stroke-width="1.4"/><path d="M32 90 H43 M57 90 H68" stroke="#e5a329" stroke-width="5" stroke-linecap="round"/>`
const ice = `<path d="M25 10 L77 16 L91 37 L84 78 L62 91 L17 80 L9 56 L14 25Z" fill="url(#ice)" stroke="#428fc9" stroke-width="2.3"/>
<path d="M25 10 L29 28 L14 25 M77 16 L68 30 L91 37 M84 78 L67 68 L62 91 M17 80 L32 66 L9 56" fill="none" stroke="#d1faff" stroke-width="3"/>
<path d="M29 28 L68 30 L67 68 L32 66Z" fill="#c8f8ff" fill-opacity=".45" stroke="#eefeff" stroke-width="2"/><path d="M27 58 L60 25" stroke="white" stroke-width="9" opacity=".6"/>
<path d="M46 46 L55 55 L48 68 M55 55 L70 50" stroke="#6daed4" fill="none" stroke-width="2"/>`
const stone = `<path d="M30 12 L74 17 L88 38 L83 77 L62 88 L19 79 L12 54 L16 28Z" fill="url(#stone)" stroke="#626b8e" stroke-width="3"/>
<path d="M30 12 L34 27 L70 29 L74 17 M16 28 L31 35 L28 63 L19 79 M62 88 L60 71 L83 77" fill="none" stroke="#ebe8f5" stroke-width="2.5" opacity=".75"/>
<path d="M70 29 L54 49 L61 60 L45 73 M54 49 L33 42" stroke="#747897" stroke-width="3" fill="none"/>`
const jelly = `<rect x="13" y="13" width="75" height="75" rx="20" fill="#43187c" stroke="#d4b5ff" stroke-width="2.5"/><rect x="18" y="18" width="64" height="63" rx="16" fill="url(#violet)"/>
<path d="M25 25 Q30 20 44 22" fill="none" stroke="#e2c3ff" stroke-width="4" stroke-linecap="round" opacity=".75"/>`
const dynamite = `<path d="M49 18 Q52 12 50 6" fill="none" stroke="#c3833c" stroke-width="5" stroke-linecap="round"/>
<path d="M31 24 Q50 16 69 24 L69 80 Q50 91 31 81Z" fill="url(#rainbow)" stroke="#5a6837" stroke-width="2"/>
<ellipse cx="50" cy="24" rx="19" ry="6" fill="#ff5e3c" stroke="#c23325" stroke-width="2"/><path d="M36 30 V76" stroke="#ffffa2" stroke-width="4" opacity=".4" stroke-linecap="round"/>
<path d="M33 82 Q50 87 67 82" stroke="#204299" stroke-width="4" fill="none"/>`
const hammer = `<path d="M43 41 L39 88 Q49 97 59 88 L56 39Z" fill="url(#gold)" stroke="#a86812" stroke-width="2"/><rect x="40" y="69" width="17" height="13" rx="3" fill="#2964be"/>
<path d="M17 20 Q50 9 81 21 L81 52 Q50 66 17 51Z" fill="url(#blue)" stroke="#15358a" stroke-width="2.5"/><path d="M17 19 L27 16 L27 56 L17 52Z M72 17 L82 21 L82 53 L72 57Z" fill="url(#red)" stroke="#ffc832" stroke-width="3"/>
<path d="M38 30 L44 35 L49 26 L55 35 L61 30 L58 46 L41 46Z" fill="url(#gold)"/><path d="M33 22 Q46 17 60 22" stroke="#9ff5ff" stroke-width="3" fill="none"/>`
const arrow = `<path d="M32 11 Q77 50 32 88" fill="none" stroke="#a20729" stroke-width="15"/><path d="M32 11 Q77 50 32 88" fill="none" stroke="url(#red)" stroke-width="10"/>
<path d="M33 12 L48 50 L33 87" fill="none" stroke="#ffeb9b" stroke-width="2"/>
<path d="M11 50 H83" stroke="#905923" stroke-width="6"/><path d="M11 47 H82" stroke="#ffe596" stroke-width="2"/><path d="M75 37 L91 50 L75 63Z" fill="url(#gold)" stroke="#b3740b" stroke-width="2"/>
<path d="M13 44 L6 37 L24 40 L33 48 L25 56 L7 61 L13 52Z" fill="url(#red)" stroke="#a61234" stroke-width="1.5"/>`
const cannon = `<path d="M23 64 Q50 53 78 64 L74 85 Q49 95 26 84Z" fill="url(#blue)" stroke="#183f91" stroke-width="2"/><path d="M27 80 Q50 88 74 80" stroke="#ffc421" stroke-width="4" fill="none"/>
<path d="M34 65 L23 35 Q43 7 68 27 L70 57 Q56 72 34 65Z" fill="url(#gold)" stroke="#b67e18" stroke-width="2"/>
<ellipse cx="46" cy="31" rx="23" ry="20" transform="rotate(-20 46 31)" fill="url(#gold)" stroke="#fbee7b" stroke-width="3"/>
<ellipse cx="46" cy="31" rx="14" ry="12" transform="rotate(-20 46 31)" fill="#41344d" stroke="#b57411" stroke-width="3"/><ellipse cx="44" cy="29" rx="9" ry="7" fill="#1f2442"/>
<circle cx="25" cy="80" r="9" fill="#682a6f" stroke="#e9b32e" stroke-width="3"/><circle cx="75" cy="80" r="9" fill="#682a6f" stroke="#e9b32e" stroke-width="3"/>`
const hat = `<path d="M22 68 Q1 31 19 28 Q32 27 38 62 Q29 10 49 9 Q67 10 59 61 Q68 24 83 30 Q100 35 79 68Z" fill="url(#blue)" stroke="#1149a0" stroke-width="2"/>
<path d="M21 66 Q5 36 19 31 Q31 30 38 64Z" fill="url(#red)"/><path d="M60 65 Q72 28 84 33 Q93 37 79 68Z" fill="url(#green)"/>
<path d="M23 64 Q50 73 78 64 L78 84 Q50 94 23 84Z" fill="url(#gold)" stroke="#b17408" stroke-width="2"/>
<circle cx="17" cy="32" r="7" fill="url(#gold)"/><circle cx="50" cy="12" r="7" fill="url(#gold)"/><circle cx="85" cy="34" r="7" fill="url(#gold)"/>`
const gear = `<path d="M43 9 H57 L60 22 L69 27 L82 23 L90 36 L80 46 V55 L90 64 L82 78 L69 74 L61 79 L57 92 H43 L39 79 L31 74 L18 78 L10 64 L20 55 V46 L10 36 L18 23 L31 27 L40 22Z" fill="url(#gold)" stroke="#9b7428" stroke-width="2.2"/><circle cx="50" cy="50" r="19" fill="#255b9a" stroke="#ffebad" stroke-width="4"/>`
const star = `<path d="M50 8 L63 35 L93 39 L71 60 L77 91 L50 76 L23 91 L29 60 L7 39 L37 35Z" fill="url(#gold)" stroke="#d48d09" stroke-width="3"/><path d="M50 17 L42 42 L19 43 L37 55 L32 77 L50 64Z" fill="#fff68a" opacity=".55"/>`

const shapes: Record<string, string> = {
  crown, book, shield, leaf, 'rocket-h': rocket, rocket,
  'rocket-v': `<g transform="rotate(90 50 50)">${rocket}</g>`,
  propeller, tnt, lightball: ball, box, gift, toy, cuckoo: bird, bird,
  ice, stone, jelly, dynamite, hammer, arrow, cannon, shuffle: hat,
  settings: gear, star, colour: crown, 'super-lightball': ball,
  erase: `<path d="M17 57 L52 18 Q57 12 64 18 L87 38 Q93 43 87 50 L51 88 H38Z" fill="#f98da9" stroke="#a83c64" stroke-width="3"/><path d="M17 57 L39 35 L73 65 L51 88 H38Z" fill="#eef9ff" stroke="#84b9d3" stroke-width="2"/><path d="M28 55 L43 40" stroke="white" stroke-width="5"/><path d="M43 88 H88" stroke="#2a5883" stroke-width="4"/>`,
}
const names = ['crown', 'book', 'shield', 'leaf']
const cache = new Map<string, string>()
export function iconData(kind: string, colour = 0): string {
  const key = kind === 'colour' ? names[Math.abs(Math.floor(colour)) % 4]! : kind
  const raster = rasterIcon(key)
  if (raster) return raster
  let data = cache.get(key)
  if (!data) {
    data = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${defs}<g filter="url(#shadow)" stroke-linejoin="round" stroke-linecap="round">${shapes[key] ?? star}</g></svg>`)}`
    cache.set(key, data)
  }
  return data
}
