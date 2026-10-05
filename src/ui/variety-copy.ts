import { language } from '../i18n/index.ts'
import type { BonusRound, Upgrade } from '../game/variety.ts'

const en = {
  rules: 'Fever rules', charge: (n: number) => `Fever ${n}%`, ready: 'Fever · tap',
  active: (n: number) => `Fever · ${n} moves`, activate: 'Activate fever: a bonus power gem after each of the next 3 matching swaps. No time limit.',
  charged: 'Fever ready · tap profile', started: 'Fever! 3 powered moves',
  chainFinish: '8-chain finish! Next move ready',
  choose: 'Choose your upgrade', confirm: 'Upgrade & continue', tier: (n: number) => `Tier ${n}`,
  upgrade: { blast: 'Bigger bombs', stripe: 'Double stripes', echo: 'Colour echo' } as Record<Upgrade, string>,
  detail: (u: Upgrade, tier: number) => ({ blast: `Bombs clear ${tier === 1 ? '5×5' : '7×7'} cells.`,
    stripe: `Stripes clear ${tier + 1} neighbouring lines.`, echo: `First power hit clears up to ${tier * 2} extra goal-colour gems, or the hit colour on other goals.` })[u],
  bonus: { factory: 'Bomb factory', festival: '3-colour festival', relay: 'Fusion relay' } as Record<BonusRound, string>,
  bonusCue: { factory: 'Match → bomb +1', festival: '3 colours · chain time', relay: 'Fuse → new power pair' } as Record<BonusRound, string>,
  bonusDetail: { factory: '3 starter bombs. Each matching swap adds a bomb.', festival: 'Only 3 colours, including all refills.', relay: '3 starter power pairs. Every fusion leaves another pair.' } as Record<BonusRound, string>,
  bonusPreview: 'Bonus round · 5 extra moves · 20% lower score goal',
  help: 'New games: clears charge your profile. Tap when ready for 3 powered moves, without a timer. Choose upgrades every 3 stages; bonus rounds arrive every 5 stages. Chains finish at 8 links, keeping surviving power gems.',
  ranking: 'Fever rules · scores from different rule versions are not directly comparable.',
}
type Copy = typeof en
const ko: Copy = {
  rules: '피버 규칙', charge: n => `피버 ${n}%`, ready: '피버 · 누르기', active: n => `피버 · ${n}회`,
  activate: '피버 사용: 다음 3회 성공한 교환마다 특수 보석이 생겨요. 시간 제한은 없어요.',
  charged: '피버 준비 · 프로필 누르기', started: '피버! 다음 3회 강화',
  chainFinish: '8연쇄 완성! 다음 수 준비',
  choose: '이번 게임의 강화 선택', confirm: '강화하고 다음 단계', tier: n => `${n}단계 강화`,
  upgrade: { blast: '대형 폭탄', stripe: '넓은 줄 폭발', echo: '컬러 메아리' },
  detail: (u, tier) => ({ blast: `폭탄이 ${tier === 1 ? '5×5' : '7×7'}칸을 터뜨려요.`, stripe: `줄 보석이 인접한 ${tier + 1}줄을 터뜨려요.`,
    echo: `첫 특수 폭발에 목표 색 ${tier * 2}개를 더 없애요. 점수·특수 목표에서는 터진 보석 색을 따라가요.` })[u],
  bonus: { factory: '폭탄 공장', festival: '3색 축제', relay: '합체 릴레이' },
  bonusCue: { factory: '성공 교환 → 폭탄 +1', festival: '보석은 3색 · 연쇄 찬스', relay: '합체 → 새 특수 보석 한 쌍' },
  bonusDetail: { factory: '폭탄 3개로 시작해요. 성공한 교환마다 폭탄이 생겨요.', festival: '새로 떨어지는 보석까지 3색만 나와요.', relay: '특수 보석 3쌍으로 시작해요. 합체할 때마다 새 한 쌍이 생겨요.' },
  bonusPreview: '보너스 라운드 · 이동 +5회 · 목표 점수 20% 감소',
  help: '새 게임에서는 블록을 터뜨려 프로필의 피버를 채워요. 준비되면 프로필을 눌러 다음 3회 이동을 강화해요. 시간 제한은 없어요. 3단계마다 강화 선택, 5단계마다 보너스 라운드가 나와요. 연쇄는 한 번에 최대 8회로 마무리하고, 남은 특수 보석은 유지해요.',
  ranking: '피버 규칙 · 서로 다른 규칙의 점수는 직접 비교하기 어려워요.',
}
const ja: Copy = {
  rules: 'フィーバールール', charge: n => `フィーバー ${n}%`, ready: '発動 · タップ', active: n => `発動中 · ${n}手`,
  activate: 'フィーバー発動：次の3回の成功した交換で特殊ジェムを追加。時間制限なし。',
  charged: '準備完了 · 顔をタップ', started: 'フィーバー！次の3手を強化', choose: '今回の強化を選ぶ', confirm: '強化して次へ', tier: n => `強化 ${n}`,
  chainFinish: '8連鎖達成！次の手へ',
  upgrade: { blast: '大型爆弾', stripe: '広いライン', echo: 'カラーエコー' },
  detail: (u, tier) => ({ blast: `爆弾で${tier === 1 ? '5×5' : '7×7'}マス消去。`, stripe: `ラインで隣接する${tier + 1}列を消去。`, echo: `最初の特殊攻撃で目標色を最大${tier * 2}個追加消去。他の目標では攻撃の色。` })[u],
  bonus: { factory: '爆弾工場', festival: '3色祭り', relay: '合体リレー' },
  bonusCue: { factory: '成功交換 → 爆弾＋1', festival: '3色で連鎖チャンス', relay: '合体 → 新しい特殊ペア' },
  bonusDetail: { factory: '爆弾3個で開始。成功した交換ごとに爆弾を追加。', festival: '補充されるジェムも3色だけ。', relay: '特殊ジェム3組で開始。合体のたび新しい1組を追加。' },
  bonusPreview: 'ボーナス · 手数＋5 · 目標点20%減',
  help: '新しいゲームでは消去でフィーバーが充電。プロフィールをタップして次の3手を強化。時間制限なし。3ステージごとに強化、5ステージごとにボーナス。連鎖は最大8回で終了し、残った特殊ジェムは維持。',
  ranking: 'フィーバールール · 異なるルールの得点は直接比較できません。',
}
const zh: Copy = {
  rules: '狂热规则', charge: n => `狂热 ${n}%`, ready: '狂热 · 点击', active: n => `狂热 · ${n}步`,
  activate: '开启狂热：接下来3次成功交换均生成特殊宝石，无时间限制。', charged: '狂热就绪 · 点击头像', started: '狂热！强化接下来3步',
  chainFinish: '8次连锁完成！下一步就绪',
  choose: '选择本局强化', confirm: '强化并继续', tier: n => `强化${n}级`,
  upgrade: { blast: '大型炸弹', stripe: '宽幅条纹', echo: '颜色回声' },
  detail: (u, tier) => ({ blast: `炸弹清除${tier === 1 ? '5×5' : '7×7'}格。`, stripe: `条纹清除相邻${tier + 1}行或列。`, echo: `首次特殊爆炸额外清除最多${tier * 2}个目标色宝石。其他目标使用爆炸颜色。` })[u],
  bonus: { factory: '炸弹工厂', festival: '三色庆典', relay: '合体接力' },
  bonusCue: { factory: '成功交换 → 炸弹＋1', festival: '仅3色 · 连锁机会', relay: '合体 → 新的特殊宝石对' },
  bonusDetail: { factory: '开局3枚炸弹，每次成功交换再生成一枚。', festival: '包括补充宝石在内，仅有3种颜色。', relay: '开局3对特殊宝石。每次合体后再生成一对。' },
  bonusPreview: '奖励关 · 步数＋5 · 目标分数降低20%',
  help: '新游戏中消除可为头像充能。就绪后点击头像强化接下来3步，无时间限制。每3关选择强化，每5关进入奖励关。每次最多8次连锁，保留剩余特殊宝石。',
  ranking: '狂热规则 · 不同规则的分数无法直接比较。',
}
export const varietyCopy = (): Copy => ({ en, ko, ja, 'zh-Hans': zh })[language()]
