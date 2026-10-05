import { language } from '../i18n/index.ts'

const en = {
  remaining: 'Still to clear', scoreGoal: 'Points to go', powerGoal: 'Create power gems',
  points: 'points left', gems: 'gems left', powers: 'more to create', skip: 'Enter lobby now',
  skipNote: 'You can play while your 3D character loads.', saving: 'Saving…',
  supplies: (count: number) => `Every new run includes ${count} hammers, ${count} rockets and ${count} bombs. Items cost no moves.`,
  suppliedRules: 'Supplied items + fever', suppliedRanking: 'Supplied-item rules · scores from different rule versions are not directly comparable.',
  loadout: (limit: number) => `Optionally take up to ${limit} extra items from your stash.`,
  picked: (count: number, room: number) => `${count} extra selected · ${room} more available.`,
  full: (count: number) => `${count} extra selected · ready to play.`,
  rulesIntro: 'Swap neighbours. Match, create power gems, then combine them.',
  line: '3 in a line', lineNote: 'Clear matching gems.', square: '4 in a square', squareNote: 'Create a bomb. L, T and + work too.',
  fusion: 'Power + power', fusionNote: 'Swap adjacent power gems. Both fire for 1 move.',
  detailed: 'All rules & keyboard controls',
  scrollBoard: 'View all rows', scrollUp: 'View upper rows', scrollDown: 'View lower rows',
}
type Copy = typeof en
const ko: Copy = {
  remaining: '남은 목표', scoreGoal: '남은 목표 점수', powerGoal: '특수 보석 만들기',
  points: '점 남음', gems: '개 남음', powers: '개 더 만들기', skip: '로비 먼저 보기',
  skipNote: '3D 캐릭터를 기다리지 않고 게임을 시작할 수 있어요.', saving: '저장 중…',
  supplies: count => `매 새 게임에 망치·로켓·폭탄을 각각 ${count}개 지급해요. 아이템은 이동 횟수를 쓰지 않아요.`,
  suppliedRules: '기본 아이템 + 피버', suppliedRanking: '기본 아이템 지급 규칙 · 서로 다른 규칙의 점수는 직접 비교할 수 없어요.',
  loadout: limit => `보관함의 추가 아이템을 최대 ${limit}개 선택할 수 있어요. 선택하지 않아도 시작할 수 있어요.`,
  picked: (count, room) => `추가 ${count}개 선택 · ${room}개 더 담을 수 있어요.`,
  full: count => `추가 ${count}개 선택 · 이제 시작해볼까요?`,
  rulesIntro: '이웃한 보석을 바꿔서 맞추고, 특수 보석을 만들어 합체해요.',
  line: '일자로 3개', lineNote: '같은 보석을 없애요.', square: '네모로 4개', squareNote: '폭탄이 생겨요. L·T·+도 가능해요.',
  fusion: '특수 보석 + 특수 보석', fusionNote: '이웃한 특수 보석을 바꾸면 이동 1회로 둘 다 터져요.',
  detailed: '전체 규칙과 키보드 조작', scrollBoard: '위아래 줄 보기', scrollUp: '위쪽 줄 보기', scrollDown: '아래쪽 줄 보기',
}
const ja: Copy = {
  remaining: '残りの目標', scoreGoal: '残りポイント', powerGoal: '特殊ジェムを作る',
  points: 'ポイント残り', gems: '個残り', powers: '個作ろう', skip: '先にロビーへ',
  skipNote: '3Dの読み込みを待たずにプレイできます。', saving: '保存中…',
  supplies: count => `新しいゲームにはハンマー・ロケット・爆弾が各${count}個。アイテムは手数を使いません。`,
  suppliedRules: '初期アイテム＋フィーバー', suppliedRanking: '初期アイテムルール · 異なるルールのスコアは直接比較できません。',
  loadout: limit => `任意で保管庫から追加アイテムを最大${limit}個選べます。`,
  picked: (count, room) => `追加${count}個選択 · あと${room}個選べます。`, full: count => `追加${count}個選択 · 準備完了。`,
  rulesIntro: '隣を入れ替え、揃えて特殊ジェムを作り、合体させよう。',
  line: '一列に3個', lineNote: '同じジェムを消す。', square: '四角に4個', squareNote: '爆弾を作る。L・T・＋でもOK。',
  fusion: '特殊＋特殊', fusionNote: '隣り合う特殊ジェムを交換。1手で両方発動。',
  detailed: '全ルールとキー操作', scrollBoard: '全行を表示', scrollUp: '上の行を表示', scrollDown: '下の行を表示',
}
const zh: Copy = {
  remaining: '剩余目标', scoreGoal: '剩余目标分数', powerGoal: '生成特殊宝石',
  points: '分剩余', gems: '个剩余', powers: '个待生成', skip: '先进入大厅',
  skipNote: '无需等待3D角色加载即可开始游戏。', saving: '正在保存…',
  supplies: count => `每局新游戏提供锤子、火箭和炸弹各${count}个。道具不消耗步数。`,
  suppliedRules: '初始道具＋狂热', suppliedRanking: '初始道具规则 · 不同规则的分数不能直接比较。',
  loadout: limit => `可以从库存额外选择最多${limit}个道具，也可以直接开始。`,
  picked: (count, room) => `额外选${count}个 · 还可选${room}个。`, full: count => `额外选${count}个 · 准备开始。`,
  rulesIntro: '交换相邻宝石，匹配生成特殊宝石，再将它们合体。',
  line: '一排3个', lineNote: '消除相同宝石。', square: '方块4个', squareNote: '生成炸弹。L、T、＋形也可以。',
  fusion: '特殊＋特殊', fusionNote: '交换相邻特殊宝石，消耗1步让两者同时发动。',
  detailed: '全部规则与键盘操作', scrollBoard: '查看所有行', scrollUp: '查看上方', scrollDown: '查看下方',
}
export const experienceCopy = (): Copy => ({ en, ko, ja, 'zh-Hans': zh })[language()]
