import { language } from '../i18n/index.ts'
import { WORLD_MISSIONS, missionMode, type Region, type Mission } from '../game/campaign.ts'
import { varietyCopy } from './variety-copy.ts'

type Copy = {
  world: string; map: string; character: string; explore: string; missions: string;
  play: string; replay: string; free: string; complete: string; available: string; locked: string;
  unlock: string; previous: string; list: string; supplies: string; reward: string;
  moves: string; first: string; cleared: string; next: string; back: string; retry: string;
  failed: string; retryNote: string; saved: string; replayNote: string; storage: string;
  invalid: string; chapterDone: string; progress: string; loading: string; loadingNote: string; required: string;
  regions: Record<Region, string>; rules: Record<Region, string>; titles: Record<Region, readonly string[]>;
}
const en: Copy = {
  world: 'Chroma Isles', map: 'Map', character: 'Character', explore: 'Choose your adventure', missions: 'Missions',
  play: 'Play', replay: 'Replay', free: 'Free play', complete: 'Cleared', available: 'Ready', locked: 'Locked',
  unlock: 'Clear Gem Forest mission 1 to open this region.', previous: 'Clear the previous mission to continue.',
  list: 'Region list', supplies: '3 of every item · no move cost', reward: 'First-clear coins', moves: 'moves',
  first: 'First clear', cleared: 'Mission cleared!', next: 'Next mission', back: 'Back to map', retry: 'Try again',
  failed: 'One more adventure?', retryNote: 'No progress is lost. Try a different match or use your starting items.',
  saved: 'Progress saved on this device.', replayNote: 'Already cleared. Replay freely; first-clear coins are awarded once.',
  storage: 'Storage is unavailable. Progress lasts this visit only; no first-clear coins were paid.',
  invalid: 'This result could not be verified. Your previous progress is safe.',
  chapterDone: 'All 20 missions cleared! Revisit any region or enjoy free play.', progress: 'cleared',
  loading: 'Preparing your map…', loadingNote: 'Your 3D character is available in Character.',
  required: 'Clear {mission}',
  regions: { forest: 'Gem Forest', volcano: 'Blast Volcano', prism: 'Prism Coast', relay: 'Relay City' },
  rules: { forest: 'Match lines and squares. Make power gems, then combine them.',
    volcano: 'Start with bombs. Every valid swap supplies another bomb.',
    prism: 'Only 3 colours. Build long cascades and charge your fever.',
    relay: 'Start with 3 power pairs. Each fusion supplies a new adjacent pair.' },
  titles: { forest: ['First sparks', 'Blue harvest', 'Square artisan', 'Red trail', 'Heart of the forest'],
    volcano: ['Ignition', 'Lava current', 'Bomb smith', 'Lava core', 'Eruption'],
    prism: ['Light path', 'Emerald tide', 'Refraction', 'Golden ripple', 'Prism heart'],
    relay: ['First fusion', 'Blue circuit', 'Assembly line', 'Red relay', 'The mainspring'] },
}
const ko: Copy = {
  world: '크로마 아일즈', map: '지도', character: '캐릭터', explore: '오늘은 어디로 떠날까요?', missions: '미션',
  play: '플레이', replay: '재도전', free: '자유 플레이', complete: '완료', available: '도전 가능', locked: '잠김',
  unlock: '보석숲 1번 미션을 깨면 이 지역이 열려요.', previous: '이전 미션을 완료하면 열려요.',
  list: '지역 목록', supplies: '아이템 각각 3개 · 이동 횟수 차감 없음', reward: '첫 클리어 코인', moves: '회 이동',
  first: '첫 클리어', cleared: '미션 클리어!', next: '다음 미션', back: '지도로 돌아가기', retry: '다시 도전',
  failed: '한 번 더 떠나볼까요?', retryNote: '완료한 미션은 그대로예요. 다른 조합이나 기본 아이템을 활용해보세요.',
  saved: '이 기기에 진행 상황을 저장했어요.', replayNote: '이미 완료한 미션이에요. 다시 즐길 수 있으며 첫 클리어 코인은 한 번만 지급해요.',
  storage: '저장 공간을 사용할 수 없어요. 이번 방문 동안만 진행이 유지되며 첫 클리어 코인은 지급하지 않았어요.',
  invalid: '결과를 검증하지 못했어요. 이전 진행 상황은 유지돼요.',
  chapterDone: '20개 미션 모두 완료! 좋아하는 지역에 다시 도전하거나 자유 플레이를 즐겨보세요.', progress: '완료',
  loading: '지도를 준비하고 있어요…', loadingNote: '전신 3D 캐릭터는 캐릭터 화면에서 만나요.',
  required: '{mission} 완료 필요',
  regions: { forest: '보석숲', volcano: '폭발화산', prism: '프리즘해변', relay: '기계도시' },
  rules: { forest: '일자·네모로 맞추고 특수 보석을 만들어 합체해요.',
    volcano: '폭탄을 들고 시작! 유효한 교환마다 폭탄이 하나 더 생겨요.',
    prism: '보석은 3색만! 긴 연쇄로 터뜨리고 피버를 채워요.',
    relay: '특수 보석 3쌍으로 시작! 합체할 때마다 이웃한 한 쌍이 다시 생겨요.' },
  titles: { forest: ['첫 반짝임', '파랑 보석 수확', '네모 장인', '빨강 보석 길', '숲의 심장'],
    volcano: ['불꽃 점화', '용암의 흐름', '폭탄 대장장이', '용암 중심부', '대분화'],
    prism: ['빛의 길', '에메랄드 물결', '빛의 굴절', '황금빛 파도', '프리즘의 심장'],
    relay: ['첫 합체', '파랑 회로', '조립 라인', '빨강 릴레이', '태엽의 심장'] },
}
const ja: Copy = {
  world: 'クロマ諸島', map: 'マップ', character: 'キャラクター', explore: '冒険の行き先を選ぼう', missions: 'ミッション',
  play: 'プレイ', replay: '再挑戦', free: 'フリープレイ', complete: 'クリア', available: '挑戦可能', locked: 'ロック',
  unlock: '宝石の森のミッション1をクリアすると開放。', previous: '前のミッションをクリアすると開放。',
  list: '地域一覧', supplies: '各アイテム3個・手数消費なし', reward: '初クリアコイン', moves: '手',
  first: '初クリア', cleared: 'ミッションクリア！', next: '次のミッション', back: 'マップへ', retry: '再挑戦',
  failed: 'もう一度冒険しよう', retryNote: 'クリア済みの進行は保持。別の組み合わせや初期アイテムを試そう。',
  saved: 'この端末に進行を保存しました。', replayNote: 'クリア済み。何度でも遊べますが初クリアコインは一度だけ。',
  storage: '保存できません。進行は今回の訪問のみ保持し、初クリアコインは支払っていません。',
  invalid: '結果を検証できません。以前の進行は保持しています。',
  chapterDone: '全20ミッション達成！好きな地域やフリープレイを楽しもう。', progress: 'クリア',
  loading: 'マップを準備中…', loadingNote: '全身3Dはキャラクター画面で確認できます。',
  required: '{mission}のクリアが必要',
  regions: { forest: '宝石の森', volcano: '爆発火山', prism: 'プリズム海岸', relay: '機械都市' },
  rules: { forest: '列や四角を揃えて特殊ジェムを作り、合体させよう。', volcano: '爆弾で開始。有効な交換ごとに爆弾を追加。',
    prism: '3色のみ。長い連鎖で消し、フィーバーをチャージ。', relay: '特殊ジェム3組で開始。合体ごとに隣接する1組を追加。' },
  titles: { forest: ['最初の輝き', '青の収穫', '四角の職人', '赤い道', '森の心'],
    volcano: ['点火', '溶岩の流れ', '爆弾職人', '溶岩の核', '大噴火'],
    prism: ['光の道', '緑の潮', '屈折', '金色の波', 'プリズムの心'],
    relay: ['最初の合体', '青い回路', '組立ライン', '赤いリレー', 'ぜんまいの心'] },
}
const zh: Copy = {
  world: '克罗马群岛', map: '地图', character: '角色', explore: '选择今天的冒险', missions: '任务',
  play: '开始', replay: '再挑战', free: '自由模式', complete: '已完成', available: '可挑战', locked: '未解锁',
  unlock: '完成宝石森林任务1即可解锁。', previous: '完成前一个任务即可解锁。',
  list: '地区列表', supplies: '每种道具3个 · 不消耗步数', reward: '首次通关金币', moves: '步',
  first: '首次通关', cleared: '任务完成！', next: '下一个任务', back: '返回地图', retry: '再次挑战',
  failed: '再来一次冒险？', retryNote: '已完成的进度保留。尝试其他组合或使用初始道具。',
  saved: '进度已保存到本设备。', replayNote: '已通关。可以重复挑战，但首次通关金币只发放一次。',
  storage: '无法保存。进度仅在本次访问保留，未发放首次通关金币。', invalid: '无法验证结果，之前的进度仍保留。',
  chapterDone: '20个任务全部完成！重游喜欢的地区或体验自由模式。', progress: '已完成',
  loading: '正在准备地图…', loadingNote: '完整3D角色可在角色页面查看。',
  required: '需完成{mission}',
  regions: { forest: '宝石森林', volcano: '爆发火山', prism: '棱镜海岸', relay: '机械城市' },
  rules: { forest: '匹配直线或方块，生成特殊宝石并合体。', volcano: '以炸弹开始，每次有效交换再提供一个炸弹。',
    prism: '只有3种颜色。用长连锁消除并充满狂热。', relay: '以3对特殊宝石开始，每次合体再提供相邻的一对。' },
  titles: { forest: ['最初的闪光', '蓝色收获', '方块工匠', '红色小径', '森林之心'],
    volcano: ['点火', '熔岩流', '炸弹工匠', '熔岩核心', '大爆发'],
    prism: ['光之路', '翡翠潮', '折射', '金色波纹', '棱镜之心'],
    relay: ['首次合体', '蓝色电路', '装配线', '红色接力', '发条之心'] },
}
export function worldCopy(): Copy {
  return ({ en, ko, ja, 'zh-Hans': zh })[language()] ?? en
}
export function missionTitle(m: Mission): string {
  const named = worldCopy().titles[m.region][m.step - 1]
  if (named) return named
  const mode = missionMode(m)
  return mode ? varietyCopy().bonus[mode] : worldCopy().regions[m.region]
}
export function missionCaption(m: Mission): string { return `${worldCopy().regions[m.region]} · ${m.step}/${WORLD_MISSIONS.filter(a => a.region === m.region).length} · ${missionTitle(m)}` }
