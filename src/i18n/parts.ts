import { language } from './index.ts'
import type { LanguageId } from './index.ts'

/**
 * The names of the things an avatar is made of.
 *
 * Kept apart from the interface strings because they are a different kind of
 * text: the interface has a fixed set of sentences, while this grows every time
 * somebody adds a hairstyle, and a catalogue that outgrows its translations
 * should fall back to the English name rather than refuse to build.
 *
 * Keys are slot-prefixed. They have to be: `sand` is both a skin tone and a
 * backdrop, and an id-only key would have one of them silently naming the
 * other.
 */
const EN_PARTS = {
  'backdrop.slate': 'Slate',
  'backdrop.sand': 'Sand',
  'backdrop.rose': 'Rose',
  'backdrop.sage': 'Sage',
  'backdrop.cream': 'Cream',
  'backdrop.lilac': 'Lilac',
  'backdrop.mint': 'Mint',
  'backdrop.clay': 'Clay',

  'skin.porcelain': 'Porcelain',
  'skin.sand': 'Sand',
  'skin.honey': 'Honey',
  'skin.amber': 'Amber',
  'skin.umber': 'Umber',
  'skin.espresso': 'Espresso',

  'hair.crop': 'Crop',
  'hair.curls': 'Curls',
  'hair.buzz': 'Buzz',
  'hair.bob': 'Bob',
  'hair.long': 'Long',
  'hair.wave': 'Waves',
  'hair.bun': 'Bun',
  'hair.none': 'None',

  'hairColour.ink': 'Ink',
  'hairColour.cocoa': 'Cocoa',
  'hairColour.chestnut': 'Chestnut',
  'hairColour.auburn': 'Auburn',
  'hairColour.wheat': 'Wheat',
  'hairColour.silver': 'Silver',
  'hairColour.rosewood': 'Rosewood',
  'hairColour.violet': 'Violet',

  'outfit.collar': 'Shirt',
  'outfit.turtle': 'Turtleneck',

  'outfitColour.chalk': 'Chalk',
  'outfitColour.charcoal': 'Charcoal',
  'outfitColour.navy': 'Navy',
  'outfitColour.sky': 'Sky',
  'outfitColour.moss': 'Moss',
  'outfitColour.rust': 'Rust',
  'outfitColour.plum': 'Plum',
  'outfitColour.butter': 'Butter',

  'accessory.none': 'None',
  'accessory.square': 'Square frames',
  'accessory.round': 'Round frames',
  'accessory.studs': 'Studs',
  'accessory.roundStuds': 'Frames and studs',

  'build.slim': 'Slim',
  'build.average': 'Average',
  'build.broad': 'Broad',

  'bottom.trousers': 'Trousers',
  'bottom.wide': 'Wide leg',
  'bottom.shorts': 'Shorts',
  'bottom.skirt': 'Skirt',

  'outer.none': 'None',
  'outer.jacket': 'Jacket',
  'outer.hoodie': 'Hoodie',
  'outer.coat': 'Coat',

  'shoes.sneaker': 'Trainers',
  'shoes.boot': 'Boots',
  'shoes.bare': 'Barefoot',

  'outfit.crew': 'Tee',
  'outfit.blazer': 'Long sleeve',
  'outfit.tie': 'Polo',
  'outfit.hoodie': 'Sweatshirt',

} as const

type PartKey = keyof typeof EN_PARTS
type PartNames = Record<PartKey, string>

