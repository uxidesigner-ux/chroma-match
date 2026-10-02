import { language } from '../i18n/index.ts'

const en = {
  wardrobe: 'Wardrobe', top: 'Top', bottom: 'Bottom', shoes: 'Shoes',
  original: 'Original outfit', note: 'Choose each piece. Save applies the outfit to your character.',
  roundShort: 'Round neck · short sleeves', roundLong: 'Round neck · long sleeves',
  vShort: 'V neck · short sleeves', vLong: 'V neck · long sleeves',
  trousers: 'Trousers', shorts: 'Shorts', skirtLong: 'Long skirt', skirtShort: 'Short skirt',
  basketball: 'High-top sneakers', dress: 'Dress shoes', heels: 'Heels', bare: 'Barefoot',
  topColour: 'Top colour', bottomColour: 'Bottom colour', shoeColour: 'Shoe colour',
}
type Copy = Record<keyof typeof en, string>
const ko: Copy = {
  wardrobe: '의상', top: '상의', bottom: '하의', shoes: '신발',
  original: '기본 의상으로', note: '상의·하의·신발을 골라 주세요. 저장하면 캐릭터에 반영돼요.',
  roundShort: '라운드넥 · 반팔', roundLong: '라운드넥 · 긴팔',
  vShort: 'V넥 · 반팔', vLong: 'V넥 · 긴팔',
  trousers: '긴바지', shorts: '반바지', skirtLong: '긴치마', skirtShort: '짧은치마',
  basketball: '하이탑 운동화', dress: '구두', heels: '하이힐', bare: '맨발',
  topColour: '상의 색상', bottomColour: '하의 색상', shoeColour: '신발 색상',
}
const ja: Copy = {
  wardrobe: '衣装', top: 'トップス', bottom: 'ボトムス', shoes: '靴',
  original: '元の衣装に戻す', note: 'トップス・ボトムス・靴を選択。保存するとキャラクターに反映されます。',
  roundShort: '丸首・半袖', roundLong: '丸首・長袖', vShort: 'Vネック・半袖', vLong: 'Vネック・長袖',
  trousers: '長ズボン', shorts: 'ショートパンツ', skirtLong: 'ロングスカート', skirtShort: 'ミニスカート',
  basketball: 'ハイカットスニーカー', dress: '革靴', heels: 'ヒール', bare: '裸足',
  topColour: 'トップスの色', bottomColour: 'ボトムスの色', shoeColour: '靴の色',
}
const zh: Copy = {
  wardrobe: '服装', top: '上装', bottom: '下装', shoes: '鞋子',
  original: '恢复原始服装', note: '选择上装、下装和鞋子。保存后应用到角色。',
  roundShort: '圆领 · 短袖', roundLong: '圆领 · 长袖', vShort: 'V领 · 短袖', vLong: 'V领 · 长袖',
  trousers: '长裤', shorts: '短裤', skirtLong: '长裙', skirtShort: '短裙',
  basketball: '高帮运动鞋', dress: '皮鞋', heels: '高跟鞋', bare: '赤脚',
  topColour: '上装颜色', bottomColour: '下装颜色', shoeColour: '鞋子颜色',
}
export function wardrobeCopy(): Copy { return { en, ko, ja, 'zh-Hans': zh }[language()] }
