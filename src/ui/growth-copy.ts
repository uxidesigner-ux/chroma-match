import { language } from '../i18n/index.ts'
import type { Cosmetic } from '../player/model.ts'
type Copy = {
  level: string; next: string; local: string; stats: string; adventure: string; free: string;
  lifetime: string; recent: string; rounds: string; used: string; average: string; chain: string;
  created: string; fusions: string; noItems: string; cosmetics: string; basic: string; reset: string;
  resetConfirm: string; cancel: string; saveError: string; saving: string; retry: string;
  fullMap: string; focus: string; zoomIn: string; zoomOut: string; move: string;
  names: Record<Cosmetic, string>;
}
const en: Copy = {
  level: 'Player level', next: 'Next reward', local: 'This device · growth & play records', stats: 'My play',
  adventure: 'Adventure', free: 'Free play', lifetime: 'All time', recent: 'Recent 20', rounds: 'rounds',
  used: 'Items used', average: 'Items / round', chain: 'Best chain', created: 'Powers made', fusions: 'Power fusions', noItems: 'Item-free clears',
  cosmetics: 'My collection', basic: 'Original', reset: 'Reset play records', resetConfirm: 'Reset play records only? Your level, coins, map and character stay.',
  cancel: 'Cancel', saveError: 'Could not save. Your previous progress is safe.', saving: 'Saving…', retry: 'Retry save',
  fullMap: 'World', focus: 'Current stage', zoomIn: 'Zoom in', zoomOut: 'Zoom out', move: 'Move map',
  names: { leaf: 'Forest frame', spark: 'Spark maker', crystal: 'Crystal frame', explorer: 'Isle explorer', crown: 'Crown frame' },
}
const ko: Copy = {
  level: '플레이어 레벨', next: '다음 보상', local: '이 기기 · 성장과 플레이 기록', stats: '내 플레이',
  adventure: '모험', free: '자유', lifetime: '누적', recent: '최근 20판', rounds: '판',
  used: '아이템 사용', average: '판당 사용', chain: '최고 연쇄', created: '직접 만든 특수', fusions: '특수 합체', noItems: '무아이템 클리어',
  cosmetics: '내 컬렉션', basic: '기본', reset: '플레이 기록 초기화', resetConfirm: '플레이 기록만 초기화할까요? 레벨·코인·지도·캐릭터는 유지돼요.',
  cancel: '취소', saveError: '저장하지 못했어요. 이전 진행은 유지돼요.', saving: '저장 중…', retry: '저장 재시도',
  fullMap: '전체 지도', focus: '현재 스테이지', zoomIn: '확대', zoomOut: '축소', move: '지도 이동',
  names: { leaf: '숲의 프레임', spark: '반짝임을 만드는 자', crystal: '크리스탈 프레임', explorer: '섬 탐험가', crown: '왕관 프레임' },
}
const ja: Copy = { ...en, level: 'プレイヤーレベル', next: '次の報酬', local: 'この端末・成長とプレイ記録', stats: 'マイプレイ',
  adventure: '冒険', free: '自由', lifetime: '累計', recent: '最近20回', rounds: '回', used: 'アイテム使用', average: '1回の平均',
  chain: '最高連鎖', created: '作った特殊', fusions: '特殊合体', noItems: 'アイテムなしクリア', cosmetics: 'コレクション', basic: '標準',
  reset: 'プレイ記録をリセット', resetConfirm: 'プレイ記録のみリセット？レベル・コイン・マップ・キャラクターは保持。',
  cancel: 'キャンセル', saveError: '保存できません。以前の進行は保持しています。', saving: '保存中…', retry: '保存を再試行',
  fullMap: '全体マップ', focus: '現在のステージ', zoomIn: '拡大', zoomOut: '縮小', move: 'マップ移動',
  names: { leaf: '森のフレーム', spark: '輝きの作り手', crystal: 'クリスタル', explorer: '島の探検家', crown: '王冠' } }
const zh: Copy = { ...en, level: '玩家等级', next: '下个奖励', local: '本设备 · 成长与游戏记录', stats: '我的游戏',
  adventure: '冒险', free: '自由', lifetime: '累计', recent: '最近20局', rounds: '局', used: '道具使用', average: '每局平均',
  chain: '最高连锁', created: '制造特殊宝石', fusions: '特殊合体', noItems: '无道具通关', cosmetics: '我的收藏', basic: '默认',
  reset: '重置游戏记录', resetConfirm: '仅重置游戏记录？等级、金币、地图、角色将保留。', cancel: '取消',
  saveError: '无法保存。之前的进度已保留。', saving: '保存中…', retry: '重试保存', fullMap: '全图', focus: '当前关卡',
  zoomIn: '放大', zoomOut: '缩小', move: '移动地图',
  names: { leaf: '森林相框', spark: '闪光创造者', crystal: '水晶相框', explorer: '岛屿探险家', crown: '皇冠相框' } }
export function growthCopy(): Copy { return language() === 'ko' ? ko : language() === 'ja' ? ja : language() === 'zh-Hans' ? zh : en }