const KO_PARTS: PartNames = {
  'backdrop.slate': '슬레이트',
  'backdrop.sand': '모래',
  'backdrop.rose': '로즈',
  'backdrop.sage': '세이지',
  'backdrop.cream': '크림',
  'backdrop.lilac': '라일락',
  'backdrop.mint': '민트',
  'backdrop.clay': '클레이',

  'skin.porcelain': '아주 밝은',
  'skin.sand': '밝은',
  'skin.honey': '중간',
  'skin.amber': '중간 어두운',
  'skin.umber': '어두운',
  'skin.espresso': '아주 어두운',

  'hair.crop': '가르마 숏',
  'hair.curls': '곱슬',
  'hair.buzz': '스포츠머리',
  'hair.bob': '단발',
  'hair.long': '긴 생머리',
  'hair.wave': '웨이브 롱',
  'hair.bun': '묶은 머리',
  'hair.none': '없음',

  'hairColour.ink': '블랙',
  'hairColour.cocoa': '다크 브라운',
  'hairColour.chestnut': '브라운',
  'hairColour.auburn': '적갈색',
  'hairColour.wheat': '금발',
  'hairColour.silver': '실버',
  'hairColour.rosewood': '로즈',
  'hairColour.violet': '바이올렛',

  'outfit.collar': '셔츠',
  'outfit.turtle': '터틀넥',

  'outfitColour.chalk': '화이트',
  'outfitColour.charcoal': '차콜',
  'outfitColour.navy': '네이비',
  'outfitColour.sky': '스카이블루',
  'outfitColour.moss': '올리브',
  'outfitColour.rust': '테라코타',
  'outfitColour.plum': '플럼',
  'outfitColour.butter': '버터옐로',

  'accessory.none': '없음',
  'accessory.square': '사각 안경',
  'accessory.round': '동그란 안경',
  'accessory.studs': '귀걸이',
  'accessory.roundStuds': '안경과 귀걸이',

  'build.slim': '마른 체형',
  'build.average': '보통 체형',
  'build.broad': '다부진 체형',

  'bottom.trousers': '일자 바지',
  'bottom.wide': '와이드 팬츠',
  'bottom.shorts': '반바지',
  'bottom.skirt': '스커트',

  'outer.none': '없음',
  'outer.jacket': '재킷',
  'outer.hoodie': '후드집업',
  'outer.coat': '코트',

  'shoes.sneaker': '운동화',
  'shoes.boot': '부츠',
  'shoes.bare': '맨발',

  'outfit.crew': '반팔 티셔츠',
  'outfit.blazer': '긴팔 티셔츠',
  'outfit.tie': '카라 티셔츠',
  'outfit.hoodie': '맨투맨',

}

const JA_PARTS: PartNames = {
  'backdrop.slate': 'スレート',
  'backdrop.sand': 'サンド',
  'backdrop.rose': 'ローズ',
  'backdrop.sage': 'セージ',
  'backdrop.cream': 'クリーム',
  'backdrop.lilac': 'ライラック',
  'backdrop.mint': 'ミント',
  'backdrop.clay': 'クレー',

  'skin.porcelain': 'とても明るい',
  'skin.sand': '明るい',
  'skin.honey': 'ふつう',
  'skin.amber': 'やや暗い',
  'skin.umber': '暗い',
  'skin.espresso': 'とても暗い',

  'hair.crop': '分け目ショート',
  'hair.curls': 'カール',
  'hair.buzz': 'ベリーショート',
  'hair.bob': 'ボブ',
  'hair.long': 'ロングストレート',
  'hair.wave': 'ウェーブロング',
  'hair.bun': 'まとめ髪',
  'hair.none': 'なし',

  'hairColour.ink': 'ブラック',
  'hairColour.cocoa': 'ダークブラウン',
  'hairColour.chestnut': 'ブラウン',
  'hairColour.auburn': 'アッシュレッド',
  'hairColour.wheat': 'ブロンド',
  'hairColour.silver': 'シルバー',
  'hairColour.rosewood': 'ローズ',
  'hairColour.violet': 'バイオレット',

  'outfit.collar': 'シャツ',
  'outfit.turtle': 'タートルネック',

  'outfitColour.chalk': 'ホワイト',
  'outfitColour.charcoal': 'チャコール',
  'outfitColour.navy': 'ネイビー',
  'outfitColour.sky': 'スカイブルー',
  'outfitColour.moss': 'オリーブ',
  'outfitColour.rust': 'テラコッタ',
  'outfitColour.plum': 'プラム',
  'outfitColour.butter': 'バターイエロー',

  'accessory.none': 'なし',
  'accessory.square': 'スクエア眼鏡',
  'accessory.round': '丸眼鏡',
  'accessory.studs': 'ピアス',
  'accessory.roundStuds': '眼鏡とピアス',

  'build.slim': '細め',
  'build.average': 'ふつう',
  'build.broad': 'がっしり',

  'bottom.trousers': 'パンツ',
  'bottom.wide': 'ワイドパンツ',
  'bottom.shorts': 'ショートパンツ',
  'bottom.skirt': 'スカート',

  'outer.none': 'なし',
  'outer.jacket': 'ジャケット',
  'outer.hoodie': 'パーカー',
  'outer.coat': 'コート',

  'shoes.sneaker': 'スニーカー',
  'shoes.boot': 'ブーツ',
  'shoes.bare': 'はだし',

  'outfit.crew': '半袖Tシャツ',
  'outfit.blazer': '長袖Tシャツ',
  'outfit.tie': 'ポロシャツ',
  'outfit.hoodie': 'トレーナー',

}

const ZH_PARTS: PartNames = {
  'backdrop.slate': '石板灰',
  'backdrop.sand': '沙色',
  'backdrop.rose': '玫瑰',
  'backdrop.sage': '鼠尾草',
  'backdrop.cream': '奶油',
  'backdrop.lilac': '丁香紫',
  'backdrop.mint': '薄荷',
  'backdrop.clay': '陶土',

  'skin.porcelain': '很浅',
  'skin.sand': '浅',
  'skin.honey': '中等',
  'skin.amber': '偏深',
  'skin.umber': '深',
  'skin.espresso': '很深',

  'hair.crop': '偏分短发',
  'hair.curls': '卷发',
  'hair.buzz': '寸头',
  'hair.bob': '波波头',
  'hair.long': '长直发',
  'hair.wave': '长卷发',
  'hair.bun': '丸子头',
  'hair.none': '无',

  'hairColour.ink': '黑色',
  'hairColour.cocoa': '深棕',
  'hairColour.chestnut': '棕色',
  'hairColour.auburn': '红棕',
  'hairColour.wheat': '金色',
  'hairColour.silver': '银色',
  'hairColour.rosewood': '玫瑰色',
  'hairColour.violet': '紫罗兰',

  'outfit.collar': '衬衫',
  'outfit.turtle': '高领',

  'outfitColour.chalk': '白色',
  'outfitColour.charcoal': '炭灰',
  'outfitColour.navy': '藏青',
  'outfitColour.sky': '天蓝',
  'outfitColour.moss': '橄榄绿',
  'outfitColour.rust': '陶红',
  'outfitColour.plum': '梅紫',
  'outfitColour.butter': '奶黄',

  'accessory.none': '无',
  'accessory.square': '方框眼镜',
  'accessory.round': '圆框眼镜',
  'accessory.studs': '耳钉',
  'accessory.roundStuds': '眼镜配耳钉',

  'build.slim': '偏瘦',
  'build.average': '标准',
  'build.broad': '健壮',

  'bottom.trousers': '直筒裤',
  'bottom.wide': '阔腿裤',
  'bottom.shorts': '短裤',
  'bottom.skirt': '半身裙',

  'outer.none': '无',
  'outer.jacket': '夹克',
  'outer.hoodie': '连帽外套',
  'outer.coat': '大衣',

  'shoes.sneaker': '运动鞋',
  'shoes.boot': '靴子',
  'shoes.bare': '赤脚',

  'outfit.crew': '短袖T恤',
  'outfit.blazer': '长袖T恤',
  'outfit.tie': 'POLO衫',
  'outfit.hoodie': '卫衣',

}

const TABLES: Record<LanguageId, PartNames> = {
  en: EN_PARTS,
  ko: KO_PARTS,
  ja: JA_PARTS,
  'zh-Hans': ZH_PARTS,
}

/**
 * A part's name in the current language.
 *
 * Falls back to the name on the part itself, so a part added to the catalogue
 * before anyone has translated it shows its English name rather than its key —
 * which is the difference between an untranslated option and a broken one.
 */
export function partName(slot: string, id: string, fallback: string): string {
  const key = `${slot}.${id}` as PartKey
  const table = TABLES[language()] ?? EN_PARTS
  return table[key] ?? EN_PARTS[key] ?? fallback
}
